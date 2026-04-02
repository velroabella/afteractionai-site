/* ══════════════════════════════════════════════════════════
   AfterAction AI — Retry & Backoff Regression Tests
   Runner: Node.js built-in (node --test)

   Covers the Phase R retry/backoff layer added to app.js:
    18. _isTransientError — error classification rules
    19. withRetry — success, retry counts, exhaustion, logging
    20. checklist-manager — retry wrapper integration

   Extraction strategy:
     _isTransientError, _RETRY_DELAYS, and withRetry are sliced
     directly from the production app.js Phase R block using
     marker-delimited extraction and vm.runInThisContext.
     Tests run against the live production code, not a copy.
   ══════════════════════════════════════════════════════════ */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const SITE = path.resolve(__dirname, '..');

function loadModule(relPath) {
  var code = fs.readFileSync(path.join(SITE, relPath), 'utf8');
  vm.runInThisContext(code, { filename: relPath });
}

// ── Bootstrap minimal browser globals ───────────────────────
global.window  = { AIOS: {}, AAAI: {} };
global.document = {
  getElementById:   function() { return { style: { display: '' }, textContent: '', innerHTML: '' }; },
  readyState:       'complete',
  addEventListener: function() {}
};

// ── Extract Phase R helpers from production app.js ──────────
// Slices the exact marker-delimited block so we test production
// code, not a reimplementation. Any edit to app.js is immediately
// reflected here.
(function() {
  var src   = fs.readFileSync(path.join(SITE, 'js/app.js'), 'utf8');
  var START = '  /* \u2500\u2500 Phase R: withRetry';
  var END   = '  (window.AAAI = window.AAAI || {}).withRetry = withRetry;';
  var s     = src.indexOf(START);
  var e     = src.indexOf(END) + END.length;
  if (s === -1 || e <= s) {
    throw new Error('[retry-tests] Phase R block not found in app.js \u2014 marker changed?');
  }
  vm.runInThisContext(src.slice(s, e), { filename: 'app.js[Phase-R]' });
}());

// Guard \u2014 confirm extraction produced the expected globals
if (typeof _isTransientError !== 'function') throw new Error('_isTransientError not extracted from app.js');
if (typeof withRetry          !== 'function') throw new Error('withRetry not extracted from app.js');
if (!Array.isArray(_RETRY_DELAYS))            throw new Error('_RETRY_DELAYS not extracted from app.js');


// ════════════════════════════════════════════════════════════
// 18. _isTransientError \u2014 error classification
//
//  Tests the exact predicate used by withRetry to decide whether
//  to retry or propagate an error immediately.
// ════════════════════════════════════════════════════════════

describe('18. _isTransientError \u2014 error classification', function() {

  // \u2500\u2500 Must classify as transient \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  it('classifies AbortError as transient', function() {
    assert.ok(_isTransientError({ name: 'AbortError', message: 'The operation was aborted.' }));
  });

  it('classifies AI_TIMEOUT sentinel as transient', function() {
    assert.ok(_isTransientError(new Error('AI_TIMEOUT')));
  });

  it('classifies fetch TypeError "Failed to fetch" as transient', function() {
    assert.ok(_isTransientError(new TypeError('Failed to fetch')));
  });

  it('classifies fetch TypeError "network error" as transient', function() {
    assert.ok(_isTransientError(new TypeError('network error occurred')));
  });

  it('classifies "Chat endpoint error: 500" as transient', function() {
    assert.ok(_isTransientError(new Error('Chat endpoint error: 500')));
  });

  it('classifies "Chat endpoint error: 503" as transient', function() {
    assert.ok(_isTransientError(new Error('Chat endpoint error: 503')));
  });

  it('classifies Supabase { status: 500 } as transient', function() {
    assert.ok(_isTransientError({ status: 500, message: 'Internal Server Error' }));
  });

  it('classifies Supabase { status: 0 } as transient (network drop)', function() {
    assert.ok(_isTransientError({ status: 0, message: 'network error' }));
  });

  it('classifies plain string "network timeout" as transient', function() {
    assert.ok(_isTransientError('network timeout connecting to db'));
  });

  // \u2500\u2500 Must NOT classify as transient \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  it('does NOT classify "Chat endpoint error: 400" as transient', function() {
    assert.equal(_isTransientError(new Error('Chat endpoint error: 400')), false);
  });

  it('does NOT classify "Chat endpoint error: 401" as transient', function() {
    assert.equal(_isTransientError(new Error('Chat endpoint error: 401')), false);
  });

  it('does NOT classify Supabase { status: 403 } as transient', function() {
    assert.equal(_isTransientError({ status: 403, message: 'Forbidden' }), false);
  });

  it('does NOT classify a generic Error as transient', function() {
    assert.equal(_isTransientError(new Error('Something went wrong in the UI')), false);
  });

  it('does NOT classify null or undefined as transient', function() {
    assert.equal(_isTransientError(null),      false);
    assert.equal(_isTransientError(undefined), false);
  });

});


// ════════════════════════════════════════════════════════════
// 19. withRetry \u2014 behavior
//
//  Tests retry counting, success path, exhaustion, error shape
//  preservation, and console log output.
//
//  global.setTimeout is replaced with a synchronous no-op inside
//  each test so tests run instantly without real delays.
// ════════════════════════════════════════════════════════════

describe('19. withRetry \u2014 behavior', function() {

  // Returns a fn that throws a transient error N times, then resolves.
  function flakyThrow(failCount, successValue) {
    var calls = 0;
    return function() {
      calls++;
      if (calls <= failCount) {
        return Promise.reject(new Error('Chat endpoint error: 503'));
      }
      return Promise.resolve(successValue);
    };
  }

  // Returns a fn that resolves with { data: null, error } N times, then resolves success.
  function flakyDA(failCount, successValue) {
    var calls = 0;
    return function() {
      calls++;
      if (calls <= failCount) {
        return Promise.resolve({ data: null, error: { status: 503, message: 'Service unavailable' } });
      }
      return Promise.resolve(successValue);
    };
  }

  it('succeeds on first try \u2014 returns result, no retry logs', async function() {
    var _origTimeout = global.setTimeout;
    var logs         = [];
    var _origLog     = console.log;
    global.setTimeout = function(fn) { fn(); return 0; };
    console.log = function() { logs.push(Array.from(arguments).join(' ')); };
    try {
      var result = await withRetry(function() {
        return Promise.resolve({ text: 'ok', structured: null });
      }, 'test.success');
      assert.deepEqual(result, { text: 'ok', structured: null });
      var retryLogs = logs.filter(function(l) { return l.includes('[AAAI RETRY]'); });
      assert.equal(retryLogs.length, 0, 'No [AAAI RETRY] logs expected on first-attempt success');
    } finally {
      global.setTimeout = _origTimeout;
      console.log       = _origLog;
    }
  });

  it('retries once after transient failure \u2014 returns second-attempt success', async function() {
    var _origTimeout = global.setTimeout;
    var logs         = [];
    var _origLog     = console.log;
    global.setTimeout = function(fn) { fn(); return 0; };
    console.log = function() { logs.push(Array.from(arguments).join(' ')); };
    try {
      var result = await withRetry(flakyThrow(1, { text: 'recovered' }), 'test.retry1');
      assert.deepEqual(result, { text: 'recovered' });
      var retryLogs = logs.filter(function(l) { return l.includes('[AAAI RETRY]'); });
      assert.equal(retryLogs.length, 1, 'Exactly one [AAAI RETRY] log expected');
      assert.ok(retryLogs[0].includes('attempt 2/3'), 'Log must say "attempt 2/3"');
    } finally {
      global.setTimeout = _origTimeout;
      console.log       = _origLog;
    }
  });

  it('retries twice \u2014 succeeds on third attempt', async function() {
    var _origTimeout = global.setTimeout;
    global.setTimeout = function(fn) { fn(); return 0; };
    try {
      var result = await withRetry(flakyThrow(2, { text: 'third-time' }), 'test.retry2');
      assert.deepEqual(result, { text: 'third-time' });
    } finally {
      global.setTimeout = _origTimeout;
    }
  });

  it('exhausts all three attempts \u2014 throws lastErr', async function() {
    var _origTimeout = global.setTimeout;
    var errors       = [];
    var _origError   = console.error;
    global.setTimeout = function(fn) { fn(); return 0; };
    console.error = function() { errors.push(Array.from(arguments).join(' ')); };
    try {
      await assert.rejects(
        withRetry(flakyThrow(3, null), 'test.exhausted'),
        /Chat endpoint error: 503/
      );
      assert.equal(errors.length, 1, 'Exactly one console.error on exhaustion');
      assert.ok(errors[0].includes('[AAAI RETRY]'),        'Error log must carry [AAAI RETRY] prefix');
      assert.ok(errors[0].includes('all 3 attempts failed'), 'Error log must say "all 3 attempts failed"');
    } finally {
      global.setTimeout = _origTimeout;
      console.error     = _origError;
    }
  });

  it('non-transient failure \u2014 fn called once, throws immediately, no retry logs', async function() {
    var _origTimeout = global.setTimeout;
    var logs         = [];
    var _origLog     = console.log;
    var callCount    = 0;
    global.setTimeout = function(fn) { fn(); return 0; };
    console.log = function() { logs.push(Array.from(arguments).join(' ')); };
    try {
      await assert.rejects(
        withRetry(function() {
          callCount++;
          return Promise.reject(new Error('Chat endpoint error: 400'));
        }, 'test.nontransient'),
        /Chat endpoint error: 400/
      );
      assert.equal(callCount, 1, 'fn must be called exactly once for non-transient error');
      var retryLogs = logs.filter(function(l) { return l.includes('[AAAI RETRY]'); });
      assert.equal(retryLogs.length, 0, 'No [AAAI RETRY] logs for non-transient error');
    } finally {
      global.setTimeout = _origTimeout;
      console.log       = _origLog;
    }
  });

  it('DataAccess shape \u2014 retries transient { data, error }, returns success on recovery', async function() {
    var _origTimeout = global.setTimeout;
    global.setTimeout = function(fn) { fn(); return 0; };
    try {
      var success = { data: { id: 'abc-123' }, error: null };
      var result  = await withRetry(flakyDA(1, success), 'test.da.retry');
      assert.deepEqual(result, success);
    } finally {
      global.setTimeout = _origTimeout;
    }
  });

  it('DataAccess shape \u2014 preserves { data: null, error } on exhaustion', async function() {
    var _origTimeout = global.setTimeout;
    var errors       = [];
    var _origError   = console.error;
    global.setTimeout = function(fn) { fn(); return 0; };
    console.error = function() { errors.push(Array.from(arguments).join(' ')); };
    try {
      var result = await withRetry(flakyDA(3, null), 'test.da.exhausted');
      assert.equal(result.data,  null, 'data must be null on DA exhaustion');
      assert.ok(result.error,          'error must be present on DA exhaustion');
      assert.equal(errors.length, 1,   'Exactly one console.error on DA exhaustion');
    } finally {
      global.setTimeout = _origTimeout;
      console.error     = _origError;
    }
  });

  it('retry log format \u2014 carries context label, attempt number, and delay', async function() {
    var _origTimeout = global.setTimeout;
    var logs         = [];
    var _origLog     = console.log;
    global.setTimeout = function(fn) { fn(); return 0; };
    console.log = function() { logs.push(Array.from(arguments).join(' ')); };
    try {
      await withRetry(flakyThrow(1, 'done'), 'my.context.label');
      var retryLog = logs.find(function(l) { return l.includes('[AAAI RETRY]'); });
      assert.ok(retryLog,                                  'Retry log not found');
      assert.ok(retryLog.includes('[my.context.label]'),   'Context label missing from log');
      assert.ok(retryLog.includes('attempt 2/3'),          'Attempt counter missing from log');
      assert.ok(retryLog.includes('waiting 300ms'),        '300ms delay missing from attempt-2 log');
    } finally {
      global.setTimeout = _origTimeout;
      console.log       = _origLog;
    }
  });

  it('non-transient DataAccess shape \u2014 returns immediately without retry', async function() {
    var _origTimeout = global.setTimeout;
    var callCount    = 0;
    global.setTimeout = function(fn) { fn(); return 0; };
    try {
      var result = await withRetry(function() {
        callCount++;
        // 422 = validation error, not transient
        return Promise.resolve({ data: null, error: { status: 422, message: 'Validation failed' } });
      }, 'test.da.nontransient');
      assert.equal(callCount,          1,   'fn must be called exactly once for non-transient DA error');
      assert.equal(result.data,        null);
      assert.equal(result.error.status, 422);
    } finally {
      global.setTimeout = _origTimeout;
    }
  });

});


// ════════════════════════════════════════════════════════════
// 20. checklist-manager \u2014 retry wrapper integration
//
//  Loads the real checklist-manager module and verifies that
//  ChecklistManager.transition() routes through window.AAAI.withRetry
//  when available, falls back to a direct DA call when absent,
//  and passes the correct context label for each status route.
// ════════════════════════════════════════════════════════════

describe('20. checklist-manager \u2014 retry wrapper', function() {

  before(function() {
    loadModule('js/aios/checklist-manager.js'); // \u2192 window.AIOS.Checklist
  });

  it('transition uses window.AAAI.withRetry when available', async function() {
    window.AIOS.Checklist.buildDbIds(
      [{ id: 'wr-uuid-1', sort_order: 0, status: 'not_started' }], 'mission-wr-1'
    );
    var retryCtx = null;
    window.AAAI.withRetry = function(fn, ctx) { retryCtx = ctx; return fn(); };
    window.AAAI.DataAccess = {
      checklistItems: {
        toggle:       function() { return Promise.resolve({ data: { id: 'wr-uuid-1' }, error: null }); },
        reopen:       function() { return Promise.resolve({ data: {}, error: null }); },
        updateStatus: function() { return Promise.resolve({ data: {}, error: null }); }
      }
    };
    var result = await window.AIOS.Checklist.transition(0, 'completed');
    assert.equal(result.error, null,      'transition returned an error');
    assert.ok(retryCtx !== null,          'withRetry was not called');
    assert.equal(retryCtx, 'checklist.toggle', 'Wrong context label passed to withRetry');
  });

  it('transition routes completed \u2192 DA.toggle with context "checklist.toggle"', async function() {
    window.AIOS.Checklist.buildDbIds(
      [{ id: 'wr-uuid-2', sort_order: 0, status: 'not_started' }], 'mission-wr-2'
    );
    var toggleCalled = false;
    var capturedCtx  = null;
    window.AAAI.withRetry = function(fn, ctx) { capturedCtx = ctx; return fn(); };
    window.AAAI.DataAccess = {
      checklistItems: {
        toggle:       function() { toggleCalled = true; return Promise.resolve({ data: {}, error: null }); },
        reopen:       function() { return Promise.resolve({ data: {}, error: null }); },
        updateStatus: function() { return Promise.resolve({ data: {}, error: null }); }
      }
    };
    await window.AIOS.Checklist.transition(0, 'completed');
    assert.ok(toggleCalled,                'DA.toggle was not called');
    assert.equal(capturedCtx, 'checklist.toggle');
  });

  it('transition routes reopen \u2192 DA.reopen with context "checklist.reopen"', async function() {
    // status: 'completed' \u2192 transitioning to 'not_started' triggers the reopen path
    window.AIOS.Checklist.buildDbIds(
      [{ id: 'wr-uuid-3', sort_order: 0, status: 'completed' }], 'mission-wr-3'
    );
    var reopenCalled = false;
    var capturedCtx  = null;
    window.AAAI.withRetry = function(fn, ctx) { capturedCtx = ctx; return fn(); };
    window.AAAI.DataAccess = {
      checklistItems: {
        toggle:       function() { return Promise.resolve({ data: {}, error: null }); },
        reopen:       function() { reopenCalled = true; return Promise.resolve({ data: {}, error: null }); },
        updateStatus: function() { return Promise.resolve({ data: {}, error: null }); }
      }
    };
    await window.AIOS.Checklist.transition(0, 'not_started');
    assert.ok(reopenCalled,               'DA.reopen was not called');
    assert.equal(capturedCtx, 'checklist.reopen');
  });

  it('transition falls back to direct DA call when window.AAAI.withRetry is absent', async function() {
    window.AIOS.Checklist.buildDbIds(
      [{ id: 'wr-uuid-4', sort_order: 0, status: 'not_started' }], 'mission-wr-4'
    );
    window.AAAI.withRetry = undefined; // simulate pre-app.js-load state
    var toggleCalled = false;
    window.AAAI.DataAccess = {
      checklistItems: {
        toggle:       function() { toggleCalled = true; return Promise.resolve({ data: { id: 'wr-uuid-4' }, error: null }); },
        reopen:       function() { return Promise.resolve({ data: {}, error: null }); },
        updateStatus: function() { return Promise.resolve({ data: {}, error: null }); }
      }
    };
    var result = await window.AIOS.Checklist.transition(0, 'completed');
    assert.ok(toggleCalled,    'DA.toggle was not called via fallback path');
    assert.equal(result.error, null);
  });

});
