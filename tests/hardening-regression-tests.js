/* ══════════════════════════════════════════════════════════
   AfterAction AI — Identity & Observability Hardening Tests
   Runner: Node.js built-in (node --test)

   Covers the five hardening fixes applied in this sprint:
    13. Branch extraction hardening (memory-manager.js)
    14. Text-path identity filter (app.js callChatEndpoint)
    15. Voice-path identity filter (app.js _aiosVoiceUpdate)
    16. RESUME_MISSION greeting — confirmation, not assertion
    17. aaai_contract_display TTL enforcement (profile.html)
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

global.document = {
  getElementById:   function() { return { style: { display: '' }, textContent: '', innerHTML: '' }; },
  readyState:       'complete',
  addEventListener: function() {}
};

// ── Load memory-manager once — used by suites 13-15 ─────────
before(function() {
  loadModule('js/aios/memory-manager.js'); // → window.AIOS.Memory
});


// ════════════════════════════════════════════════════════════
// 13. Branch extraction hardening
//
//  Fixes: bare-word \bBRANCH\b removed; first-person subject
//  required for contextual verbs; whole-message match retained
//  for button-click answers.
//
//  Verifies that incidental mentions do NOT extract branch,
//  while clear self-identification DOES extract branch.
// ════════════════════════════════════════════════════════════

describe('13. Branch extraction hardening', function() {

  var extract;
  before(function() {
    extract = window.AIOS.Memory.extractMemoryFromInput.bind(window.AIOS.Memory);
  });

  it('button click — "Army" alone extracts branch', function() {
    var result = extract('Army');
    assert.equal(result.branch, 'Army');
  });

  it('"I served in the Army" extracts branch', function() {
    var result = extract('I served in the Army');
    assert.equal(result.branch, 'Army');
  });

  it('"I was in the Navy" extracts branch', function() {
    var result = extract('I was in the Navy');
    assert.equal(result.branch, 'Navy');
  });

  it('"I joined the Marines" extracts branch', function() {
    var result = extract('I joined the Marines');
    assert.equal(result.branch, 'Marines');
  });

  it('"Marine Corps veteran" extracts branch', function() {
    var result = extract('Marine Corps veteran');
    assert.equal(result.branch, 'Marine Corps');
  });

  it('"Army veteran" extracts branch', function() {
    var result = extract('Army veteran');
    assert.equal(result.branch, 'Army');
  });

  it('"I drove past an Army base" does NOT extract branch', function() {
    var result = extract('I drove past an Army base');
    assert.equal(result.branch, undefined);
  });

  it('"My brother was in the Navy" does NOT extract branch', function() {
    var result = extract('My brother was in the Navy');
    assert.equal(result.branch, undefined);
  });

  it('"She joined the Air Force" does NOT extract branch', function() {
    var result = extract('She joined the Air Force');
    assert.equal(result.branch, undefined);
  });

  it('"The Army base is nearby" does NOT extract branch', function() {
    var result = extract('The Army base is nearby');
    assert.equal(result.branch, undefined);
  });

  it('"I\'m Army" extracts branch', function() {
    var result = extract("I'm Army");
    assert.equal(result.branch, 'Army');
  });

  it('"My branch is Navy" extracts branch', function() {
    var result = extract('My branch is Navy');
    assert.equal(result.branch, 'Navy');
  });

  it('ambiguous "my dad was Army, I was in the Navy" drops branch (conflict)', function() {
    // _validateMemoryFields detects 2 branch hits and drops the field
    var result = extract('my dad was Army, I was in the Navy');
    assert.equal(result.branch, undefined);
  });

});


// ════════════════════════════════════════════════════════════
// 14. Text-path identity filter logic
//
//  Fix: callChatEndpoint now clones the profile and strips
//  name + branch unless freshly extracted from the current
//  user message (app.js ~2474-2483).
//
//  We test the exact three-step pattern used in production:
//    1. Object.assign({}, profile)
//    2. extractMemoryFromInput(message) → freshId
//    3. delete clone.name  if !freshId.name
//       delete clone.branch if !freshId.branch
// ════════════════════════════════════════════════════════════

describe('14. Text-path identity filter logic', function() {

  // Replicates the production filter (app.js ~2477-2483) as a
  // standalone function — tests the logic, not the closure.
  function applyTextIdentityFilter(profile, userMessage) {
    var filtered = Object.assign({}, profile);
    var freshId  = (window.AIOS.Memory &&
        typeof window.AIOS.Memory.extractMemoryFromInput === 'function')
      ? window.AIOS.Memory.extractMemoryFromInput(userMessage)
      : {};
    if (!freshId.name)   delete filtered.name;
    if (!freshId.branch) delete filtered.branch;
    return filtered;
  }

  it('stale name stripped when message contains no name', function() {
    var stale = { name: 'Lewis', branch: 'Army', vaRating: 70 };
    var result = applyTextIdentityFilter(stale, 'How do I file a disability claim?');
    assert.equal(result.name, undefined);
  });

  it('stale branch stripped when message contains no branch', function() {
    var stale = { name: 'Lewis', branch: 'Army', vaRating: 70 };
    var result = applyTextIdentityFilter(stale, 'How do I file a disability claim?');
    assert.equal(result.branch, undefined);
  });

  it('non-identity fields preserved after strip', function() {
    var stale = { name: 'Lewis', branch: 'Army', vaRating: 70, state: 'Texas' };
    var result = applyTextIdentityFilter(stale, 'How do I file a disability claim?');
    assert.equal(result.vaRating, 70);
    assert.equal(result.state, 'Texas');
  });

  it('original profile object is NOT mutated', function() {
    var stale = { name: 'Lewis', branch: 'Army' };
    applyTextIdentityFilter(stale, 'How do I file a claim?');
    assert.equal(stale.name, 'Lewis');
    assert.equal(stale.branch, 'Army');
  });

  it('name kept when freshly stated in message', function() {
    // extractMemoryFromInput picks up name from "my name is Lewis"
    var stale = { name: 'Lewis', branch: 'Army' };
    var result = applyTextIdentityFilter(stale, 'My name is Lewis, how do I apply?');
    assert.equal(result.name, 'Lewis');
  });

  it('branch kept when freshly stated in message', function() {
    var stale = { name: 'Lewis', branch: 'Army' };
    var result = applyTextIdentityFilter(stale, 'I served in the Army, what benefits do I have?');
    assert.equal(result.branch, 'Army');
  });

  it('empty profile passes through unchanged', function() {
    var result = applyTextIdentityFilter({}, 'How do I file a claim?');
    assert.equal(result.name,   undefined);
    assert.equal(result.branch, undefined);
  });

});


// ════════════════════════════════════════════════════════════
// 15. Voice-path identity filter logic
//
//  Fix: _aiosVoiceUpdate strips stale name + branch from the
//  profile passed to session.update (app.js ~1267-1273).
//
//  The production pattern is identical to the text filter.
//  These tests confirm the same behavioral guarantees hold
//  on a transcript (voice) input rather than a typed message.
// ════════════════════════════════════════════════════════════

describe('15. Voice-path identity filter logic', function() {

  // Mirrors the production voice filter (app.js ~1267-1273)
  function applyVoiceIdentityFilter(profile, transcript) {
    var filtered = Object.assign({}, profile);
    var freshId  = (window.AIOS.Memory &&
        typeof window.AIOS.Memory.extractMemoryFromInput === 'function')
      ? window.AIOS.Memory.extractMemoryFromInput(transcript)
      : {};
    if (!freshId.name)   delete filtered.name;
    if (!freshId.branch) delete filtered.branch;
    return filtered;
  }

  it('stale name stripped from voice profile on neutral transcript', function() {
    var stale = { name: 'Lewis', branch: 'Army' };
    var result = applyVoiceIdentityFilter(stale, 'uh yeah so like what benefits do I have');
    assert.equal(result.name, undefined);
  });

  it('stale branch stripped from voice profile on neutral transcript', function() {
    var stale = { name: 'Lewis', branch: 'Army' };
    var result = applyVoiceIdentityFilter(stale, 'uh yeah so like what benefits do I have');
    assert.equal(result.branch, undefined);
  });

  it('branch retained when clearly stated in transcript', function() {
    var stale = { name: 'Lewis', branch: 'Army' };
    var result = applyVoiceIdentityFilter(stale, 'I served in the Army');
    assert.equal(result.branch, 'Army');
  });

  it('incidental branch mention in transcript does NOT retain stale branch', function() {
    // "I drove past an Army base" — incidental, not self-identification
    var stale = { branch: 'Army' };
    var result = applyVoiceIdentityFilter(stale, 'I drove past an Army base the other day');
    assert.equal(result.branch, undefined);
  });

  it('original profile object is NOT mutated by voice filter', function() {
    var stale = { name: 'Lewis', branch: 'Army' };
    applyVoiceIdentityFilter(stale, 'what benefits do I qualify for');
    assert.equal(stale.name,   'Lewis');
    assert.equal(stale.branch, 'Army');
  });

});


// ════════════════════════════════════════════════════════════
// 16. RESUME_MISSION greeting — confirmation, not assertion
//
//  Fix: getMockResponse('RESUME_MISSION') no longer injects
//  name/branch as asserted facts. Profile data is shown only
//  inside a confirmation question (app.js ~2356-2403).
//
//  We validate the behavioral contract by inspecting the
//  production source directly: the literal strings that would
//  constitute an identity assertion must not be present.
// ════════════════════════════════════════════════════════════

describe('16. RESUME_MISSION greeting — confirmation, not assertion', function() {

  var src;
  before(function() {
    src = fs.readFileSync(path.join(SITE, 'js/app.js'), 'utf8');
  });

  it('_rName variable no longer exists in app.js', function() {
    // The old pattern used _rName to inject name into the greeting.
    // Its removal is the root fix for the identity assertion.
    assert.ok(!src.includes('var _rName'), '_rName must not exist in app.js');
  });

  it('greeting string does not assert name inline', function() {
    // The old leaked greeting was:
    //   'Welcome back' + (_rName ? ', ' + _rName : '')
    // Confirm this pattern is gone.
    assert.ok(
      !src.includes("'Welcome back' + (_rName"),
      'Greeting must not concatenate name directly'
    );
  });

  it('confirmation phrase "Is that still correct?" is present', function() {
    // The fixed greeting ends the profile summary with a confirmation
    // question rather than asserting identity.
    assert.ok(
      src.includes('Is that still correct?'),
      'RESUME_MISSION greeting must include confirmation question'
    );
  });

  it('neutral greeting "Welcome back." is the base string', function() {
    // The fixed return starts with the neutral 'Welcome back.'
    // (period, not comma-then-name).
    assert.ok(
      src.includes("return 'Welcome back.' +"),
      'Return must start with neutral "Welcome back." not "Welcome back, <name>"'
    );
  });

  it('profile data shown as labeled key-value, not bare assertion', function() {
    // Fixed pattern pushes 'Name: ' + _rProf.name, not bare _rProf.name.
    assert.ok(
      src.includes("'Name: ' + _rProf.name"),
      'Profile name must be shown as labeled data for confirmation, not asserted inline'
    );
  });

});


// ════════════════════════════════════════════════════════════
// 17. aaai_contract_display TTL enforcement
//
//  Fix: profile.html now checks _savedAt before restoring
//  a stored contract. Contracts older than 24 hours are
//  discarded and treated as null (profile.html ~1273-1276).
//
//  We test the exact TTL predicate used in production as a
//  pure logic test — no browser / DOM dependencies needed.
// ════════════════════════════════════════════════════════════

describe('17. aaai_contract_display TTL enforcement', function() {

  var TTL_MS = 86400000; // 24 hours — must match production constant

  // Replicates the production TTL predicate (profile.html ~1274-1276)
  function isFresh(stored) {
    return stored && stored._savedAt && (Date.now() - stored._savedAt < TTL_MS);
  }

  // Replicates the full restore gate (profile.html ~1272-1278)
  function restoreContract(stored) {
    var fresh = isFresh(stored);
    if (fresh && (stored.recommended_actions || stored.resources || stored.risk_flags)) {
      return stored;
    }
    return null;
  }

  it('fresh contract (<24h) with content restores correctly', function() {
    var stored = {
      recommended_actions: ['File a claim'],
      resources:           [{ name: 'VA.gov' }],
      risk_flags:          [],
      _savedAt:            Date.now() - (60 * 60 * 1000) // 1 hour ago
    };
    assert.ok(restoreContract(stored) !== null, 'Fresh contract should be restored');
  });

  it('stale contract (>24h) is discarded and returns null', function() {
    var stored = {
      recommended_actions: ['File a claim'],
      resources:           [{ name: 'VA.gov' }],
      risk_flags:          [],
      _savedAt:            Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
    };
    assert.equal(restoreContract(stored), null, 'Stale contract must be discarded');
  });

  it('contract with no _savedAt is discarded', function() {
    var stored = {
      recommended_actions: ['File a claim'],
      resources:           [],
      risk_flags:          []
      // no _savedAt
    };
    assert.equal(restoreContract(stored), null, 'Missing _savedAt must be discarded');
  });

  it('null stored value returns null', function() {
    assert.equal(restoreContract(null), null);
  });

  it('contract exactly at TTL boundary (==) is discarded', function() {
    // The check is strict < so a value exactly at 24h is expired
    var stored = {
      recommended_actions: ['File a claim'],
      _savedAt:            Date.now() - TTL_MS
    };
    assert.equal(restoreContract(stored), null, 'Contract at exactly TTL boundary must expire');
  });

  it('fresh contract with only risk_flags restores (partial content)', function() {
    var stored = {
      recommended_actions: [],
      resources:           [],
      risk_flags:          ['high_debt'],
      _savedAt:            Date.now() - (30 * 60 * 1000) // 30 min ago
    };
    assert.ok(restoreContract(stored) !== null, 'Fresh contract with risk_flags should restore');
  });

  it('fresh contract with no content fields returns null', function() {
    // _savedAt is fresh but all content arrays are empty/absent
    var stored = {
      _savedAt: Date.now() - 1000
    };
    assert.equal(restoreContract(stored), null, 'Fresh but empty contract must not restore');
  });

  it('TTL source file contains the 86400000 constant', function() {
    // Guard against the TTL value being silently changed in production
    var profileSrc = fs.readFileSync(path.join(SITE, 'profile.html'), 'utf8');
    assert.ok(
      profileSrc.includes('86400000'),
      'profile.html must define the 24h TTL constant (86400000)'
    );
  });

  it('TTL source file checks _savedAt before rendering', function() {
    var profileSrc = fs.readFileSync(path.join(SITE, 'profile.html'), 'utf8');
    assert.ok(
      profileSrc.includes('_crStored._savedAt'),
      'profile.html must reference _savedAt in the TTL check'
    );
  });

});
