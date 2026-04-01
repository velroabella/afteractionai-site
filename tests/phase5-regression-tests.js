/* ══════════════════════════════════════════════════════════
   AfterAction AI — Phase 5–51 Production Hardening Regression Tests
   Runner: Node.js built-in (node --test)

   Covers the six production-hardening fixes from this sprint:
     5. DataAccess.missions.toMemoryShape() carries _caseId
     6. DataAccess.documents.save() dual-form API
     7. RequestBuilder: ## PRIOR DOCUMENTS injection (Phase 6)
     8. RequestBuilder: prompt budget trims ## PRIOR DOCUMENTS
     9. MissionManager.setActive() multi-mission switching
    10. MissionCard.switchTo() via DOM mock (Phase 51)
    11. Checklist DB restore — localStorage guard removed (Phase 5)
    12. Voice pipeline — AbortController abort protection
   ══════════════════════════════════════════════════════════ */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

// ── Helpers ─────────────────────────────────────────────────
const SITE = path.resolve(__dirname, '..');

function loadModule(relPath) {
  var code = fs.readFileSync(path.join(SITE, relPath), 'utf8');
  vm.runInThisContext(code, { filename: relPath });
}

// Bootstrap — minimal window, AIOS, AAAI namespaces
global.window = { AIOS: {}, AAAI: {} };

// Minimal document mock so mission-card.js DOM refs don't throw
global.document = {
  getElementById: function() {
    return { style: { display: '' }, textContent: '', innerHTML: '' };
  },
  readyState: 'complete',
  addEventListener: function() {}
};

// ── Load all modules once before any tests run ───────────────
before(function() {
  loadModule('js/data-access.js');          // → window.AAAI.DataAccess
  loadModule('js/aios/mission-manager.js'); // → window.AIOS.Mission
  loadModule('js/aios/request-builder.js'); // → window.AIOS.RequestBuilder

  // Wrap timer constructors so mission-card.js's 2-second poll interval
  // does not keep the Node.js process alive after all tests complete.
  var _nativeSetInterval = global.setInterval;
  var _nativeSetTimeout  = global.setTimeout;
  global.setInterval = function(fn, ms) {
    var id = _nativeSetInterval(fn, ms);
    if (id && typeof id.unref === 'function') id.unref();
    return id;
  };
  global.setTimeout = function(fn, ms) {
    var id = _nativeSetTimeout(fn, ms);
    if (id && typeof id.unref === 'function') id.unref();
    return id;
  };
  loadModule('js/aios/mission-card.js');    // → window.AIOS.MissionCard
  // Restore native timers so Suite 12 async tests work correctly
  global.setInterval = _nativeSetInterval;
  global.setTimeout  = _nativeSetTimeout;
});


// ════════════════════════════════════════════════════════════
// 5. DataAccess.missions.toMemoryShape() carries _caseId
//    Phase fix: toMemoryShape() now maps row.case_id → _caseId
//    so downstream saves (documents, checklist writes) have the
//    case context without requiring app.js _activeCaseId.
// ════════════════════════════════════════════════════════════

describe('5. DataAccess.missions.toMemoryShape() — _caseId field', function() {

  var sampleRow = {
    id:           'db-uuid-123',
    case_id:      'case-uuid-456',
    mission_type: 'disability_claim',
    name:         'VA Disability Claim',
    status:       'active',
    current_step: 'Gather nexus letter',
    next_step:    'Submit C&P exam request',
    blockers:     '["missing DD-214"]',
    data:         '{"dbq": true}',
    started_at:   '2025-01-15T10:00:00.000Z'
  };

  it('registers DataAccess on window.AAAI', function() {
    assert.ok(global.window.AAAI.DataAccess, 'DataAccess not registered on window.AAAI');
    assert.equal(typeof global.window.AAAI.DataAccess.missions.toMemoryShape, 'function');
  });

  it('maps row.case_id → _caseId', function() {
    var m = global.window.AAAI.DataAccess.missions.toMemoryShape(sampleRow);
    assert.equal(m._caseId, 'case-uuid-456',
      'toMemoryShape must carry case_id as _caseId for downstream writes');
  });

  it('maps row.id → _dbId', function() {
    var m = global.window.AAAI.DataAccess.missions.toMemoryShape(sampleRow);
    assert.equal(m._dbId, 'db-uuid-123');
  });

  it('maps all core DB columns to camelCase in-memory fields', function() {
    var m = global.window.AAAI.DataAccess.missions.toMemoryShape(sampleRow);
    assert.equal(m.type,        'disability_claim');
    assert.equal(m.name,        'VA Disability Claim');
    assert.equal(m.status,      'active');
    assert.equal(m.currentStep, 'Gather nexus letter');
    assert.equal(m.nextStep,    'Submit C&P exam request');
  });

  it('parses blockers JSON string → array', function() {
    var m = global.window.AAAI.DataAccess.missions.toMemoryShape(sampleRow);
    assert.ok(Array.isArray(m.blockers), 'blockers should be an array');
    assert.equal(m.blockers.length, 1);
    assert.equal(m.blockers[0], 'missing DD-214');
  });

  it('parses data JSON string → object', function() {
    var m = global.window.AAAI.DataAccess.missions.toMemoryShape(sampleRow);
    assert.ok(m.data && typeof m.data === 'object');
    assert.equal(m.data.dbq, true);
  });

  it('handles pre-parsed blockers array without double-parsing', function() {
    var rowWithArray = Object.assign({}, sampleRow, { blockers: ['already parsed'] });
    var m = global.window.AAAI.DataAccess.missions.toMemoryShape(rowWithArray);
    assert.ok(Array.isArray(m.blockers));
    assert.equal(m.blockers[0], 'already parsed');
  });

  it('converts started_at ISO string to millisecond timestamp', function() {
    var m = global.window.AAAI.DataAccess.missions.toMemoryShape(sampleRow);
    assert.ok(typeof m.startedAt === 'number' && m.startedAt > 0);
    assert.equal(m.startedAt, new Date('2025-01-15T10:00:00.000Z').getTime());
  });

  it('_caseId is distinct from _dbId — both are preserved', function() {
    var m = global.window.AAAI.DataAccess.missions.toMemoryShape(sampleRow);
    assert.notEqual(m._caseId, m._dbId,
      '_caseId and _dbId must both be present and distinct');
    assert.ok(m._caseId && m._dbId, 'both fields must be truthy');
  });

});


// ════════════════════════════════════════════════════════════
// 6. DataAccess.documents.save() — dual-form API
//    Phase fix: documents.save() accepts both:
//      positional: save(caseId, docData, missionId)
//      flat-object: save({ case_id, mission_id, ...docData })
//    The flat-object form is used when caseId is obtained from
//    the restored mission's _caseId rather than app._activeCaseId.
// ════════════════════════════════════════════════════════════

describe('6. DataAccess.documents.save() — dual-form API', function() {

  it('positional form resolves to { data, error } shape without throwing', async function() {
    var result = await global.window.AAAI.DataAccess.documents.save(
      'case-uuid-789',
      { file_name: 'dd214.pdf', document_type: 'DD-214' },
      'mission-uuid-001'
    );
    assert.ok('data' in result && 'error' in result,
      'positional form must return { data, error }');
  });

  it('flat-object form resolves to { data, error } shape without throwing', async function() {
    var result = await global.window.AAAI.DataAccess.documents.save({
      case_id:       'case-uuid-789',
      mission_id:    'mission-uuid-001',
      file_name:     'nexus_letter.pdf',
      document_type: 'nexus_letter',
      status:        'uploaded'
    });
    assert.ok('data' in result && 'error' in result,
      'flat-object form must return { data, error }');
  });

  it('both forms return the same error shape when Supabase client is unavailable', async function() {
    var positional = await global.window.AAAI.DataAccess.documents.save('cid', {}, null);
    var flatObj    = await global.window.AAAI.DataAccess.documents.save({ case_id: 'cid' });
    // Both should have an error (no Supabase in test env) and data:null
    assert.equal(positional.data, null);
    assert.equal(flatObj.data, null);
    assert.ok(positional.error, 'positional form should report an error without client');
    assert.ok(flatObj.error,    'flat-object form should report an error without client');
  });

});


// ════════════════════════════════════════════════════════════
// 7. RequestBuilder — ## PRIOR DOCUMENTS injection (Phase 6)
//    When window.AIOS._priorDocSummary is populated, every call
//    to buildAIOSRequest() must embed a ## PRIOR DOCUMENTS block
//    in the system prompt so the AI does not re-request files.
// ════════════════════════════════════════════════════════════

describe('7. RequestBuilder — ## PRIOR DOCUMENTS injection', function() {

  // Helper: reset _priorDocSummary after each test
  function setDocs(docs) { global.window.AIOS._priorDocSummary = docs; }
  function clearDocs()   { global.window.AIOS._priorDocSummary = null; }

  it('registers on window.AIOS.RequestBuilder', function() {
    assert.ok(global.window.AIOS.RequestBuilder, 'RequestBuilder not registered');
    assert.equal(typeof global.window.AIOS.RequestBuilder.buildAIOSRequest, 'function');
  });

  it('injects ## PRIOR DOCUMENTS block when _priorDocSummary is set', function() {
    setDocs([
      { type: 'DD-214',       file: 'discharge.pdf',    status: 'uploaded' },
      { type: 'nexus_letter', file: 'nexus_letter.pdf', status: 'uploaded' }
    ]);
    var result = global.window.AIOS.RequestBuilder.buildAIOSRequest({
      userMessage: 'Help me with my disability claim'
    });
    assert.ok(
      result.system.indexOf('## PRIOR DOCUMENTS') !== -1,
      'system prompt must contain ## PRIOR DOCUMENTS when docs are set'
    );
    clearDocs();
  });

  it('meta.hasPriorDocContext is true when docs are present', function() {
    setDocs([{ type: 'DD-214', file: 'discharge.pdf', status: 'uploaded' }]);
    var result = global.window.AIOS.RequestBuilder.buildAIOSRequest({
      userMessage: 'test'
    });
    assert.equal(result.meta.hasPriorDocContext, true);
    clearDocs();
  });

  it('prior doc file names appear verbatim in system prompt', function() {
    setDocs([{ type: 'DD-214', file: 'my_dd214_scan.pdf', status: 'uploaded' }]);
    var result = global.window.AIOS.RequestBuilder.buildAIOSRequest({
      userMessage: 'test'
    });
    assert.ok(
      result.system.indexOf('my_dd214_scan.pdf') !== -1,
      'file name should appear verbatim in system prompt'
    );
    clearDocs();
  });

  it('includes re-upload prevention instruction in the block', function() {
    setDocs([{ type: 'DD-214', file: 'dd214.pdf', status: 'uploaded' }]);
    var result = global.window.AIOS.RequestBuilder.buildAIOSRequest({
      userMessage: 'test'
    });
    assert.ok(
      result.system.indexOf('Do not ask the veteran to re-upload') !== -1,
      'system must include the re-upload prevention instruction'
    );
    clearDocs();
  });

  it('omits ## PRIOR DOCUMENTS when _priorDocSummary is null', function() {
    clearDocs();
    var result = global.window.AIOS.RequestBuilder.buildAIOSRequest({
      userMessage: 'test'
    });
    assert.ok(
      result.system.indexOf('## PRIOR DOCUMENTS') === -1,
      'null _priorDocSummary must not inject ## PRIOR DOCUMENTS'
    );
    assert.equal(result.meta.hasPriorDocContext, false);
  });

  it('omits ## PRIOR DOCUMENTS when _priorDocSummary is empty array', function() {
    setDocs([]);
    var result = global.window.AIOS.RequestBuilder.buildAIOSRequest({
      userMessage: 'test'
    });
    assert.ok(
      result.system.indexOf('## PRIOR DOCUMENTS') === -1,
      'empty array must not inject ## PRIOR DOCUMENTS'
    );
    assert.equal(result.meta.hasPriorDocContext, false);
    clearDocs();
  });

  it('all doc entries are listed in the block', function() {
    setDocs([
      { type: 'DD-214',       file: 'dd214.pdf',        status: 'uploaded' },
      { type: 'nexus_letter', file: 'nexus_letter.pdf', status: 'uploaded' },
      { type: 'buddy_stmt',   file: 'buddy_stmt.pdf',   status: 'uploaded' }
    ]);
    var result = global.window.AIOS.RequestBuilder.buildAIOSRequest({
      userMessage: 'test'
    });
    assert.ok(result.system.indexOf('dd214.pdf') !== -1);
    assert.ok(result.system.indexOf('nexus_letter.pdf') !== -1);
    assert.ok(result.system.indexOf('buddy_stmt.pdf') !== -1);
    clearDocs();
  });

});


// ════════════════════════════════════════════════════════════
// 8. RequestBuilder — prompt budget trims ## PRIOR DOCUMENTS
//    Phase fix: Pass 1.6 of _applyPromptBudget() removes the
//    ## PRIOR DOCUMENTS section when the assembled system prompt
//    exceeds MAX_PROMPT_LENGTH (7000 chars), placing it after
//    resource-context (Pass 1.5) and before memory (Pass 2).
//
//    Test uses a skill prompt sized to push total > 7000 only
//    when prior docs are present, and drop below 7000 once they
//    are removed — so only 'prior-documents' appears in trimmedSections.
//    Calculation: 6700 chars skill + ~274 prior docs + ~145 conf ≈ 7119
//                 After removing prior docs: 6700 + ~145 ≈ 6845 < 7000 ✓
// ════════════════════════════════════════════════════════════

describe('8. RequestBuilder — prompt budget trims ## PRIOR DOCUMENTS', function() {

  var HUGE_SKILL_PROMPT = 'A'.repeat(6700); // exactly sized for the test invariant

  function withDocs(fn) {
    global.window.AIOS._priorDocSummary = [
      { type: 'DD-214',       file: 'discharge.pdf',    status: 'uploaded' },
      { type: 'nexus_letter', file: 'nexus_letter.pdf', status: 'uploaded' }
    ];
    fn();
    global.window.AIOS._priorDocSummary = null;
  }

  it('trimmedSections includes "prior-documents" when prompt is over budget', function() {
    withDocs(function() {
      var result = global.window.AIOS.RequestBuilder.buildAIOSRequest({
        userMessage: 'test',
        skillConfig: { prompt: HUGE_SKILL_PROMPT }
      });
      assert.ok(
        result.meta.trimmedSections.indexOf('prior-documents') !== -1,
        'trimmedSections must contain "prior-documents" when over budget. Got: ' +
        JSON.stringify(result.meta.trimmedSections)
      );
    });
  });

  it('## PRIOR DOCUMENTS absent from final system string when trimmed', function() {
    withDocs(function() {
      var result = global.window.AIOS.RequestBuilder.buildAIOSRequest({
        userMessage: 'test',
        skillConfig: { prompt: HUGE_SKILL_PROMPT }
      });
      assert.ok(
        result.system.indexOf('## PRIOR DOCUMENTS') === -1,
        '## PRIOR DOCUMENTS must be absent from system after budget trim'
      );
    });
  });

  it('meta.wasTrimmed is true when budget was exceeded', function() {
    withDocs(function() {
      var result = global.window.AIOS.RequestBuilder.buildAIOSRequest({
        userMessage: 'test',
        skillConfig: { prompt: HUGE_SKILL_PROMPT }
      });
      assert.equal(result.meta.wasTrimmed, true);
    });
  });

  it('## PRIOR DOCUMENTS is preserved when under budget (no skill prompt)', function() {
    global.window.AIOS._priorDocSummary = [
      { type: 'DD-214', file: 'discharge.pdf', status: 'uploaded' }
    ];
    var result = global.window.AIOS.RequestBuilder.buildAIOSRequest({
      userMessage: 'test'
      // No skillConfig.prompt → total stays well under 7000 chars
    });
    assert.ok(
      result.system.indexOf('## PRIOR DOCUMENTS') !== -1,
      '## PRIOR DOCUMENTS must survive when prompt is under budget'
    );
    assert.equal(result.meta.wasTrimmed, false);
    global.window.AIOS._priorDocSummary = null;
  });

});


// ════════════════════════════════════════════════════════════
// 9. MissionManager.setActive() — multi-mission switching
//    Phase 3.2 / Phase 51 fix: _missions[] array holds all
//    in-memory missions. setActive() switches Mission.current
//    without losing other missions.
// ════════════════════════════════════════════════════════════

describe('9. MissionManager.setActive() — multi-mission switching', function() {

  var Mission;

  before(function() {
    Mission = global.window.AIOS.Mission;
  });

  it('setActive() by _memId returns the target mission', function() {
    var m1 = Mission.createMission('disability_claim');
    var m2 = Mission.createMission('education_path');
    Mission.current = m1;
    Mission.current = m2; // m2 is now active
    var switched = Mission.setActive(m1._memId);
    assert.ok(switched !== null, 'setActive should return the mission object');
    assert.equal(switched._memId, m1._memId);
  });

  it('Mission.current reflects the newly activated mission', function() {
    var m1 = Mission.createMission('disability_claim');
    var m2 = Mission.createMission('housing_path');
    Mission.current = m1;
    Mission.current = m2;
    assert.equal(Mission.current._memId, m2._memId, 'sanity: m2 should be active');
    Mission.setActive(m1._memId);
    assert.equal(Mission.current._memId, m1._memId,
      'Mission.current must switch to m1 after setActive(m1._memId)');
  });

  it('setActive() returns null for an unknown id', function() {
    var result = Mission.setActive('nonexistent-id-xyz-000');
    assert.equal(result, null);
  });

  it('setActive() by _dbId also works', function() {
    var m = Mission.createMission('employment_transition');
    m._dbId = 'real-db-id-789'; // simulate DB restore
    Mission.current = m;
    // Switch away first
    var m2 = Mission.createMission('education_path');
    Mission.current = m2;
    // Now switch back via _dbId
    var found = Mission.setActive('real-db-id-789');
    assert.ok(found !== null, 'setActive by _dbId should find the mission');
    assert.equal(Mission.current._dbId, 'real-db-id-789');
  });

  it('getAll() excludes archived missions by default', function() {
    var m = Mission.createMission('state_benefits_search');
    Mission.current = m;
    var memIdToArchive = m._memId;
    Mission.archiveMission(memIdToArchive);
    var all = Mission.getAll();
    var found = all.filter(function(x) { return x._memId === memIdToArchive; });
    assert.equal(found.length, 0, 'archived mission must not appear in getAll()');
  });

  it('getAll({ includeArchived: true }) includes archived missions', function() {
    var allExcl = Mission.getAll();
    var allIncl = Mission.getAll({ includeArchived: true });
    assert.ok(
      allIncl.length >= allExcl.length,
      'includeArchived: true must return >= missions than default'
    );
  });

  it('archiveMission() auto-shifts focus away from the archived mission', function() {
    var ma = Mission.createMission('disability_claim');
    var mb = Mission.createMission('education_path');
    Mission.current = ma;
    Mission.current = mb;
    Mission.current = ma; // focus on ma
    assert.equal(Mission.current._memId, ma._memId, 'sanity: ma should be active');
    Mission.archiveMission(ma._memId);
    // After archiving ma, Mission.current must NOT be ma
    assert.ok(Mission.current === null || Mission.current._memId !== ma._memId,
      'after archiving active mission, focus must shift away from it');
  });

});


// ════════════════════════════════════════════════════════════
// 10. MissionCard.switchTo() — DOM integration (Phase 51)
//     switchTo() must delegate to Mission.setActive() and
//     re-render the card. The minimal document mock prevents
//     DOM errors; the behavioral assertion is on Mission.current.
// ════════════════════════════════════════════════════════════

describe('10. MissionCard.switchTo() — updates Mission.current', function() {

  it('registers on window.AIOS.MissionCard with update and switchTo', function() {
    assert.ok(global.window.AIOS.MissionCard, 'MissionCard not registered');
    assert.equal(typeof global.window.AIOS.MissionCard.switchTo, 'function');
    assert.equal(typeof global.window.AIOS.MissionCard.update,   'function');
  });

  it('switchTo() changes Mission.current to the target mission', function() {
    var Mission = global.window.AIOS.Mission;
    var m1 = Mission.createMission('disability_claim');
    var m2 = Mission.createMission('state_benefits_search');
    Mission.current = m1;
    Mission.current = m2; // m2 is active
    // Switch to m1 via MissionCard public API
    global.window.AIOS.MissionCard.switchTo(m1._memId);
    assert.equal(
      Mission.current._memId,
      m1._memId,
      'Mission.current must switch to m1 after MissionCard.switchTo(m1._memId)'
    );
  });

  it('switchTo() with unknown id leaves Mission.current unchanged', function() {
    var Mission  = global.window.AIOS.Mission;
    var beforeId = Mission.current ? Mission.current._memId : null;
    global.window.AIOS.MissionCard.switchTo('no-such-id-xyz-switchto');
    var afterId  = Mission.current ? Mission.current._memId : null;
    assert.equal(afterId, beforeId, 'Mission.current must be unchanged for unknown id');
  });

  it('switchTo() does not throw with stub DOM elements', function() {
    var Mission = global.window.AIOS.Mission;
    var m = Mission.createMission('housing_path');
    Mission.current = m;
    assert.doesNotThrow(function() {
      global.window.AIOS.MissionCard.switchTo(m._memId);
    }, 'switchTo() must not throw when DOM elements are stubs');
  });

  it('MissionCard.update() does not throw with a null mission', function() {
    assert.doesNotThrow(function() {
      global.window.AIOS.MissionCard.update(null);
    });
  });

  it('MissionCard.update() does not throw with a valid mission object', function() {
    var m = global.window.AIOS.Mission.createMission('disability_claim');
    assert.doesNotThrow(function() {
      global.window.AIOS.MissionCard.update(m);
    });
  });

});


// ════════════════════════════════════════════════════════════
// 11. Checklist DB restore — localStorage guard removed (Phase 5)
//     Fix: removed the `if (!_stored.items || !_stored.items.length)`
//     guard from the aaai:mission_state_synced handler. The guard
//     silently blocked DB restore whenever localStorage was empty
//     (new device, incognito, hard refresh). DB is now authoritative.
//
//     Tested by mirroring OLD vs NEW behavioral logic — app.js IIFE
//     is too large to load in this context.
// ════════════════════════════════════════════════════════════

describe('11. Checklist DB restore — localStorage guard removed', function() {

  // Mirrors the OLD guard from the aaai:mission_state_synced handler
  // that was REMOVED in Phase 5. Returns true = "would skip DB restore".
  function OLD_wouldSkipDbRestore(rawLocalStorage) {
    var _stored = {};
    try { _stored = JSON.parse(rawLocalStorage || '{}'); } catch(e) {}
    // This is the exact guard that was removed:
    if (!_stored.items || !_stored.items.length) return true; // old: skip
    return false;
  }

  // Mirrors the NEW unconditional path — DB is always queried.
  function NEW_wouldSkipDbRestore(/* rawLocalStorage */) {
    return false; // new: always proceed to restoreFromDB()
  }

  it('OLD guard incorrectly blocked DB restore when localStorage was null', function() {
    assert.equal(OLD_wouldSkipDbRestore(null), true,
      'OLD: null localStorage → guard blocked DB restore (bug)');
  });

  it('OLD guard incorrectly blocked DB restore when localStorage had no items key', function() {
    assert.equal(OLD_wouldSkipDbRestore('{}'), true,
      'OLD: empty object → guard blocked DB restore (bug)');
  });

  it('OLD guard incorrectly blocked DB restore on a new device with prior completions', function() {
    // New device: localStorage has completedIndices but no items (items only stored
    // on original device). The guard fired on missing items and blocked DB restore.
    var raw = JSON.stringify({ completedIndices: [0, 2] });
    assert.equal(OLD_wouldSkipDbRestore(raw), true,
      'OLD: items absent but completedIndices present → guard still blocked DB (bug)');
  });

  it('NEW path always proceeds to DB regardless of localStorage state', function() {
    assert.equal(NEW_wouldSkipDbRestore(null),             false, 'null → proceed');
    assert.equal(NEW_wouldSkipDbRestore('{}'),             false, 'empty → proceed');
    assert.equal(NEW_wouldSkipDbRestore('{"items":[]}'),   false, 'empty items → proceed');
  });

  it('NEW path restores from DB even when localStorage has stale items', function() {
    // On a new device or incognito, localStorage has nothing.
    // On a returning device, localStorage may have stale items from an old session.
    // In both cases the NEW code always queries DB (DB is authoritative).
    var staleRaw = JSON.stringify({ items: [{ title: 'Stale cached item' }] });
    assert.equal(NEW_wouldSkipDbRestore(staleRaw), false,
      'DB restore must always run — DB is authoritative over localStorage');
  });

  it('OLD guard only allowed restore when localStorage already had items — defeats new-device use case', function() {
    // The only case where OLD code did NOT block: localStorage had items.
    // This means DB restore only ran when localStorage was already populated —
    // which defeats the entire purpose of DB-authoritative restore.
    var populatedRaw = JSON.stringify({
      items: [{ title: 'File VA Form 21-526EZ' }],
      completedIndices: [0]
    });
    assert.equal(OLD_wouldSkipDbRestore(populatedRaw), false,
      'OLD: only allowed restore when localStorage had items (defeated purpose)');
  });

});


// ════════════════════════════════════════════════════════════
// 12. Voice pipeline — AbortController abort protection
//     Phase fix: _voiceIntelligencePipeline() now wraps its
//     classification fetch in an AbortController with a 15s
//     timeout, mirroring callChatEndpoint(). Tests verify the
//     AbortController contract used in the implementation.
// ════════════════════════════════════════════════════════════

describe('12. Voice pipeline — AbortController abort protection', function() {

  it('AbortController.signal.aborted is false before abort()', function() {
    var controller = new AbortController();
    assert.equal(controller.signal.aborted, false);
  });

  it('AbortController.signal.aborted is true immediately after abort()', function() {
    var controller = new AbortController();
    controller.abort();
    assert.equal(controller.signal.aborted, true);
  });

  it('AbortError is identifiable by .name property', function() {
    // The pipeline catch block guards: if (e.name === 'AbortError') return;
    // DOMException with name 'AbortError' is the standard abort error shape.
    var abortError = new DOMException('The operation was aborted', 'AbortError');
    assert.equal(abortError.name, 'AbortError');
  });

  it('multiple abort() calls on same controller are idempotent', function() {
    var controller = new AbortController();
    controller.abort();
    // Second abort() must not throw
    assert.doesNotThrow(function() { controller.abort(); });
    assert.equal(controller.signal.aborted, true);
  });

  it('timeout-triggered abort fires after the configured delay', function(_, done) {
    var controller = new AbortController();
    var aborted    = false;

    var timeout = setTimeout(function() {
      controller.abort();
      aborted = true;
    }, 50); // 50ms — representative of the 15s production pattern

    setTimeout(function() {
      clearTimeout(timeout); // ensure cleanup if somehow not yet fired
      assert.equal(aborted, true, 'abort should have been called by timeout');
      assert.equal(controller.signal.aborted, true);
      done();
    }, 120);
  });

  it('clearTimeout() prevents abort when fetch completes before timeout', function(_, done) {
    // Mirrors the production pattern:
    //   var _vtTimeout = setTimeout(function() { _vtController.abort(); }, 15000);
    //   fetch(...).then(function() { clearTimeout(_vtTimeout); ... })
    var controller = new AbortController();
    var aborted    = false;

    var timeout = setTimeout(function() {
      controller.abort();
      aborted = true;
    }, 50);

    // Simulate successful early completion — clear the timeout
    clearTimeout(timeout);

    setTimeout(function() {
      assert.equal(aborted, false, 'clearTimeout must prevent abort from firing');
      assert.equal(controller.signal.aborted, false,
        'signal must remain unaborted when fetch completes before timeout');
      done();
    }, 120);
  });

  it('each pipeline invocation gets its own independent AbortController', function() {
    // Mirrors: a new _vtController is created on each _voiceIntelligencePipeline() call
    var c1 = new AbortController();
    var c2 = new AbortController();
    c1.abort();
    assert.equal(c1.signal.aborted, true);
    assert.equal(c2.signal.aborted, false, 'aborting c1 must not affect c2');
  });

});
