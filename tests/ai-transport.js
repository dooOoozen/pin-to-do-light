/* Transport and secret storage, checked before anything is built on top of them.
   Four things have to be true and none of them can be read off the source:
     - the credential round trip works (a wrong CREDENTIALW layout returns error 87, or
       garbage, or a truncated key — all of which look like "it saved"),
     - the hint never contains the secret, and the secret never reaches the data file the
       user can export,
     - WinHTTP really reaches an https provider and surfaces its error body (the 401 from
       api.openai.com with no key is the cheapest proof that DNS, TLS, headers, status and
       body reading all work, and it needs no account),
     - a dead endpoint fails rather than hanging, and cleartext off-loopback is refused.

   Each call is attempted and reported on its own line: chaining them through one promise
   tail means a failure in step two reads like the result of step three, which is exactly
   how a status-parse bug first hid here. The mock provider (tools/mock-llm.js) must be
   running on 127.0.0.1:8787 for the loopback case. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[T] ' + s); } catch (e) { /* no bridge */ } }
  function brief(e) { return String(e && e.message ? e.message : e).slice(0, 120); }
  var SECRET = 'sk-mock-0123456789abcd';
  var CHAT = {
    model: 'mock',
    messages: [{ role: 'user', content: '下周二下午我有三个人需要面试，帮我安排好时间' }],
    tools: [{ type: 'function', function: { name: 'suggest_tasks' } }]
  };

  function step(label, fn) {
    return fn().then(
      function (v) { note(label + ' OK · ' + v); return v; },
      function (e) { note(label + ' ERR · ' + brief(e)); return null; }
    );
  }

  setTimeout(function () {
    Promise.resolve()
      .then(function () { return step('hint-before', function () { return API.aiKeyHint(); }); })
      .then(function () {
        return step('key-save', function () {
          return API.aiKeySave(SECRET).then(function (h) {
            return h + ' leaksSecret=' + (String(h).indexOf(SECRET) >= 0);
          });
        });
      })
      .then(function () {
        return step('mock-loopback', function () {
          return API.aiChat('http://127.0.0.1:8787/v1', 'mock', CHAT).then(function (text) {
            var j = JSON.parse(text);
            var m = j.choices[0].message;
            var args = m.tool_calls ? JSON.parse(m.tool_calls[0].function.arguments) : null;
            return 'finish=' + j.choices[0].finish_reason +
              ' tool=' + (m.tool_calls ? m.tool_calls[0].function.name : '-') +
              ' drafts=' + (args && args.drafts ? args.drafts.length : 0) +
              ' tokens=' + (j.usage.prompt_tokens + j.usage.completion_tokens);
          });
        });
      })
      .then(function () {
        return step('https-deepseek-no-key', function () {
          /* expected to fail with 401 — that failure is the proof the https path works:
             DNS, TLS through the system store, headers, status parsing, body reading */
          return API.aiChat('https://api.deepseek.com/v1', 'deepseek-chat', {
            model: 'deepseek-chat', messages: [{ role: 'user', content: 'ping' }]
          }).then(function (t) { return 'UNEXPECTED SUCCESS ' + String(t).slice(0, 60); });
        });
      })
      .then(function () {
        return step('https-openai-no-key', function () {
          return API.aiChat('https://api.openai.com/v1', 'gpt-4o-mini', {
            model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }]
          }).then(function (t) { return 'reached: ' + String(t).slice(0, 60); });
        });
      })
      .then(function () {
        return step('dead-endpoint', function () {
          return API.aiChat('http://127.0.0.1:9/v1', 'dead', CHAT)
            .then(function () { return 'UNEXPECTED SUCCESS'; });
        });
      })
      .then(function () {
        return step('cleartext-remote', function () {
          return API.aiChat('http://example.com:8787/v1', 'clear', CHAT)
            .then(function () { return 'UNEXPECTED SUCCESS'; });
        });
      })
      .then(function () { return step('key-clear', function () { return API.aiKeyClear(); }); })
      .then(function () {
        return step('settings-clean', function () {
          return API.getState().then(function (st) {
            var dump = JSON.stringify(st.settings || {});
            return 'leak=' + (dump.indexOf(SECRET) >= 0) + ' settingsKeys=' + Object.keys(st.settings || {}).length;
          });
        });
      })
      .then(function () { note('done'); });
  }, 1500);
})();
