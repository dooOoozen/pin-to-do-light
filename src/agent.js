/* The agent: language in, drafts out, and no write without a confirmation.
   ===================================================================
   Three rules shape everything below, and each exists because the
   alternative failed somewhere else:

   1. THE MODEL NEVER COMPUTES A DATE. It returns the surface form the user
      said ("下周二", "晚上") and a clock time ("14:00"); `src/shared/nlp.js`
      — 281 lines already tested against 明天/下周三/农历/中文数字 — turns
      those into timestamps. A model asked for an ISO date will produce one
      that is confidently, quietly wrong by a day, and a schedule app has no
      worse failure than that.
   2. THE AGENT HAS NO WRITE PATH OF ITS OWN. Its output is drafts; the ops
      that eventually run are the same `todo:add` / `todo:update` the UI
      fires, from the UI, after the user confirms. There is deliberately no
      `delete`, no `settings:update` and no `data:reset` in the tool list —
      this app keeps one plaintext store with no backup, so a model cannot
      be given a way to empty it.
   3. EVERY TURN IS RECORDED. `Agent.trace` holds the stages of the last
      turns — what was sent, what came back, which tool was chosen, what the
      resolver produced, what the user changed — because "the AI misbehaved"
      is unfixable without it, and it is the raw material of the eval set.

   Provider shape: one OpenAI-compatible /chat/completions. `tool_choice` is
   never sent — Ollama's compatibility endpoint does not accept it, and
   relying on forced calling would make the local case fail — so a reply with
   no tool calls is a normal branch: nudge once, then fall back to the local
   parser rather than showing the user a chat answer they did not ask for. */
(function (root) {
  'use strict';

  var API = root.API;

  var PRIORITY = ['none', 'low', 'med', 'high'];
  var MAX_DRAFTS = 12;
  var MAX_TITLE = 120;

  /* ---------------------------------------------------------------- tools */

  var TOOLS = [
    {
      type: 'function',
      function: {
        name: 'suggest_tasks',
        description: '提出一到多条新任务草稿。不会立即写入，用户会先看到并可修改。',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: '一句话说明为什么这样安排' },
            drafts: {
              type: 'array',
              maxItems: MAX_DRAFTS,
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', maxLength: MAX_TITLE },
                  dateText: { type: 'string', description: '用户说法原样，例如「下周二」「本周五」「明天」；不要换算成日期数字' },
                  clockText: { type: 'string', description: '24 小时制钟点，例如「14:00」；用户没说就留空' },
                  durationMinutes: { type: 'integer', minimum: 5, maximum: 480 },
                  repeat: { type: 'string', enum: ['none', 'daily', 'weekly', 'monthly', 'yearly', 'lunarYearly'] },
                  priority: { type: 'string', enum: PRIORITY },
                  groupHint: { type: 'string', description: '必须是上下文里给出的分组名之一' },
                  notes: { type: 'string', maxLength: 500 }
                },
                required: ['title']
              }
            }
          },
          required: ['drafts']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'suggest_changes',
        description: '修改已有任务的安排（例如把某天的行程整体推后）。id 必须来自上下文里的任务列表。',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
            updates: {
              type: 'array',
              maxItems: MAX_DRAFTS,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: '上下文任务列表里的 id' },
                  dateText: { type: 'string' },
                  clockText: { type: 'string' },
                  title: { type: 'string', maxLength: MAX_TITLE },
                  done: { type: 'boolean' }
                },
                required: ['id']
              }
            }
          },
          required: ['updates']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ask_user',
        description: '缺少必要信息时向用户提一个选择题。不要用它闲聊。',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string', maxLength: 120 },
            slot: { type: 'string', enum: ['dateText', 'clockText', 'title', 'durationMinutes'] },
            options: { type: 'array', maxItems: 6, items: { type: 'string' } }
          },
          required: ['question']
        }
      }
    }
  ];

  /* A whitelist, not a filter: a name the model invents is dropped and recorded,
     never executed. */
  var ALLOWED = { suggest_tasks: 1, suggest_changes: 1, ask_user: 1 };

  /* ---------------------------------------------------------------- prompts */

  var WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function humanNow(now) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' +
      WEEKDAY[now.getDay()] + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
  }

  /* The list has to be written in the same words the user speaks. A small model shown four
     identical 「面试」 rows stamped 2026-09-26 cannot tell which one "明天的面试" means, so it
     asks — and asks again every time it is answered. Stamped with the day it falls on, the
     row matches the sentence by itself. */
  function relWhen(iso, now) {
    if (!iso) return '无日期';
    var d = new Date(iso);
    if (isNaN(d)) return '无日期';
    var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var off = Math.round((a - b) / 864e5);
    var name = off === 0 ? '今天' : off === 1 ? '明天' : off === 2 ? '后天' : off === 3 ? '大后天'
      : off === -1 ? '昨天' : (off > 0 ? off + '天后' : (-off) + '天前');
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return name + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) +
      '（' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + WEEKDAY[d.getDay()] + '）';
  }

  function taskLines(state, limit, now) {
    var out = [];
    var names = {};
    state.groups.forEach(function (g) { names[g.id] = g.name; });
    (state.todos || []).forEach(function (t) {
      if (out.length >= (limit || 60)) return;
      var bits = [t.done ? '[已完成]' : '[未完成]', t.id, t.title];
      bits.push(relWhen(t.dueAt, now));
      if (t.repeat && t.repeat !== 'none') bits.push('重复:' + t.repeat);
      bits.push('分组:' + (names[t.groupId] || '?'));
      out.push('- ' + bits.join(' | '));
    });
    return out;
  }

  function systemPrompt(state, now) {
    var groups = state.groups.map(function (g) { return g.name; }).join('、');
    return [
      '你是桌面待小组件里的排程助手。你只能调用给出的工具，不要用正文回答。',
      '今天：' + humanNow(now) + '（本地时区）。',
      '可用分组：' + groups + '。',
      '规则：',
      '1) 不要自己把「下周二」换算成日期，原样放进 dateText；只有钟点可以写成 clockText 的 HH:MM。',
      '2) 用户没说时间，就不要编一个时间：clockText 留空。',
      '3) 缺少无法推断的必要信息（比如完全没有日期）时调用 ask_user，一次只问一件事，并给出候选项。',
      '4) 多条任务落在同一时段时，用 durationMinutes 依次错开，不要重叠，也不要安排到已知占用的时段。',
      '5) 涉及修改已有任务时，id 必须来自下面的列表；找不到就说清楚，不要臆造 id。',
      '6) 你不能删除任务，也不能改动设置。',
      '7) 同名任务往往有好几条：用句子里的相对日期（明天/后天/周几）去对下表里「明天 14:00」这样的标注。' +
        '能唯一对上就直接用 suggest_changes 改，不要反问；只有确实对不上才 ask_user，且同一个问题最多问一次。',
      '当前任务列表：',
      taskLines(state, 60, now).join('\n') || '（空）'
    ].join('\n');
  }

  /* ---------------------------------------------------------------- trace */

  var trace = [];
  var TRACE_KEEP = 40;
  /* One id per turn, so the debug view can group `request → tools → resolved → commit`
     instead of reading a flat list of steps from several turns interleaved. */
  var turn = 0;

  function record(entry) {
    entry.at = new Date().toISOString();
    entry.turn = turn;
    trace.push(entry);
    if (trace.length > TRACE_KEEP) trace.splice(0, trace.length - TRACE_KEEP);
    /* the same record goes to the app's own log and to the host's ring: the log is where a
       report of "it did something odd" is answered from after a restart, and the ring is
       what the panel renders while it is still happening */
    if (API && API.bootNote) {
      API.bootNote('[agent] ' + entry.stage + ' ' + JSON.stringify(entry).slice(0, 460));
    }
    if (API && API.aiTrace) {
      try { API.aiTrace(entry); } catch (e) { /* a debug channel must never break a turn */ }
    }
    return entry;
  }

  /* ---------------------------------------------------------------- resolve */

  /* One draft, from surface forms to a storable record. Everything that decides a
     timestamp goes through the parser — including the "no date at all" verdict, which is
     what turns into a question rather than a silent default. */
  function resolveDraft(d, state, now) {
    var text = [d.dateText, d.clockText, d.repeat === 'weekly' ? '每周' : '']
      .filter(Boolean).join(' ');
    if (d.groupHint) text += ' -' + d.groupHint;
    var p = root.NeonNLP ? root.NeonNLP.parse(text, { groups: state.groups, now: now }) : null;

    var out = {
      title: String(d.title || (p && p.title) || '').trim().slice(0, MAX_TITLE),
      dueAt: p ? p.dueAt : null,
      repeat: d.repeat && d.repeat !== 'none' ? d.repeat : (p && p.repeat) || 'none',
      lunar: p ? p.lunar : null,
      groupId: (p && p.groupId) || state.settings.activeGroupId || state.groups[0].id,
      priority: PRIORITY.indexOf(d.priority) >= 0 ? d.priority : 'none',
      durationMinutes: clampInt(d.durationMinutes, 5, 480, 60),
      notes: String(d.notes || '').slice(0, 500),
      source: d.__source || 'model',
      said: { dateText: d.dateText || '', clockText: d.clockText || '' },
      needsDate: !!(d.dateText && !p) || (!d.dateText && !d.clockText),
      needsTime: !d.clockText,
      warning: (p && p.warning) || ''
    };
    if (!out.title) out.title = '未命名任务';
    return out;
  }

  function clampInt(v, lo, hi, dflt) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  }

  /* "把面试推到后天" moves the day, not the hour — and a date-only parse lands on the
     parser's default 09:00, which would quietly pull a 14:00 interview out of its own slot
     while the user read it as "same time, two days later". So a change that named no new
     clock keeps the clock it had. */
  function keepClock(merged, saidClock) {
    if (saidClock) return;            // the sentence named a new time, so honour it
    if (!merged.dueAt || !merged.before) return;
    var at = new Date(merged.dueAt);
    var was = new Date(merged.before);
    if (isNaN(at) || isNaN(was)) return;
    at.setHours(was.getHours(), was.getMinutes(), 0, 0);
    merged.dueAt = at.toISOString();
  }

  /* The scheduling itself: same-instant drafts get pushed apart by the preceding
     duration, and anything landing on a busy window slides to the next free slot. Pure
     arithmetic on resolved times — no model involved, so it can be tested with the mock. */
  function plan(drafts, state, now) {
    var busy = busyWindows(state, now);
    var placed = [];
    drafts.forEach(function (d) {
      if (!d.dueAt) { placed.push(d); return; }
      var t = new Date(d.dueAt).getTime();
      var span = d.durationMinutes * 60000;
      var guard = 0;
      while (guard++ < 40 && collides(t, span, busy.concat(placed.map(function (p) {
        return { from: new Date(p.dueAt).getTime(), to: new Date(p.dueAt).getTime() + p.durationMinutes * 60000 };
      })))) {
        t += 15 * 60000;
        d.moved = (d.moved || 0) + 15;
      }
      d.dueAt = new Date(t).toISOString();
      placed.push(d);
    });
    return drafts;
  }

  function collides(t, span, list) {
    return list.some(function (b) { return t < b.to && b.from < t + span; });
  }

  function busyWindows(state, now) {
    var from = now.getTime();
    var to = from + 8 * 864e5;
    return (state.todos || []).filter(function (t) {
      return !t.done && t.dueAt && new Date(t.dueAt).getTime() >= from &&
        new Date(t.dueAt).getTime() <= to;
    }).map(function (t) {
      var at = new Date(t.dueAt).getTime();
      return { from: at, to: at + 60 * 60000 };
    });
  }

  /* ---------------------------------------------------------------- the loop */

  function request(state, messages, cfg) {
    var body = {
      model: cfg.model,
      messages: messages,
      tools: TOOLS,
      temperature: 0,
      max_tokens: 900
    };
    return API.aiChat(cfg.base, cfg.model, body).then(function (text) {
      var j = typeof text === 'string' ? JSON.parse(text) : text;
      var choice = (j.choices || [])[0] || {};
      return { message: choice.message || {}, usage: j.usage || {}, raw: j };
    });
  }

  function toolCallsOf(msg) {
    return (msg && msg.tool_calls) || [];
  }
  /* ---------------------------------------------------------------- dialects

     A model that was never trained on the OpenAI wire format still knows how to call a
     tool, and writes the call into the answer as text: Qwen behind the Hugging Face router
     replies with its own function / parameter markup in `content` and no `tool_calls` array
     at all. Translating that is a dozen lines, and it is the difference between working on
     the first request and needing the nudge — which doubles the latency and sometimes meets
     a 500 from the router instead.

     The tag patterns are assembled from character codes rather than written as literals:
     markup that looks like a tag is exactly what trips up a log viewer, a transcript, or
     the next person's editor. */
  var TB = String.fromCharCode(60), TE = String.fromCharCode(62);

  function coerceParam(v) {
    /* a parameter body is JSON when it can be — the drafts array is the whole point — and
       plain text otherwise, because dateText and clockText are said, not encoded */
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var c = s.charAt(0);
    if (c === '{' || c === '[' || c === '"' || c === '-' || (c >= '0' && c <= '9') ||
        s === 'true' || s === 'false' || s === 'null') {
      try { return JSON.parse(s); } catch (e) { return s; }
    }
    return s;
  }

  function nativeCalls(content) {
    var text = String(content || '');
    if (text.indexOf('function=') < 0) return [];
    var out = [];
    var re = new RegExp(TB + '\\s*function\\s*=\\s*([A-Za-z0-9_.-]+)\\s*' + TE, 'g');
    var m;
    while ((m = re.exec(text))) {
      /* the body runs to the next call's opening tag, so several calls in one answer each
         keep their own parameters */
      var from = m.index + m[0].length;
      var stop = text.indexOf(TB + 'function=', from);
      var body = text.slice(from, stop >= 0 ? stop : text.length);
      var args = {};
      var pr = new RegExp(TB + '\\s*parameter\\s*=\\s*([A-Za-z0-9_.-]+)\\s*' + TE +
        '([\\s\\S]*?)' + TB + '\\s*/\\s*parameter\\s*' + TE, 'g');
      var p;
      while ((p = pr.exec(body))) args[p[1]] = coerceParam(p[2]);
      if (!Object.keys(args).length) {
        /* a half-emitted call — the truncation case in the log, where the answer stopped at
           the opening tag. Better to nudge than to run a tool with no arguments */
        record({ stage: 'dialect-empty', name: m[1] });
        continue;
      }
      out.push({
        id: 'native-' + out.length,
        type: 'function',
        function: { name: m[1], arguments: JSON.stringify(args) }
      });
    }
    return out;
  }

  /* A change verb plus a task named in the sentence is not a new task, whatever else goes
     wrong on the way to that verdict. */
  var CHANGE_WORDS = /推迟|推后|提前|延后|顺延|改期|改到|改至|挪到|挪至|推到|移到|搬到|取消/;

  function changeIntent(text) { return CHANGE_WORDS.test(String(text || '')); }

  /* A change built from what the sentence already says, without the model: the reference
     resolved to one record and the parser found the destination day. The clock rule is the
     same one the model's own changes go through. */
  function changeFrom(target, parsed) {
    var up = {
      id: target.id,
      title: target.title,
      dueAt: parsed.dueAt,
      before: target.dueAt || null,
      said: { dateText: (parsed.matched || []).join(' '), clockText: parsed.hasTime ? '' : '' },
      warning: parsed.warning || '',
      groupId: target.groupId,
      priority: target.priority || 'none',
      repeat: target.repeat || 'none',
      lunar: parsed.lunar || target.lunar || null,
      durationMinutes: 60,
      source: 'local-resolve',
      needsDate: false,
      needsTime: !parsed.hasTime
    };
    keepClock(up, parsed.hasTime ? 'named' : '');
    return up;
  }

  function namedTask(text, state, now) {
    var t = String(text || '');
    var hits = (state.todos || []).filter(function (x) {
      return x && !x.done && x.title && x.title.length >= 2 && t.indexOf(x.title) >= 0;
    });
    if (hits.length === 1) return hits[0];
    if (!hits.length) return null;
    /* The most specific name wins. "把面试（自动测试）推迟到后天" contains the bare word 面试
       too, so a list holding any task simply named 面试 matches it as well — and a match that
       counts every generic title alongside the specific one reads as ambiguous and stands
       down. That is not ambiguity, that is a longer name being more informative. */
    var longest = hits.reduce(function (m, x) { return Math.max(m, x.title.length); }, 0);
    var tier = hits.filter(function (x) { return x.title.length === longest; });
    if (tier.length === 1) return tier[0];
    /* Several records answer to the same words — which is exactly the mess this bug leaves
       behind, so it cannot also be the reason to give up. The sentence normally says which
       one it means: "把明天的面试推迟到后天" is about the one due tomorrow. Take that only
       when it resolves to a single record; otherwise it is still a guess. */
    var from = sourceDayOffsets(t), now0 = new Date(now || Date.now());
    var picks = tier.filter(function (x) {
      if (!x.dueAt) return false;
      var d = new Date(x.dueAt);
      if (isNaN(d)) return false;
      var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      var b = new Date(now0.getFullYear(), now0.getMonth(), now0.getDate()).getTime();
      return from.indexOf(Math.round((a - b) / 864e5)) >= 0;
    });
    return picks.length === 1 ? picks[0] : null;
  }

  var DAY_WORDS = [['大后天', 3], ['后天', 2], ['明天', 1], ['今天', 0]];

  function sourceDayOffsets(text) {
    /* the destination of a move follows 到/至, so whatever day word is left over names the
       task the sentence is about rather than where it is going */
    var t = String(text || '').replace(/[到至]\s*(大后天|后天|明天|今天)/g, ' ');
    var out = [];
    /* longest first, and blank each hit out afterwards: 大后天 contains 后天, so a naive scan
       reads one day word as two and a sentence that names exactly one task comes back naming
       two — which is how the repair quietly stopped repairing anything at all */
    DAY_WORDS.forEach(function (w) {
      if (t.indexOf(w[0]) >= 0) {
        out.push(w[1]);
        t = t.split(w[0]).join(' ');
      }
    });
    return out;
  }

  /* Returns { kind, drafts, updates, question, options, reason, trace } — never writes. */
  function run(text, state, opts) {
    opts = opts || {};
    /* `now` is injectable so the eval set is reproducible: "下周二" means different days on
       different days, and a test that cannot pin the clock cannot pin the answer */
    var now = opts.now ? new Date(opts.now) : new Date();
    var prior = (opts.prior || []).slice();
    var cfg = aiSettings(state);
    var t0 = Date.now();
    turn++;
    var sent = {
      stage: 'request', chars: text.length, model: cfg.model, base: cfg.base,
      tasks: (state.todos || []).length, tools: TOOLS.length
    };
    record(sent);

    var messages = [
      { role: 'system', content: systemPrompt(state, now) },
      { role: 'user', content: String(text || '').slice(0, 2000) }
    ];

    return request(state, messages, cfg).then(function (r) {
      var calls = toolCallsOf(r.message);
      var when = 'first';
      if (!calls.length) {
        /* the dialect branch: the call really is there, written in the model's own markup
           instead of the array the OpenAI shape would carry it in */
        calls = nativeCalls(r.message.content);
        if (calls.length) {
          when = 'from-content';
          record({ stage: 'dialect', names: calls.map(function (c) { return c.function.name; }),
            ms: Date.now() - t0 });
        }
      }
      if (!calls.length) {
        /* the branch every provider can land in, and the reason the nudge exists: without a
           second attempt a model that merely answered in prose would look like a broken
           button to the user */
        record({ stage: 'no-tool-call', ms: Date.now() - t0, content: String(r.message.content || '').slice(0, 120) });
        messages.push({ role: 'assistant', content: String(r.message.content || '') });
        messages.push({ role: 'user', content: '请改用工具调用回答（suggest_tasks / suggest_changes / ask_user）。' });
        return request(state, messages, cfg).then(function (r2) {
          /* a second prose answer is the end of the agent's road, not the user's: the app
             already parses "明天五点吃火锅 -日常" on its own, so use that rather than
             showing a chat reply nobody asked for */
          var again = toolCallsOf(r2.message).length ? toolCallsOf(r2.message) : nativeCalls(r2.message.content);
          return again.length
            ? finish(again, r2, state, now, t0, text, 'after-nudge', prior)
            : fallback('still-prose', state, now, text);
        }, function (e) { return fallback(e, state, now, text); });
      }
      return finish(calls, r, state, now, t0, text, when, prior);
    }, function (e) {
      record({ stage: 'error', ms: Date.now() - t0, message: String(e && e.message ? e.message : e).slice(0, 200) });
      throw e;
    });
  }

  function finish(calls, r, state, now, t0, text, when, prior) {
    var names = calls.map(function (c) { return c.function && c.function.name; });
    record({ stage: 'tools', when: when, names: names, ms: Date.now() - t0,
      tokens: (r.usage.prompt_tokens || 0) + (r.usage.completion_tokens || 0) });

    var out = { kind: 'none', drafts: [], updates: [], question: '', options: [], reason: '' };
    calls.forEach(function (c) {
      var name = c.function && c.function.name;
      if (!ALLOWED[name]) {
        record({ stage: 'refused-tool', name: String(name).slice(0, 40) });
        return;
      }
      var args = {};
      try { args = JSON.parse(c.function.arguments || '{}'); } catch (e) {
        record({ stage: 'bad-args', name: name, message: String(e.message || e).slice(0, 120) });
        return;
      }
      if (name === 'ask_user') {
        var question = String(args.question || '').slice(0, 120);
        /* A question is only worth showing if the sentence cannot answer it. Two checks happen
           before it reaches the user: whether the task list plus the words already spoken
           resolve the reference on their own, and whether this very question was already
           answered in the same flow — a model that asks again after being answered is not
           clarifying, it is looping, and each lap costs ten seconds and a turn of quota. */
        var said = root.NeonNLP ? root.NeonNLP.parse(text, { groups: state.groups, now: now }) : null;
        var who = namedTask(text, state, now);
        if (who && said && said.dueAt) {
          var up = changeFrom(who, said);
          record({ stage: 'question-resolved', question: question, id: who.id, title: who.title });
          out.kind = 'updates';
          out.updates.push(up);
          out.reason = out.reason || '按句子里的日期直接改这条，没有再问';
          return;
        }
        if ((prior || []).indexOf(question) >= 0) {
          record({ stage: 'question-loop', question: question });
          out.kind = 'none';
          out.drafts = [];
          out.reason = '助手反复问同一件事（「' + question + '」），就先不为难它。说得更具体些，例如「把大后天 14:00 的面试改到明天」，' +
            '或直接在那条任务上改时间。';
          return;
        }
        out.kind = 'question';
        out.question = question;
        out.slot = args.slot;
        out.options = (args.options || []).slice(0, 6).map(String);
        return;
      }
      if (name === 'suggest_tasks') {
        out.reason = out.reason || String(args.reason || '').slice(0, 200);
        out.drafts = out.drafts.concat((args.drafts || []).slice(0, MAX_DRAFTS).map(function (d) {
          d.__source = 'model';
          return resolveDraft(d, state, now);
        }));
        out.kind = 'drafts';
        return;
      }
      if (name === 'suggest_changes') {
        out.reason = out.reason || String(args.reason || '').slice(0, 200);
        var ids = {};
        (state.todos || []).forEach(function (t) { ids[t.id] = t; });
        (args.updates || []).slice(0, MAX_DRAFTS).forEach(function (u) {
          if (!ids[u.id]) {
            record({ stage: 'unknown-id', id: String(u.id).slice(0, 24) });
            return;
          }
          var merged = resolveDraft(Object.assign({}, u, { title: u.title || ids[u.id].title }), state, now);
          merged.id = u.id;
          merged.before = ids[u.id].dueAt || null;
          keepClock(merged, u.clockText);
          out.updates.push(merged);
        });
        if (out.updates.length) out.kind = 'updates';
      }
    });

    /* ---- repair: a wrong tool is still a wrong tool if the answer looked reasonable.
       Qwen given "明天面试推迟到后天，三个人" answered with three NEW 面试 drafts, which is
       how a schedule ends up with both the old appointment and its copy. The sentence named
       one existing task unambiguously, so the intent is a move and the new times are worth
       keeping: take the first draft's time, drop the rest, and hand back one change. */
    if (out.kind === 'drafts' && out.drafts.length) {
      var target = namedTask(text, state, now);
      var moved = out.drafts.filter(function (d) { return d.dueAt; })[0];
      if (target && moved && changeIntent(text)) {
        var upd = {
          id: target.id,
          title: target.title,
          dueAt: moved.dueAt,
          before: target.dueAt || null,
          said: moved.said,
          warning: moved.warning || '',
          groupId: target.groupId,
          priority: target.priority || 'none',
          repeat: target.repeat || 'none',
          lunar: target.lunar || null,
          durationMinutes: moved.durationMinutes,
          source: 'repaired',
          needsDate: false,
          needsTime: false
        };
        keepClock(upd, moved.said && moved.said.clockText);
        record({ stage: 'tool-repaired', from: 'suggest_tasks', to: 'suggest_changes',
          id: target.id, title: target.title, dropped: out.drafts.length - 1 });
        out.drafts = [];
        out.updates = [upd];
        out.kind = 'updates';
      } else if (changeIntent(text) && moved) {
        /* said out loud because the alternative is silence: when the sentence clearly edits a
           task but the target cannot be resolved to one record, the drafts go through as new
           ones and the only clue is this line */
        record({ stage: 'repair-skipped', because: target ? 'no time in draft' : 'ambiguous-target' });
      }
    }

    if (out.kind === 'drafts') out.drafts = plan(out.drafts, state, now);
    record({ stage: 'resolved', kind: out.kind,
      drafts: out.drafts.map(function (d) { return { t: d.title, at: d.dueAt, said: d.said }; }),
      updates: out.updates.length, ms: Date.now() - t0 });
    return out;
  }

  /* Nothing came back usable: fall back to the parser the app already ships, so the
     button still does the ordinary thing rather than showing a chat reply. */
  function fallback(e, state, now, text) {
    var cause = (e && e.message) ? e.message : String(e || '');
    record({ stage: 'local-fallback', message: String(cause).slice(0, 160) });
    /* The local parser only knows how to ADD a task. Give it "明天面试推迟到后天" and it
       dutifully creates a new record titled 明天面试推迟到 — which is what the user found in
       their list after a router 500. On a sentence that names an existing task or uses a
       change verb, the honest answer is "that did not work", not a guess nobody asked for. */
    var target = namedTask(text, state, now);
    if (target || changeIntent(text)) {
      record({ stage: 'fallback-refused', named: target ? target.title : '', because: String(cause).slice(0, 120) });
      return {
        kind: 'none', drafts: [], updates: [], question: '', options: [],
        reason: '模型这次没有给出可用的安排' + (String(cause).trim() ? '（' + String(cause).trim().slice(0, 60) + '）' : '') +
          '。这句话像是在改已有任务，本地解析只会新建，所以没有替你猜——再点一次 ✨，或直接编辑那条任务。'
      };
    }
    var p = root.NeonNLP ? root.NeonNLP.parse(text, { groups: state.groups, now: now }) : null;
    if (!p) return { kind: 'none', drafts: [], updates: [], question: '', options: [] };
    return {
      kind: 'drafts', reason: '模型没有返回可用的安排，已按本地规则解析',
      drafts: [resolveDraft({ title: p.title, dateText: p.hasDate || p.hasTime ? text : '', __source: 'local' }, state, now)],
      updates: [], question: '', options: []
    };
  }

  /* ---------------------------------------------------------------- commit */

  /* Called only from the confirmation UI. The ops are the app's own, so the reducer's
     normalisation, the save, and the other window's sync all happen exactly as if the user
     had typed the task in. */
  function commit(result, edits) {
    var drafts = (result.drafts || []).filter(function (d) { return d.title; });
    var updates = result.updates || [];
    var ops = [];
    drafts.forEach(function (d) {
      ops.push(API.op({
        type: 'todo:add', title: d.title, notes: d.notes, dueAt: d.dueAt,
        repeat: d.repeat, lunar: d.lunar, groupId: d.groupId, priority: d.priority
      }));
    });
    updates.forEach(function (u) {
      /* the reducer takes `todo:update` as { id, patch } — flat fields are read out of
         `p.patch`, which defaults to {}, so sending them at the top level was a silent
         success that changed nothing. The shape is the bug this whole line exists for. */
      var patch = {};
      if (u.title) patch.title = u.title;
      if (u.dueAt) patch.dueAt = u.dueAt;
      if (!Object.keys(patch).length) return;
      ops.push(API.op({ type: 'todo:update', id: u.id, patch: patch }));
    });
    record({ stage: 'commit', added: drafts.length, changed: updates.length,
      edited: (edits || []).length });
    /* API.op resolves with the reducer's own {ok:false,error} rather than rejecting, so a
       write that quietly did nothing looks identical to one that worked unless somebody
       counts. That is precisely how the flat-patch bug survived a green run. */
    return Promise.all(ops).then(function (rs) {
      var bad = (rs || []).filter(function (r) { return !r || r.ok === false; });
      if (bad.length) {
        record({ stage: 'commit-failed', failed: bad.length,
          errors: bad.map(function (b) { return String(b && b.error || ''); }).slice(0, 3) });
      }
      return { added: drafts.length, changed: updates.length, failed: bad.length };
    });
  }

  /* ---------------------------------------------------------------- settings */

  function aiSettings(state) {
    var a = (state.settings && state.settings.ai) || {};
    return { on: a.on === true, base: String(a.base || ''), model: String(a.model || '') };
  }

  /* ---------------------------------------------------------------- settings probes
     Two buttons, deliberately separated by what they cost.

     `probe` is free: it asks the endpoint what it serves. That answers the question the
     rest of this screen cannot — "did I configure this at all" — and it catches the single
     most likely mistake, which is pointing at a provider's *native* API because that is the
     URL printed in its console. Google's is the trap: `/v1beta` speaks a different JSON
     dialect from OpenAI, and its OpenAI-compatible layer is `/v1beta/openai`. A wrong one
     of those fails as a 404 that looks exactly like a bad key.

     `tryCall` is the one that spends tokens, so it is a separate press and says what it
     does: it asks for a `ping` tool call, which is the only way to learn whether this
     model supports function calling at all. Gemma-class models frequently accept the
     request and then answer in prose, and a schedule assistant cannot work with that. */

  function msg(e) { return String((e && e.message) || e || '').slice(0, 240); }
  function $(sel, ctx) { return (ctx || root.document).querySelector(sel); }

  function probe(base) {
    turn++;
    return API.aiModels(base).then(function (r) {
      var ok = r.status >= 200 && r.status < 300;
      var hint;
      if (!ok) {
        hint = 'HTTP ' + r.status + (r.error ? ' · ' + r.error : ' · 该地址没有返回模型列表');
      } else if (r.shape === 'gemini') {
        hint = '能连通，但这是 Gemini 原生接口，不认 OpenAI 格式：把地址改成 …/v1beta/openai';
      } else if (r.shape === 'openai') {
        hint = 'OpenAI 兼容 · 可列出 ' + r.count + ' 个模型';
      } else {
        hint = '能连通，但返回的不是模型列表（地址可能少了一段）';
      }
      record({ stage: 'probe', status: r.status, shape: r.shape, count: r.count, ms: r.ms });
      return { ok: ok, status: r.status, ms: r.ms, shape: r.shape,
        models: r.models || [], hint: hint };
    }, function (e) {
      record({ stage: 'probe', error: msg(e) });
      return { ok: false, status: 0, models: [], hint: '连不上：' + msg(e) };
    });
  }

  function tryCall(base, model) {
    var t0 = Date.now();
    turn++;
    var body = {
      model: model,
      messages: [
        { role: 'system', content: '你只能调用工具回答，不要用正文。' },
        { role: 'user', content: '调用 ping 工具，参数 note 填 pong。' }
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'ping',
          description: '确认工具调用可用',
          parameters: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] }
        }
      }],
      temperature: 0,
      max_tokens: 64
    };
    return API.aiChat(base, model, body).then(function (text) {
      var j = JSON.parse(text);
      var m = ((j.choices || [])[0] || {}).message || {};
      var calls = m.tool_calls || [];
      var out = {
        ok: true, ms: Date.now() - t0, toolCalling: calls.length > 0,
        tool: calls[0] ? String(calls[0].function.name) : '',
        args: calls[0] ? String(calls[0].function.arguments).slice(0, 120) : '',
        content: String(m.content || '').slice(0, 160),
        tokens: (j.usage ? (j.usage.prompt_tokens + j.usage.completion_tokens) : 0)
      };
      record({ stage: 'probe-call', ms: out.ms, toolCalling: out.toolCalling, tokens: out.tokens });
      return out;
    }, function (e) {
      record({ stage: 'probe-call', error: msg(e) });
      return { ok: false, ms: Date.now() - t0, toolCalling: false, error: msg(e) };
    });
  }

  /* One sentence per trace entry, written here rather than in each screen: the panel's full
     view and the draft sheet's inline view describe the same records, and two copies of
     that wording drift the moment one is fixed. */
  function explain(e) {
    switch (e.stage) {
      case 'request': return '发送 ' + e.chars + ' 字 · ' + (e.model || '?') + ' · 上下文含 ' + e.tasks + ' 个任务';
      case 'tools': return (e.when === 'after-nudge' ? '催办后' : '首次') + ' → ' + (e.names || []).join('+') +
        ' · ' + e.ms + 'ms · ' + (e.tokens || 0) + ' tokens';
      case 'resolved': {
        var d = (e.drafts || []).map(function (x) {
          return '「' + x.t + '」' + (x.at ? String(x.at).slice(0, 16).replace('T', ' ') : '无时间');
        }).join(' ');
        return (e.kind || '-') + (d ? ' · ' + d : '') + (e.updates ? ' · 改动 ' + e.updates + ' 条' : '');
      }
      case 'no-tool-call': return '模型只回了正文：「' + (e.content || '') + '」';
      case 'dialect': return '模型把调用写进了正文（' + (e.names || []).join('+') + '），已翻译成工具调用 · ' + e.ms + 'ms';
      case 'dialect-empty': return '正文里的「' + e.name + '」只有开标签，没有参数';
      case 'tool-repaired': return '模型想新建（suggest_tasks），但这句话是在改「' + e.title + '」，已改成修改并丢掉 ' + e.dropped + ' 条多余草稿';
      case 'fallback-refused': return '本地解析只会新建任务，而这句话像是要改「' + (e.named || '已有任务') + '」，已拒绝猜测';
      case 'local-fallback': return '退回本地解析（' + (e.because || e.message || '') + '）';
      case 'question-resolved': return '模型想反问「' + e.question + '」，但这句话已经说清楚了 → 直接改「' + e.title + '」';
      case 'question-loop': return '⚠ 模型又问了一遍「' + e.question + '」，已停止追问';
      case 'refused-tool': return '✕ 拒绝了未授权的工具「' + e.name + '」';
      case 'unknown-id': return '✕ 模型给了一个不存在的任务 id「' + e.id + '」，已丢弃';
      case 'bad-args': return '✕ 工具参数不是合法 JSON：' + e.message;
      case 'commit': return '写入 ' + e.added + ' 条 · 修改 ' + e.changed + ' 条 · 其中你手改 ' + e.edited + ' 处';
      case 'probe': return 'HTTP ' + e.status + ' · ' + (e.shape || '?') + ' · ' + (e.count || 0) + ' 个模型 · ' + (e.ms || 0) + 'ms';
      case 'probe-call': return (e.toolCalling ? '工具调用可用' : '不会调用工具') + ' · ' + e.ms + 'ms · ' + (e.tokens || 0) + ' tokens';
      case 'error': return '✕ ' + (e.message || '');
      default: return JSON.stringify(e).slice(0, 120);
    }
  }

  root.Agent = {
    TOOLS: TOOLS,
    run: run,
    commit: commit,
    probe: probe,
    tryCall: tryCall,
    resolveDraft: resolveDraft,
    plan: plan,
    /* exposed for the eval: the dialect reader is the one piece that can be asserted without
       a provider at all, and it is the piece a provider change breaks */
    nativeCalls: nativeCalls,
    changeIntent: changeIntent,
    settings: aiSettings,
    explain: explain,
    turnOf: function () { return turn; },
    trace: trace,
    dump: function () { return trace.slice(); }
  };
/* the window, not `this`: the page loads this as a plain script and 'use strict' would
   otherwise leave the parameter undefined — which is exactly how the first build of this
   file threw at load and took the ✨ with it */
})(typeof window !== 'undefined' ? window : globalThis);
