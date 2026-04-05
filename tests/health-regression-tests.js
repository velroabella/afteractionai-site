/* ══════════════════════════════════════════════════════════
   AfterAction AI — Health Endpoint Regression Tests
   Runner: Node.js built-in (node --test)

   Covers netlify/functions/health.js:
    21. Health endpoint — HTTP routing, response shape,
        env-var gating, secret safety, CORS headers

   Strategy:
     require() the CommonJS handler directly — no browser
     globals or vm extraction needed. process.env is read
     at call time inside the handler, so each test sets and
     restores env vars inline around the handler invocation.
   ══════════════════════════════════════════════════════════ */

'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const path             = require('node:path');

const SITE    = path.resolve(__dirname, '..');
const handler = require(path.join(SITE, 'netlify/functions/health.js')).handler;

// ── env helpers ─────────────────────────────────────────────
var ALL_VARS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

// Save current env state so tests are non-destructive
var _originals = {};
ALL_VARS.forEach(function(k) { _originals[k] = process.env[k]; });

function withEnv(overrides, fn) {
  // Set overrides (undefined value → delete the var)
  ALL_VARS.forEach(function(k) {
    if (k in overrides) {
      if (overrides[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = overrides[k];
      }
    } else {
      // restore to original for vars not in overrides
      if (_originals[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = _originals[k];
      }
    }
  });
  try {
    return fn();
  } finally {
    // Restore all originals
    ALL_VARS.forEach(function(k) {
      if (_originals[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = _originals[k];
      }
    });
  }
}

// Standard GET event
function getEvent(method) {
  return { httpMethod: method || 'GET' };
}

// Full set of env vars that make the function healthy
var ALL_PRESENT = {
  OPENAI_API_KEY:         'sk-test-openai',
  ANTHROPIC_API_KEY:      'sk-ant-test',
  SUPABASE_URL:           'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test'
};

// ════════════════════════════════════════════════════════════
// 21. Health endpoint — routing, shape, gating, safety
// ════════════════════════════════════════════════════════════

describe('21. health endpoint', function() {

  // ── Healthy path ─────────────────────────────────────────

  it('GET with all env vars → statusCode 200', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    assert.equal(res.statusCode, 200);
  });

  it('GET with all env vars → ok === true', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(body.ok, true);
  });

  it('GET with all env vars → body is valid JSON', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    assert.doesNotThrow(function() { JSON.parse(res.body); });
  });

  it('response includes service string', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(typeof body.service, 'string');
    assert.ok(body.service.length > 0, 'service must be non-empty');
  });

  it('response includes ISO timestamp', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(typeof body.timestamp, 'string');
    assert.ok(!isNaN(Date.parse(body.timestamp)), 'timestamp must be parseable as a date');
  });

  it('response includes version string', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(typeof body.version, 'string');
    assert.ok(body.version.length > 0, 'version must be non-empty');
  });

  it('checks.function_booted === true', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(body.checks.function_booted, true);
  });

  it('checks.openai_api_key_present === true when OPENAI_API_KEY is set', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(body.checks.openai_api_key_present, true);
  });

  it('checks.anthropic_api_key_present === true when ANTHROPIC_API_KEY is set', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(body.checks.anthropic_api_key_present, true);
  });

  // ── Unhealthy path ───────────────────────────────────────

  it('missing OPENAI_API_KEY → statusCode 503', async function() {
    var env = Object.assign({}, ALL_PRESENT, { OPENAI_API_KEY: undefined });
    var res = await withEnv(env, function() {
      return handler(getEvent('GET'));
    });
    assert.equal(res.statusCode, 503);
  });

  it('missing OPENAI_API_KEY → ok === false', async function() {
    var env = Object.assign({}, ALL_PRESENT, { OPENAI_API_KEY: undefined });
    var res = await withEnv(env, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(body.ok, false);
  });

  it('missing ANTHROPIC_API_KEY → statusCode 503', async function() {
    var env = Object.assign({}, ALL_PRESENT, { ANTHROPIC_API_KEY: undefined });
    var res = await withEnv(env, function() {
      return handler(getEvent('GET'));
    });
    assert.equal(res.statusCode, 503);
  });

  it('missing ANTHROPIC_API_KEY → ok === false', async function() {
    var env = Object.assign({}, ALL_PRESENT, { ANTHROPIC_API_KEY: undefined });
    var res = await withEnv(env, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(body.ok, false);
  });

  it('both critical keys missing → statusCode 503', async function() {
    var env = Object.assign({}, ALL_PRESENT, {
      OPENAI_API_KEY:    undefined,
      ANTHROPIC_API_KEY: undefined
    });
    var res = await withEnv(env, function() {
      return handler(getEvent('GET'));
    });
    assert.equal(res.statusCode, 503);
  });

  it('missing critical keys → checks reflect false for missing vars', async function() {
    var env = Object.assign({}, ALL_PRESENT, {
      OPENAI_API_KEY:    undefined,
      ANTHROPIC_API_KEY: undefined
    });
    var res = await withEnv(env, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(body.checks.openai_api_key_present,    false);
    assert.equal(body.checks.anthropic_api_key_present, false);
  });

  // ── Supabase vars do NOT gate ok ─────────────────────────

  it('Supabase vars absent but critical vars present → ok === true', async function() {
    var env = Object.assign({}, ALL_PRESENT, {
      SUPABASE_URL:              undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    });
    var res = await withEnv(env, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(res.statusCode, 200);
  });

  it('Supabase vars absent → supabase checks report false', async function() {
    var env = Object.assign({}, ALL_PRESENT, {
      SUPABASE_URL:              undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    });
    var res = await withEnv(env, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    assert.equal(body.checks.supabase_url_present,         false);
    assert.equal(body.checks.supabase_service_key_present, false);
  });

  // ── Method handling ──────────────────────────────────────

  it('OPTIONS → statusCode 204', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('OPTIONS'));
    });
    assert.equal(res.statusCode, 204);
  });

  it('POST → statusCode 405', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('POST'));
    });
    assert.equal(res.statusCode, 405);
  });

  it('PUT → statusCode 405', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('PUT'));
    });
    assert.equal(res.statusCode, 405);
  });

  // ── CORS headers ─────────────────────────────────────────

  it('GET response includes Access-Control-Allow-Origin header', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    assert.ok(
      'Access-Control-Allow-Origin' in res.headers,
      'CORS header must be present'
    );
  });

  it('OPTIONS response includes Access-Control-Allow-Origin header', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('OPTIONS'));
    });
    assert.ok(
      'Access-Control-Allow-Origin' in res.headers,
      'CORS header must be present on preflight'
    );
  });

  it('503 response includes CORS headers', async function() {
    var env = Object.assign({}, ALL_PRESENT, { OPENAI_API_KEY: undefined });
    var res = await withEnv(env, function() {
      return handler(getEvent('GET'));
    });
    assert.ok(
      'Access-Control-Allow-Origin' in res.headers,
      'CORS header must be present on 503'
    );
  });

  // ── Secret safety ────────────────────────────────────────

  it('env checks contain only booleans — not string values', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    var body = JSON.parse(res.body);
    var envCheckKeys = [
      'openai_api_key_present',
      'anthropic_api_key_present',
      'supabase_url_present',
      'supabase_service_key_present'
    ];
    envCheckKeys.forEach(function(key) {
      assert.equal(
        typeof body.checks[key],
        'boolean',
        'checks.' + key + ' must be a boolean, not a ' + typeof body.checks[key]
      );
    });
  });

  it('response body does not contain any secret values', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler(getEvent('GET'));
    });
    // The actual values set in ALL_PRESENT must not appear in the response
    var secrets = [
      ALL_PRESENT.OPENAI_API_KEY,
      ALL_PRESENT.ANTHROPIC_API_KEY,
      ALL_PRESENT.SUPABASE_SERVICE_ROLE_KEY
    ];
    secrets.forEach(function(secret) {
      assert.ok(
        !res.body.includes(secret),
        'response body must not contain secret value: ' + secret.substring(0, 6) + '...'
      );
    });
  });

  it('response body does not echo httpMethod from request', async function() {
    var res = await withEnv(ALL_PRESENT, function() {
      return handler({ httpMethod: 'GET', headers: { 'x-probe': 'injected-value' } });
    });
    assert.ok(
      !res.body.includes('injected-value'),
      'response must not echo request header data'
    );
  });

});
