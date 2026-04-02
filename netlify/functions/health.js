// AfterAction AI — Health Check Endpoint
// Deploys as Netlify Function at /.netlify/functions/health
//
// Returns a JSON health report with:
//   ok        — boolean: true if all critical env vars are present
//   service   — string identifier for this service
//   timestamp — ISO 8601 UTC timestamp of the check
//   version   — static version/phase identifier
//   checks    — object with individual signal results
//
// HTTP 200 when ok === true
// HTTP 503 when ok === false (critical config missing)
//
// Security:
//   - Never exposes secret values — presence-only checks
//   - No external calls, no DB writes, no auth required
//   - Safe to call from monitoring tools or status pages

'use strict';

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

// Critical env vars — presence required for ok === true
const CRITICAL_VARS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY'
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // ── Build checks ────────────────────────────────────────────
  const checks = {
    function_booted:             true,
    openai_api_key_present:      Boolean(process.env.OPENAI_API_KEY),
    anthropic_api_key_present:   Boolean(process.env.ANTHROPIC_API_KEY),
    supabase_url_present:        Boolean(process.env.SUPABASE_URL),
    supabase_service_key_present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  };

  // ok === true only if every critical var is present
  const ok = CRITICAL_VARS.every(function(varName) {
    return Boolean(process.env[varName]);
  });

  const body = JSON.stringify({
    ok:        ok,
    service:   'afteraction-ai',
    timestamp: new Date().toISOString(),
    version:   'phase-r',
    checks:    checks
  });

  return {
    statusCode: ok ? 200 : 503,
    headers:    HEADERS,
    body:       body
  };
};
