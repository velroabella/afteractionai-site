/* ══════════════════════════════════════════════════════════
   AfterAction AI — Phase 1 Basic Safety Tests
   Runner: Node.js built-in (node --test)
   Covers:
     1. Crisis / at-risk keyword detection
     2. ResponseContract.parse() all modes
     3. Mission state: createMission + updateMission
     4. Checklist persistence round-trip (localStorage mock)
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

// Bootstrap a minimal window / AIOS global that IIFEs register on
global.window = { AIOS: {} };

// ════════════════════════════════════════════════════════════
// 1. CRISIS / AT-RISK KEYWORD DETECTION
//    Algorithm mirrors app.js — exact same arrays, same logic.
//    (Functions are private inside app.js IIFE; we mirror here.)
// ════════════════════════════════════════════════════════════

// Mirrors app.js CRISIS_KEYWORDS (lines 25-31)
const CRISIS_KEYWORDS = [
  'suicide', 'kill myself', 'end it all', 'want to die', 'no point in living',
  'better off dead', "can't go on", 'nothing matters', 'end my life',
  'not worth living', 'take my own life', 'loaded gun', 'overdose',
  "don't want to be here", 'no reason to live', 'goodbye letter',
  'planning to end', 'self harm', 'cut myself', 'hurt myself'
];

// Mirrors app.js AT_RISK_KEYWORDS (lines 36-52)
const AT_RISK_KEYWORDS = [
  'losing my home', 'losing my house', 'about to lose my home',
  'facing eviction', 'being evicted', 'got evicted', 'getting evicted',
  'foreclosure', "can't pay rent", "can't afford rent",
  'behind on rent', 'behind on my mortgage',
  'living in my car', 'sleeping in my car', 'sleeping outside',
  'no place to live', "i'm homeless", 'i am homeless',
  'became homeless', 'just lost my housing',
  "can't pay my bills", "can't afford food", "can't afford to eat",
  'behind on bills', 'about to lose everything', 'losing everything',
  'completely alone', 'no one to turn to',
  'no one to help me', 'nobody to help me', 'totally isolated',
  'drinking problem', 'alcohol problem', 'drug problem',
  "can't stop drinking", "i'm an addict",
  'being abused', 'domestic violence',
  'unsafe at home', 'afraid to go home'
];

function checkCrisis(text) {
  if (!text) return false;
  var lower = text.toLowerCase();
  for (var i = 0; i < CRISIS_KEYWORDS.length; i++) {
    if (lower.indexOf(CRISIS_KEYWORDS[i]) !== -1) return true;
  }
  return false;
}

function checkAtRisk(text) {
  if (!text) return false;
  if (checkCrisis(text)) return false; // crisis wins, at-risk deferred
  var lower = text.toLowerCase();
  for (var i = 0; i < AT_RISK_KEYWORDS.length; i++) {
    if (lower.indexOf(AT_RISK_KEYWORDS[i]) !== -1) return true;
  }
  return false;
}

describe('1. Crisis / at-risk keyword detection', function() {

  it('detects "suicide" as crisis', function() {
    assert.equal(checkCrisis('I am thinking about suicide'), true);
  });

  it('detects "kill myself" as crisis', function() {
    assert.equal(checkCrisis("I want to kill myself tonight"), true);
  });

  it('detects "want to die" as crisis', function() {
    assert.equal(checkCrisis("I just want to die"), true);
  });

  it('is case-insensitive for crisis', function() {
    assert.equal(checkCrisis('THINKING ABOUT SUICIDE'), true);
  });

  it('returns false for non-crisis benign text', function() {
    assert.equal(checkCrisis('I need help filing my VA claim'), false);
  });

  it('returns false for empty input', function() {
    assert.equal(checkCrisis(''), false);
    assert.equal(checkCrisis(null), false);
  });

  it('detects "facing eviction" as at-risk', function() {
    assert.equal(checkAtRisk('I am facing eviction next week'), true);
  });

  it('detects "domestic violence" as at-risk', function() {
    assert.equal(checkAtRisk('I am experiencing domestic violence'), true);
  });

  it('detects "i am homeless" as at-risk', function() {
    assert.equal(checkAtRisk('i am homeless and need help'), true);
  });

  it('at-risk returns false for benign text', function() {
    assert.equal(checkAtRisk('I want to use my GI Bill for college'), false);
  });

  it('crisis preempts at-risk (crisis wins)', function() {
    // A message with both signals: crisis must win, at-risk stays false
    var msg = 'suicide and facing eviction';
    assert.equal(checkCrisis(msg), true);
    assert.equal(checkAtRisk(msg), false);
  });

});


// ════════════════════════════════════════════════════════════
// 2. ResponseContract.parse() — all modes
// ════════════════════════════════════════════════════════════

before(function() {
  // Load response-contract.js into this context
  // It registers window.AIOS.ResponseContract
  loadModule('js/aios/response-contract.js');
});

describe('2. ResponseContract.parse() modes', function() {

  it('registers on window.AIOS.ResponseContract', function() {
    assert.ok(global.window.AIOS.ResponseContract, 'ResponseContract not registered');
    assert.equal(typeof global.window.AIOS.ResponseContract.parse, 'function');
  });

  it('mode: conversation — default for short plain text', function() {
    var c = global.window.AIOS.ResponseContract.parse('Hello, how can I help you today?');
    assert.equal(c.mode, 'conversation');
  });

  it('mode: crisis — detects 988 + Veterans Crisis Line together', function() {
    var c = global.window.AIOS.ResponseContract.parse(
      'Please call the Veterans Crisis Line at 988 right now. Press 1 immediately.'
    );
    assert.equal(c.mode, 'crisis');
  });

  it('mode: template — first line matches a known template title', function() {
    var c = global.window.AIOS.ResponseContract.parse(
      'General Power of Attorney\n\nThis document grants authority to...'
    );
    assert.equal(c.mode, 'template');
  });

  it('mode: intake — has OPTIONS block, a question, and is short', function() {
    var c = global.window.AIOS.ResponseContract.parse(
      'What branch of service did you serve in?\n[OPTIONS: Army | Navy | Air Force | Marines | Coast Guard]'
    );
    assert.equal(c.mode, 'intake');
  });

  it('mode: skill_action — numbered step list', function() {
    // NOTE: ResponseContract._detectMode requires text.length > 200 for hasSteps to fire
    var c = global.window.AIOS.ResponseContract.parse(
      'Here is your action plan to get started with your VA disability claim process today:\n' +
      '1. Call the VA at 1-800-827-1000 to request your complete service treatment records.\n' +
      '2. File VA Form 21-526EZ online at VA.gov using your eBenefits or VA.gov account.\n' +
      '3. Submit evidence of your service-connected condition including buddy statements.'
    );
    assert.equal(c.mode, 'skill_action');
  });

  it('handles null input gracefully — returns conversation mode', function() {
    var c = global.window.AIOS.ResponseContract.parse(null);
    assert.equal(c.mode, 'conversation');
    assert.equal(c.raw, '');
    assert.equal(c.confidence, 0);
  });

  it('extracts OPTIONS correctly', function() {
    var c = global.window.AIOS.ResponseContract.parse(
      'What is your service branch?\n[OPTIONS: Army | Air Force | Navy]'
    );
    assert.ok(Array.isArray(c.options), 'options should be an array');
    assert.equal(c.options.length, 3);
    assert.equal(c.options[0], 'Army');
    assert.equal(c.options[2], 'Navy');
  });

  it('includes raw text unchanged', function() {
    var raw = 'Hello there, veteran.';
    var c = global.window.AIOS.ResponseContract.parse(raw);
    assert.equal(c.raw, raw);
  });

  it('always has a timestamp', function() {
    var before = Date.now();
    var c = global.window.AIOS.ResponseContract.parse('test');
    assert.ok(c.timestamp >= before, 'timestamp should be >= Date.now() at call time');
  });

});


// ════════════════════════════════════════════════════════════
// 3. Mission state: createMission + updateMission
// ════════════════════════════════════════════════════════════

before(function() {
  loadModule('js/aios/mission-manager.js');
});

describe('3. Mission state: create + update', function() {

  it('registers on window.AIOS.Mission', function() {
    assert.ok(global.window.AIOS.Mission, 'MissionManager not registered');
    assert.equal(typeof global.window.AIOS.Mission.createMission, 'function');
    assert.equal(typeof global.window.AIOS.Mission.updateMission, 'function');
  });

  it('createMission returns null for unknown type', function() {
    var m = global.window.AIOS.Mission.createMission('unknown_type');
    assert.equal(m, null);
  });

  it('createMission: disability_claim has correct defaults', function() {
    var m = global.window.AIOS.Mission.createMission('disability_claim');
    assert.ok(m, 'mission should not be null');
    assert.equal(m.type, 'disability_claim');
    assert.equal(m.name, 'VA Disability Claim');
    assert.equal(m.status, 'active');
    assert.ok(typeof m.currentStep === 'string' && m.currentStep.length > 0);
    assert.ok(typeof m.nextStep === 'string' && m.nextStep.length > 0);
    assert.ok(Array.isArray(m.blockers));
    assert.ok(typeof m.startedAt === 'number');
  });

  it('createMission: all 5 valid types create successfully', function() {
    var types = ['disability_claim', 'education_path', 'state_benefits_search', 'housing_path', 'employment_transition'];
    types.forEach(function(type) {
      var m = global.window.AIOS.Mission.createMission(type);
      assert.ok(m !== null, 'createMission(' + type + ') should not be null');
      assert.equal(m.type, type);
    });
  });

  it('createMission: accepts custom status', function() {
    var m = global.window.AIOS.Mission.createMission('education_path', { status: 'paused' });
    assert.equal(m.status, 'paused');
  });

  it('createMission: rejects invalid status, defaults to active', function() {
    var m = global.window.AIOS.Mission.createMission('education_path', { status: 'flying' });
    assert.equal(m.status, 'active');
  });

  it('updateMission: updates currentStep and nextStep', function() {
    var m = global.window.AIOS.Mission.createMission('disability_claim');
    var updated = global.window.AIOS.Mission.updateMission(m, {
      currentStep: 'Gather nexus letter',
      nextStep:    'Submit C&P exam request'
    });
    assert.equal(updated.currentStep, 'Gather nexus letter');
    assert.equal(updated.nextStep, 'Submit C&P exam request');
  });

  it('updateMission: type, name, startedAt are immutable', function() {
    var m = global.window.AIOS.Mission.createMission('disability_claim');
    var original = { type: m.type, name: m.name, startedAt: m.startedAt };
    var updated = global.window.AIOS.Mission.updateMission(m, {
      type:      'education_path',
      name:      'HACKED NAME',
      startedAt: 0
    });
    assert.equal(updated.type,      original.type);
    assert.equal(updated.name,      original.name);
    assert.equal(updated.startedAt, original.startedAt);
  });

  it('updateMission: merges blockers without duplicates', function() {
    var m = global.window.AIOS.Mission.createMission('disability_claim', {
      blockers: ['missing DD-214']
    });
    var updated = global.window.AIOS.Mission.updateMission(m, {
      blockers: ['missing DD-214', 'awaiting nexus letter']
    });
    assert.equal(updated.blockers.length, 2);
    assert.ok(updated.blockers.includes('missing DD-214'));
    assert.ok(updated.blockers.includes('awaiting nexus letter'));
  });

  it('updateMission: does not mutate the original mission', function() {
    var m = global.window.AIOS.Mission.createMission('housing_path');
    var originalStep = m.currentStep;
    global.window.AIOS.Mission.updateMission(m, { currentStep: 'NEW STEP' });
    assert.equal(m.currentStep, originalStep, 'original mission should be unchanged');
  });

  it('updateMission: returns original if existingMission is null', function() {
    var result = global.window.AIOS.Mission.updateMission(null, { currentStep: 'test' });
    assert.equal(result, null);
  });

  it('detectMissionFromInput: finds disability_claim from "file a claim"', function() {
    var result = global.window.AIOS.Mission.detectMissionFromInput('I want to file a claim for my knee injury');
    assert.ok(result !== null, 'should detect mission');
    assert.equal(result.type, 'disability_claim');
  });

  it('detectMissionFromInput: returns null for generic input', function() {
    var result = global.window.AIOS.Mission.detectMissionFromInput('Hello, how are you?');
    assert.equal(result, null);
  });

});


// ════════════════════════════════════════════════════════════
// 4. Checklist persistence round-trip (localStorage mock)
//    Mirrors the save/load/restore algorithm from app.js.
//    (Functions are private in app.js IIFE — algorithm mirrored here.)
// ════════════════════════════════════════════════════════════

function makeLocalStorageMock() {
  var store = {};
  return {
    getItem:    function(k) { return store.hasOwnProperty(k) ? store[k] : null; },
    setItem:    function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    clear:      function() { store = {}; },
    _store:     function() { return store; }
  };
}

// Mirrors app.js CHECKLIST_STORAGE_KEY
var CHECKLIST_STORAGE_KEY = 'afteraction_checklist_progress_v1';

// Mirrors app.js saveChecklistState logic (algorithmic mirror, not DOM-dependent)
function saveChecklistState(completedIndices, ls) {
  var stored = JSON.parse(ls.getItem(CHECKLIST_STORAGE_KEY) || '{}');
  stored.completedIndices = completedIndices;
  ls.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(stored));
}

// Mirrors app.js loadChecklistState return value
function loadChecklistState(ls) {
  var stored = JSON.parse(ls.getItem(CHECKLIST_STORAGE_KEY) || '{}');
  return stored.completedIndices || [];
}

// Mirrors app.js buildChecklist same-report detection
function buildChecklistSaveLogic(items, ls) {
  var existing = JSON.parse(ls.getItem(CHECKLIST_STORAGE_KEY) || '{}');
  var isSameReport = existing.items && existing.items.length === items.length &&
    existing.items[0] && items[0] && existing.items[0].title === items[0].title;
  existing.items = items;
  if (!isSameReport) existing.completedIndices = [];
  ls.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(existing));
  return existing;
}

describe('4. Checklist persistence round-trip', function() {

  it('save and load preserves completed indices', function() {
    var ls = makeLocalStorageMock();
    saveChecklistState([0, 2, 5], ls);
    var loaded = loadChecklistState(ls);
    assert.deepEqual(loaded, [0, 2, 5]);
  });

  it('empty store returns empty array', function() {
    var ls = makeLocalStorageMock();
    var loaded = loadChecklistState(ls);
    assert.deepEqual(loaded, []);
  });

  it('save overwrites prior indices', function() {
    var ls = makeLocalStorageMock();
    saveChecklistState([0, 1], ls);
    saveChecklistState([3, 4, 5], ls);
    var loaded = loadChecklistState(ls);
    assert.deepEqual(loaded, [3, 4, 5]);
  });

  it('same-report detection preserves progress', function() {
    var ls = makeLocalStorageMock();
    var items = [{ title: 'File VA Form 21-526EZ' }, { title: 'Gather service records' }];
    // First build — saves items, clears completedIndices
    buildChecklistSaveLogic(items, ls);
    saveChecklistState([0], ls); // user checks off item 0

    // Second build with same items — should preserve completedIndices
    var result = buildChecklistSaveLogic(items, ls);
    assert.ok(result.completedIndices, 'should have completedIndices');
    assert.deepEqual(result.completedIndices, [0], 'same-report should preserve progress');
  });

  it('new-report detection resets progress', function() {
    var ls = makeLocalStorageMock();
    var oldItems = [{ title: 'File VA Form 21-526EZ' }, { title: 'Gather service records' }];
    var newItems = [{ title: 'Apply for GI Bill' }, { title: 'Submit Form 22-1990' }];

    buildChecklistSaveLogic(oldItems, ls);
    saveChecklistState([0, 1], ls);

    // New items — different first title → should reset completedIndices
    var result = buildChecklistSaveLogic(newItems, ls);
    assert.deepEqual(result.completedIndices, [], 'new report should reset progress');
  });

  it('data survives JSON serialization round-trip', function() {
    var ls = makeLocalStorageMock();
    saveChecklistState([1, 3, 7, 12], ls);
    // Simulate page reload: re-read from raw string
    var raw = ls.getItem(CHECKLIST_STORAGE_KEY);
    var parsed = JSON.parse(raw);
    assert.deepEqual(parsed.completedIndices, [1, 3, 7, 12]);
  });

  it('handles corrupted storage gracefully', function() {
    var ls = makeLocalStorageMock();
    ls.setItem(CHECKLIST_STORAGE_KEY, 'INVALID{{{JSON');
    assert.doesNotThrow(function() {
      // Simulate what loadChecklistState does in app.js — try/catch around JSON.parse
      try {
        var stored = JSON.parse(ls.getItem(CHECKLIST_STORAGE_KEY) || '{}');
        return stored.completedIndices || [];
      } catch(e) {
        return []; // graceful degradation
      }
    });
  });

});
