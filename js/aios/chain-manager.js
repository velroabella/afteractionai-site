/* ══════════════════════════════════════════════════════════
   AIOS — Chain Manager  (Phase 25)
   Manages skill-to-skill handoff suggestions.

   A skill's run() can return data.chain = {
     nextSkill, label, sendText, missionType, missionUpdate
   } to queue a follow-on step. Chain Manager stores it,
   applies safety gates, and lets the suggestion engine
   surface it to the user as an explicit next-step prompt.

   Safety rules:
   - NEVER fires during CRISIS tier (crisisBanner visible)
   - Suppressed during AT_RISK unless chainData.allowAtRisk = true
   - 5-minute cooldown per nextSkill (anti-loop guard)
   - Session history buffer (MAX 5) blocks re-entry of any visited skill
   - Mission update deferred until user accepts (Chain.consume)
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ── Config ──────────────────────────────────────────── */

  /** Minimum gap before same nextSkill can be suggested again */
  var CHAIN_COOLDOWN_MS = 5 * 60 * 1000;

  /** Max number of recently-visited skills tracked for loop detection */
  var MAX_CHAIN_HISTORY = 5;

  /* ── State ───────────────────────────────────────────── */

  var _pending     = null;  // pending chain object, or null
  var _lastChained = {};    // { skillId: timestamp } — cooldown guard
  var _recent      = [];    // ordered list of recently consumed nextSkill IDs — loop guard

  /* ── Private helpers ─────────────────────────────────── */

  function _isCrisisActive() {
    var b = document.getElementById('crisisBanner');
    return b && b.style.display !== 'none';
  }

  function _isAtRiskActive() {
    return !!document.querySelector('#chatMessages .message--at-risk');
  }

  function _inCooldown(skillId) {
    var t = _lastChained[skillId];
    return !!(t && (Date.now() - t) < CHAIN_COOLDOWN_MS);
  }

  /* ── Chain Manager ───────────────────────────────────── */

  var Chain = {

    /**
     * Register a pending chain step from a skill's run() output.
     *
     * Safety gates — any one of these blocks the chain from being set:
     *   - tier is 'CRISIS' or crisis banner is currently visible
     *   - tier is 'AT_RISK' or AT_RISK message visible (unless allowAtRisk: true)
     *   - same nextSkill was chained within the last CHAIN_COOLDOWN_MS
     *
     * @param {Object} chainData
     *   nextSkill     {string}  — skill ID to suggest next (required)
     *   label         {string}  — user-facing suggestion text
     *   sendText      {string}  — message sent to chat when user accepts
     *   missionType   {string}  — mission type to create if no active mission
     *   missionUpdate {Object}  — { currentStep, nextStep } to apply to mission
     *   allowAtRisk   {boolean} — if true, allow chain even during AT_RISK tier
     * @param {string} [tier]   — 'CRISIS' | 'AT_RISK' | 'STANDARD'
     */
    set: function(chainData, tier) {
      if (!chainData || typeof chainData.nextSkill !== 'string') return;

      // Safety gate: never chain during crisis
      if (tier === 'CRISIS' || _isCrisisActive()) return;

      // Safety gate: suppress during AT_RISK unless explicitly permitted
      if ((tier === 'AT_RISK' || _isAtRiskActive()) && !chainData.allowAtRisk) return;

      // Anti-loop: prevent immediate re-chain to the same skill (cooldown)
      if (_inCooldown(chainData.nextSkill)) return;

      // Anti-loop: reject if this skill already appears in the session history buffer.
      // Prevents cycles like A → B → C → A regardless of cooldown state.
      if (_recent.indexOf(chainData.nextSkill) !== -1) return;

      _pending = {
        nextSkill:     chainData.nextSkill,
        label:         chainData.label    || 'Continue to next step',
        sendText:      chainData.sendText || ('Tell me about ' + chainData.nextSkill.replace(/-/g, ' ')),
        missionType:   chainData.missionType   || null,
        missionUpdate: chainData.missionUpdate || null
      };
    },

    /**
     * Returns true if a chain step is queued and waiting to be surfaced.
     * @returns {boolean}
     */
    hasPending: function() {
      return _pending !== null;
    },

    /**
     * Returns the pending chain object, or null.
     * @returns {Object|null}
     */
    getPending: function() {
      return _pending;
    },

    /**
     * Consume the pending chain step:
     *   1. Apply mission update or create mission (if provided and safe to do so).
     *   2. Record cooldown so the same skill cannot be immediately re-suggested.
     *   3. Clear _pending.
     *
     * Called by suggestion-engine immediately before _show() so that mission
     * state is updated at the moment the suggestion is surfaced — not before
     * (in case the chain is cancelled or expires before the user sees it).
     */
    consume: function() {
      if (!_pending) return;

      var nextSkill     = _pending.nextSkill;
      var missionType   = _pending.missionType;
      var missionUpdate = _pending.missionUpdate;

      // Mission integration — use existing MissionManager API
      var Mission = window.AIOS && window.AIOS.Mission;
      if (Mission) {
        if (missionType && !Mission.isActive()) {
          // No active mission — create one seeded with the chain's missionType
          var newMission = Mission.createMission(missionType, missionUpdate || {});
          if (newMission) { Mission.current = newMission; }
        } else if (Mission.current && missionUpdate) {
          // Active mission — safely merge the step update (preserves valid data)
          Mission.current = Mission.updateMission(Mission.current, missionUpdate);
        }
      }

      // Record cooldown
      _lastChained[nextSkill] = Date.now();

      // Record in session history buffer — used by set() to block re-entry
      _recent.push(nextSkill);
      if (_recent.length > MAX_CHAIN_HISTORY) { _recent.shift(); }

      _pending = null;
    },

    /**
     * Force-clear pending chain and session history without applying mission
     * update or cooldown. Use for session resets only — not for normal consumption.
     */
    clear: function() {
      _pending = null;
      _recent  = [];
    }

  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Chain = Chain;

})();
