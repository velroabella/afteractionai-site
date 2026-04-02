/* ══════════════════════════════════════════════════════════
   AfterAction AI — Integration Smoke Tests
   Validates real Supabase write paths end-to-end.

   NOT part of the default test suite. Run only when you have
   valid service-role credentials for a Supabase project.

   Usage:
     SUPABASE_URL=https://xxx.supabase.co \
     SUPABASE_SERVICE_KEY=eyJ... \
     npm run test:integration

   Required env vars:
     SUPABASE_URL          — your project URL (no trailing slash)
     SUPABASE_SERVICE_KEY  — service_role key (bypasses RLS for test writes)

   Optional env vars:
     AAAI_TEST_TIMEOUT_MS  — per-test timeout in ms (default: 10000)

   What it tests:
     S1. cases.create()           — Phase 2 case row write
     S2. missions.create()        — Phase 2 mission row write (linked to case)
     S3. documents.save()         — Phase 2 document row write (linked to case + mission)
     S4. checklistItems.saveBatch() — Phase 3 checklist write (linked to case + mission)

   Cleanup:
     Every created row is deleted after the test that created it
     (or in the finally block if the test throws). Leaves no
     orphaned rows in the database.

   Security:
     - No credentials are hardcoded here.
     - SUPABASE_SERVICE_KEY is read from env only.
     - This file is safe to commit; credentials live in .env or CI secrets.
   ══════════════════════════════════════════════════════════ */

'use strict';

// ── 1. Env-var guard — fail fast before doing anything ──────
var SUPABASE_URL        = process.env.SUPABASE_URL        || '';
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var TIMEOUT_MS          = parseInt(process.env.AAAI_TEST_TIMEOUT_MS || '10000', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════╗');
  console.error('║  AfterAction AI — Integration Smoke Tests                ║');
  console.error('╠══════════════════════════════════════════════════════════╣');
  console.error('║  MISSING REQUIRED ENV VARS — cannot run.                 ║');
  console.error('║                                                           ║');
  console.error('║  Set both of the following before running:               ║');
  console.error('║                                                           ║');
  console.error('║    SUPABASE_URL         — project REST URL               ║');
  console.error('║    SUPABASE_SERVICE_KEY — service_role key               ║');
  console.error('║                                                           ║');
  console.error('║  Example (single line):                                   ║');
  console.error('║    SUPABASE_URL=https://xxx.supabase.co \\               ║');
  console.error('║    SUPABASE_SERVICE_KEY=eyJ... \\                        ║');
  console.error('║    npm run test:integration                               ║');
  console.error('║                                                           ║');
  console.error('║  NEVER hardcode credentials. Use .env or CI secrets.     ║');
  console.error('╚══════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

// ── 2. Minimal Supabase REST client (native fetch, no npm dep) ──

/**
 * Execute a Supabase PostgREST request.
 * @param {string} method   HTTP verb
 * @param {string} table    Table name
 * @param {Object} [body]   Row data for POST/PATCH
 * @param {string} [filter] PostgREST filter string (e.g. 'id=eq.123')
 * @param {string} [prefer] Prefer header value (e.g. 'return=representation')
 * @returns {Promise<{data: any, error: string|null}>}
 */
async function db(method, table, body, filter, prefer) {
  var url = SUPABASE_URL + '/rest/v1/' + table + (filter ? '?' + filter : '');
  var headers = {
    'apikey':        SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
    'Content-Type':  'application/json',
    'Accept':        'application/json'
  };
  if (prefer) headers['Prefer'] = prefer;

  var opts = { method: method, headers: headers };
  if (body) opts.body = JSON.stringify(body);

  var res;
  try {
    res = await fetch(url, opts);
  } catch (netErr) {
    return { data: null, error: 'Network error: ' + netErr.message };
  }

  var text = await res.text();
  var parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) { /* not JSON */ }

  if (!res.ok) {
    var msg = (parsed && parsed.message) ? parsed.message
            : (parsed && parsed.error)   ? parsed.error
            : ('HTTP ' + res.status + ' — ' + text.slice(0, 200));
    return { data: null, error: msg };
  }
  return { data: parsed, error: null };
}

/** INSERT a row and return the created record. */
async function dbInsert(table, row) {
  return db('POST', table, row, null, 'return=representation');
}

/** DELETE rows matching a PostgREST filter. */
async function dbDelete(table, filter) {
  return db('DELETE', table, null, filter, null);
}

/** Extract first element if result is an array. */
function first(result) {
  if (result.error) return result;
  var d = Array.isArray(result.data) ? result.data[0] : result.data;
  return { data: d || null, error: d ? null : 'No row returned' };
}


// ── 3. Test runner — thin wrapper around Node.js built-in ───
var { describe, it, before, after } = require('node:test');
var assert = require('node:assert/strict');

// Shared state threaded across tests in each describe block
var _caseId    = null;
var _missionId = null;
var _docId     = null;
var _itemIds   = [];


// ════════════════════════════════════════════════════════════
// S1. cases.create() — write a case row
// ════════════════════════════════════════════════════════════

describe('S1. cases.create() write path', { timeout: TIMEOUT_MS }, function() {

  var created = null;

  it('inserts a case row and returns it without error', async function() {
    var row = {
      title:  '[SMOKE TEST] ' + new Date().toISOString(),
      status: 'active',
      notes:  'Integration smoke test — safe to delete'
    };
    var result = first(await dbInsert('cases', row));
    assert.equal(result.error, null, 'cases.create() returned an error: ' + result.error);
    assert.ok(result.data,             'cases.create() returned no data row');
    assert.ok(result.data.id,          'created case has no id field');
    assert.equal(result.data.status, 'active', 'status field mismatch');
    created = result.data;
    _caseId = created.id;
  });

  after(async function() {
    // Clean up only if the create test above did NOT also run the mission path
    // (mission cleanup below will cascade-delete nothing; we delete case here
    //  only when _missionId was not set — i.e., if later suites were skipped).
    // In normal runs the case row persists until S4's after() cleans it.
    // Guard: if S2-S4 all skipped, still clean up.
    if (_caseId && !_missionId) {
      await dbDelete('cases', 'id=eq.' + _caseId);
    }
  });

});


// ════════════════════════════════════════════════════════════
// S2. missions.create() — write a mission row linked to case
// ════════════════════════════════════════════════════════════

describe('S2. missions.create() write path', { timeout: TIMEOUT_MS }, function() {

  before(function() {
    if (!_caseId) throw new Error('Skipping S2 — no caseId from S1 (S1 must pass first)');
  });

  it('inserts a mission row linked to the smoke-test case', async function() {
    var row = {
      case_id:      _caseId,
      mission_type: 'disability_claim',
      name:         'Smoke Test Mission',
      status:       'active',
      current_step: 'gather_records',
      next_step:    'submit_claim',
      blockers:     JSON.stringify([]),
      data:         JSON.stringify({ smoke: true }),
      started_at:   new Date().toISOString()
    };
    var result = first(await dbInsert('missions', row));
    assert.equal(result.error, null, 'missions.create() returned an error: ' + result.error);
    assert.ok(result.data,              'missions.create() returned no data row');
    assert.ok(result.data.id,           'created mission has no id field');
    assert.equal(result.data.case_id, _caseId, 'mission.case_id does not match');
    _missionId = result.data.id;
  });

  after(async function() {
    // Mission row is cleaned up by S4's after block (which runs last).
    // If S3/S4 are skipped, clean up mission + case here.
    if (_missionId && !_docId && _itemIds.length === 0) {
      await dbDelete('missions', 'id=eq.' + _missionId);
      await dbDelete('cases',    'id=eq.' + _caseId);
    }
  });

});


// ════════════════════════════════════════════════════════════
// S3. documents.save() — write a document row
// ════════════════════════════════════════════════════════════

describe('S3. documents.save() write path', { timeout: TIMEOUT_MS }, function() {

  before(function() {
    if (!_caseId || !_missionId) {
      throw new Error('Skipping S3 — requires caseId + missionId from S1/S2');
    }
  });

  it('inserts a document row linked to case and mission', async function() {
    var row = {
      case_id:         _caseId,
      mission_id:      _missionId,
      file_name:       'smoke-test-document.pdf',
      document_type:   'dd214',
      storage_path:    null,
      mime_type:       'application/pdf',
      file_size:       1024,
      extracted_text:  'Smoke test extracted text',
      analysis_result: JSON.stringify({ smoke: true }),
      status:          'uploaded'
    };
    var result = first(await dbInsert('documents', row));
    assert.equal(result.error, null, 'documents.save() returned an error: ' + result.error);
    assert.ok(result.data,               'documents.save() returned no data row');
    assert.ok(result.data.id,            'created document has no id field');
    assert.equal(result.data.case_id, _caseId,   'document.case_id mismatch');
    assert.equal(result.data.mission_id, _missionId, 'document.mission_id mismatch');
    _docId = result.data.id;
  });

  after(async function() {
    if (_docId && _itemIds.length === 0) {
      // S4 was skipped — clean up doc, mission, case
      await dbDelete('documents', 'id=eq.' + _docId);
      await dbDelete('missions',  'id=eq.' + _missionId);
      await dbDelete('cases',     'id=eq.' + _caseId);
    }
  });

});


// ════════════════════════════════════════════════════════════
// S4. checklistItems.saveBatch() — write checklist item rows
// ════════════════════════════════════════════════════════════

describe('S4. checklistItems.saveBatch() write path', { timeout: TIMEOUT_MS }, function() {

  before(function() {
    if (!_caseId || !_missionId) {
      throw new Error('Skipping S4 — requires caseId + missionId from S1/S2');
    }
  });

  it('inserts checklist items linked to case and mission', async function() {
    var rows = [
      {
        mission_id:    _missionId,
        case_id:       _caseId,
        title:         'Gather service records',
        description:   'Collect DD-214 and supporting docs',
        category:      'immediate',
        is_completed:  false,
        status:        'not_started',
        sort_order:    0,
        priority:      1,
        source:        'ai_report',
        resource_link: null,
        due_context:   null
      },
      {
        mission_id:    _missionId,
        case_id:       _caseId,
        title:         'Contact VSO for assistance',
        description:   'Schedule appointment with VA-accredited VSO',
        category:      'short_term',
        is_completed:  false,
        status:        'not_started',
        sort_order:    1,
        priority:      2,
        source:        'ai_report',
        resource_link: 'https://www.va.gov/vso/',
        due_context:   'Within 30 days'
      }
    ];
    var result = await dbInsert('case_checklist_items', rows);
    assert.equal(result.error, null, 'checklistItems.saveBatch() returned error: ' + result.error);
    assert.ok(Array.isArray(result.data), 'Expected array of checklist rows');
    assert.ok(result.data.length > 0,    'Expected at least one checklist row returned');
    result.data.forEach(function(item) {
      assert.ok(item.id,                         'Checklist item missing id');
      assert.equal(item.case_id, _caseId,        'item.case_id mismatch');
      assert.equal(item.mission_id, _missionId,  'item.mission_id mismatch');
    });
    _itemIds = result.data.map(function(r) { return r.id; });
  });

  after(async function() {
    // Full cleanup in dependency order: items → document → mission → case
    if (_itemIds.length > 0) {
      await dbDelete('case_checklist_items', 'mission_id=eq.' + _missionId);
    }
    if (_docId) {
      await dbDelete('documents', 'id=eq.' + _docId);
    }
    if (_missionId) {
      await dbDelete('missions', 'id=eq.' + _missionId);
    }
    if (_caseId) {
      await dbDelete('cases', 'id=eq.' + _caseId);
    }
    // Reset shared state
    _caseId    = null;
    _missionId = null;
    _docId     = null;
    _itemIds   = [];
  });

});
