/* A fake OpenAI-compatible endpoint, so the agent can be tested without a key.
 *
 * The point is not to imitate a model — it is to make the *contract* executable: the agent
 * loop, the tool-call parsing, the confirmation step and the write path can all be driven
 * end to end against canned replies, which is the only way to test them repeatedly without
 * spending a real key (and the substrate the eval set will run on later).
 *
 * Replies are chosen from the last user message, so a test says what it wants by asking for
 * it:
 *   方言 / dialect         → the tool call written into the prose in Qwen's own markup, which
 *                           is a real call that the OpenAI-shaped reader would throw away
 *   选错 / mistool         → suggest_tasks for a sentence that edits one task: the wrong tool
 *                           in the right shape, for the repair layer to catch
 *   只会聊天 / prose        → an answer with nothing callable in it, twice, so the local
 *                           fallback is the last thing standing
 *   推 / 挪 / 延 / 改期     → suggest_changes, with an id copied out of the task list the
 *                           system prompt carries — a made-up id can only test rejection
 *   面试 / interview       → suggest_tasks with three drafts, surface-form times
 *   提醒 / remind          → ask_user (a missing slot)
 *   慢 / slow              → the same reply, 1.4s later, so a test can catch the app waiting
 *   anything else         → a plain prose answer, no tool call — the path every provider
 *                           takes when `tool_choice` is unsupported (Ollama's compat endpoint
 *                           does not accept it) and the model just talks
 *
 *   node tools/mock-llm.js [port]        (default 8787)
 *
 * It listens on 127.0.0.1 only, and net.rs allows cleartext only for loopback, so this can
 * never be reached from another machine.
 */
const http = require('http');

const port = Number(process.argv[2] || 8787);

function toolCall(name, args) {
  return {
    id: 'call_' + Math.random().toString(36).slice(2, 10),
    type: 'function',
    function: { name: name, arguments: JSON.stringify(args) }
  };
}

/* The system prompt carries the real task list, one `- [flag] | id | title | when | 分组:x`
   line each. A mock that invents an id can only ever exercise the "unknown id" branch, so
   the update path — the one that writes to an existing record — was untestable end to end.
   Reading the id out of the prompt is what makes a committed change assertable. */
function taskRows(body) {
  const sys = (body.messages || []).filter((m) => m.role === 'system').pop();
  const text = String((sys && sys.content) || '');
  return text.split('\n').filter((l) => /^- \[/.test(l)).map((l) => {
    const f = l.slice(2).split('|').map((s) => s.trim());
    return { flag: f[0], id: f[1], title: f[2], when: f[3] };
  });
}

/* Some providers answer with the call written into the prose in their own markup instead of
 * an OpenAI `tool_calls` array — which is a correct tool call that the naive reader throws
 * away. Emit it on request so `Agent.nativeCalls` has something real to translate. The tags
 * are assembled here rather than written out because the markup trips up log readers. */
function dialectCall(name, params) {
  const B = String.fromCharCode(60), E = String.fromCharCode(62);
  let s = B + 'function=' + name + E;
  Object.keys(params).forEach((k) => {
    const v = typeof params[k] === 'string' ? params[k] : JSON.stringify(params[k]);
    s += B + 'parameter=' + k + E + v + B + '/parameter' + E;
  });
  return B + 'tool_call' + E + s + B + '/tool_call' + E;
}
function dayOf(text) {
  const DAY = '(大后天|后天|明天|今晚|下周[一二三四五六日天]|[周星期][一二三四五六日天])';
  const moved = text.match(new RegExp('[到至]' + DAY));
  const all = text.match(new RegExp(DAY, 'g')) || [];
  return (moved && moved[1]) || all[all.length - 1] || '';
}

function reply(body) {
  const last = (body.messages || []).filter((m) => m.role === 'user').pop();
  const text = String((last && last.content) || '');

  /* Two scripted failures, both copied from the log of a real Qwen session, because a bug
     you can only meet on a paid endpoint is a bug you can only fix once a week:
       方言 — the call is written into the prose in the model's own markup, no tool_calls array
       选错 — the model picks suggest_tasks for a sentence that clearly edits one task  */
  if (/方言|dialect/.test(text)) {
    const rows = taskRows(body);
    const hit = rows.filter((r) => r.title && text.indexOf(r.title.slice(0, 2)) >= 0)[0] || rows[0];
    if (hit && /推|挪|延/.test(text)) {
      return {
        content: dialectCall('suggest_changes', {
          reason: '临时有会，挪到' + (dayOf(text) || '后天'),
          updates: [{ id: hit.id, dateText: dayOf(text) || '后天' }]
        }),
        usage: { prompt_tokens: 240, completion_tokens: 60 }
      };
    }
    return {
      content: dialectCall('suggest_tasks', {
        reason: '三个候选人各一小时',
        drafts: [
          { title: '面试 候选人A', dateText: '下周二', clockText: '14:00', durationMinutes: 60, groupHint: '工作' },
          { title: '面试 候选人B', dateText: '下周二', clockText: '14:00', durationMinutes: 60, groupHint: '工作' }
        ]
      }),
      usage: { prompt_tokens: 210, completion_tokens: 96 }
    };
  }

  if (/选错|mistool/.test(text)) {
    /* the wrong tool, said in exactly the right shape: two new records for one edit */
    return {
      tool_calls: [toolCall('suggest_tasks', {
        reason: '好，改到' + (dayOf(text) || '后天'),
        drafts: [
          { title: '面试', dateText: dayOf(text) || '后天', clockText: '14:00', durationMinutes: 60 },
          { title: '面试', dateText: dayOf(text) || '后天', clockText: '15:00', durationMinutes: 60 }
        ]
      })],
      usage: { prompt_tokens: 240, completion_tokens: 70 }
    };
  }

  /* 推/挪/延 and not "改": the agent's own nudge sentence contains 改用工具, and a mock that
     matches on loose keywords answers its own prompt instead of the test's. First branch of
     its own, too — "把明天的面试推后" is a change to an existing record even though it names
     the thing the new-task branch would key on. */
  if (/反复|askback/.test(text)) {
    /* the clarification loop, scripted: the same question whatever it is answered with, which
     * is what a small model does when the list it was given cannot tell the candidates apart */
    return {
      tool_calls: [toolCall('ask_user', {
        question: '你说的是哪一场面试？',
        slot: 'title',
        options: ['明天那场', '后天那场']
      })],
      usage: { prompt_tokens: 230, completion_tokens: 36 }
    };
  }

  if (/只会聊天|prose/.test(text)) {
    /* every provider's mood branch: an answer with nothing callable in it, twice over, which
       is the path that ends in the local fallback */
    return { content: '这个我需要再问一下才能确定，你说的面试是指哪一场？',
      usage: { prompt_tokens: 200, completion_tokens: 24 } };
  }

  if (/推|挪|延|改期/.test(text)) {
    const rows = taskRows(body);
    /* which task did they mean? the mock takes the first whose title shares a keyword with
       the sentence, falling back to the first dated one — enough to land on a real id, which
       is all this branch is for */
    const hit = rows.filter((r) => r.title && text.indexOf(r.title.slice(0, 2)) >= 0)[0] ||
      rows.filter((r) => r.when && r.when !== '无日期')[0] || rows[0];
    if (!hit) {
      return {
        tool_calls: [toolCall('ask_user', {
          question: '没有看到可改的任务，是说哪一个？', slot: 'title', options: ['新建一条', '我再说一遍']
        })],
        usage: { prompt_tokens: 240, completion_tokens: 30 }
      };
    }
    /* the day *after* 到/至, not the first day in the sentence: "把明天的面试推到后天" names
       two days, and picking the first one would move the task to where it already is */
    const day = dayOf(text) || '后天';
    return {
      tool_calls: [toolCall('suggest_changes', {
        reason: '临时有会，把「' + hit.title + '」挪到' + day,
        /* no clockText on purpose: the sentence only named a new day, and whether the old
           hour survives that move is the part with a right and a wrong answer */
        updates: [{ id: hit.id, dateText: day }]
      })],
      usage: { prompt_tokens: 240, completion_tokens: 52 }
    };
  }

  if (/面试|interview/.test(text)) {
    /* Times are surface forms on purpose: "下周二" is what the user said, and resolving it
       to a date is the local parser's job, not the model's. */
    return {
      tool_calls: [toolCall('suggest_tasks', {
        reason: '三个候选人各一小时，从下午两点开始排',
        drafts: [
          { title: '面试 候选人A', dateText: '下周二', clockText: '14:00', durationMinutes: 60, groupHint: '工作', priority: 'high' },
          { title: '面试 候选人B', dateText: '下周二', clockText: '14:00', durationMinutes: 60, groupHint: '工作', priority: 'med' },
          { title: '面试 候选人C', dateText: '下周二', clockText: '14:00', durationMinutes: 60, groupHint: '工作', priority: 'med' }
        ]
      })],
      usage: { prompt_tokens: 210, completion_tokens: 96 }
    };
  }

  if (/提醒|报告|remind/.test(text)) {
    return {
      tool_calls: [toolCall('ask_user', {
        question: '报告要定在几点交？',
        slot: 'clockText',
        options: ['上午 10:00', '下午 18:00', '晚上 23:59']
      })],
      usage: { prompt_tokens: 180, completion_tokens: 40 }
    };
  }

  /* no tool call at all — the loop has to notice and fall back, not crash */
  return { content: '我不确定你想安排哪一天，再说清楚一点？', usage: { prompt_tokens: 90, completion_tokens: 18 } };
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { /* leave it empty */ }
    const auth = req.headers.authorization || '';
    console.log('[mock] ' + req.url + ' tools=' + (body.tools ? body.tools.length : 0) +
      ' auth=' + (auth ? auth.slice(0, 12) + '…' : 'none') +
      ' user=' + JSON.stringify((body.messages || []).filter((m) => m.role === 'user').slice(-1)[0] || {}).slice(0, 90));

    if (req.url.indexOf('chat/completions') < 0) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'no route ' + req.url } }));
      return;
    }
    /* a test that wants to catch the app mid-request says 慢 — the mock answers in 15ms
       otherwise, and "what does the panel do while waiting" is untestable at that speed */
    const slow = /慢|slow/.test(String(((body.messages || []).filter((m) => m.role === 'user').slice(-1)[0] || {}).content || ''));
    setTimeout(() => {
      const r = reply(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        model: body.model || 'mock',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: r.content || null,
            tool_calls: r.tool_calls
          },
          finish_reason: r.tool_calls ? 'tool_calls' : 'stop'
        }],
        usage: r.usage || { prompt_tokens: 0, completion_tokens: 0 }
      }));
    }, slow ? 1400 : 0);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log('[mock] listening on http://127.0.0.1:' + port + '/v1/chat/completions');
});
