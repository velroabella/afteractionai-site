/* ══════════════════════════════════════════════════════════
   AIOS — Mission State  (Phase 46)

   Persists a lightweight "mission context" snapshot so that
   returning veterans can instantly resume their journey with
   full context — no re-onboarding, no lost progress.

   Stored in:
     • localStorage (aaai_mission_state)  — instant, works offline
     • Supabase profiles.aios_memory.missionState (JSONB sub-key)
       → written / read via window.AAAI.auth when user is logged in

   Also manages a minimal conversationHistory snapshot
   (last 6 turns) for AI context restoration on resume.

   missionState shape:
   {
     missionType:       string | null,   // 'DISABILITY_CLAIM' | 'EDUCATION' | …
     currentStep:       string | null,   // last completed step label
     missingFields:     string[],        // profile fields still needed
     relatedDocuments:  string[],        // doc types in play (e.g. ['DD-214','VA letter'])
     relatedTemplates:  string[],        // template IDs started or completed
     primaryCategory:   string | null,   // top resource category id
     lastUpdated:       string           // ISO timestamp
   }

   conversationSnapshot shape:
   {
     history:   [{role, content}]        // last 6 turns (trimmed to ~6k chars)
     savedAt:   string                   // ISO timestamp
   }

   Public API:
     window.AIOS.MissionState.get()             → missionState | null
     window.AIOS.MissionState.save(state)       → void  (merge + persist)
     window.AIOS.MissionState.update(patch)     → void  (partial update)
     window.AIOS.MissionState.clear()           → void
     window.AIOS.MissionState.saveConversation(history)  → void
     window.AIOS.MissionState.getConversation() → history[] | null
     window.AIOS.MissionState.clearConversation() → void
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var LS_KEY_STATE = 'aaai_mission_state';
  var LS_KEY_CONV  = 'aaai_conv_snapshot';
  var MAX_CONV_TURNS = 6;   // keep last 6 turns
  var MAX_CONV_CHARS = 6000; // hard char cap to stay within token budget

  /* ── Helpers ─────────────────────────────────────────── */

  function _now() { return new Date().toISOString(); }

  function _lsGet(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  function _lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) { /* quota full */ }
  }

  function _lsRemove(key) {
    try { localStorage.removeItem(key); } catch(e) {}
  }

  /** Default blank mission state */
  function _blank() {
    return {
      missionType:      null,
      currentStep:      null,
      missingFields:    [],
      relatedDocuments: [],
      relatedTemplates: [],
      primaryCategory:  null,
      lastUpdated:      _now()
    };
  }

  /** Deep-merge patch into existing state (arrays replaced, not appended) */
  function _merge(existing, patch) {
    var merged = {};
    var keys = Object.keys(existing);
    for (var i = 0; i < keys.length; i++) merged[keys[i]] = existing[keys[i]];
    var pkeys = Object.keys(patch);
    for (var j = 0; j < pkeys.length; j++) merged[pkeys[j]] = patch[pkeys[j]];
    merged.lastUpdated = _now();
    return merged;
  }

  /* ── Supabase sync (fire-and-forget) ─────────────────── */

  function _pushToSupabase(state) {
    try {
      var auth = window.AAAI && window.AAAI.auth;
      if (!auth || !auth.isLoggedIn || !auth.isLoggedIn()) return;

      // Read existing aios_memory, inject missionState sub-key, re-save
      auth.loadAIOSMemory().then(function(result) {
        var mem = (result && result.data) ? result.data : {};
        mem.missionState = state;
        auth.saveAIOSMemory(mem).catch(function() { /* non-critical */ });
      }).catch(function() { /* offline / not logged in */ });
    } catch(e) { /* never throw */ }
  }

  function _pullFromSupabase(callback) {
    try {
      var auth = window.AAAI && window.AAAI.auth;
      if (!auth || !auth.isLoggedIn || !auth.isLoggedIn()) {
        if (typeof callback === 'function') callback(null);
        return;
      }
      auth.loadAIOSMemory().then(function(result) {
        var remoteState = (result && result.data && result.data.missionState)
          ? result.data.missionState : null;
        if (typeof callback === 'function') callback(remoteState);
      }).catch(function() {
        if (typeof callback === 'function') callback(null);
      });
    } catch(e) {
      if (typeof callback === 'function') callback(null);
    }
  }

  /* ── Conversation snapshot helpers ───────────────────── */

  /**
   * Trim conversation history to MAX_CONV_TURNS + MAX_CONV_CHARS.
   * Always keeps the last turn (most recent exchange).
   */
  function _trimHistory(history) {
    if (!Array.isArray(history) || history.length === 0) return [];

    // Take last MAX_CONV_TURNS turns
    var trimmed = history.slice(-MAX_CONV_TURNS);

    // Now enforce char limit by dropping oldest turns first
    var totalChars = 0;
    var within = [];
    for (var i = trimmed.length - 1; i >= 0; i--) {
      var msgChars = (trimmed[i].content || '').length;
      if (totalChars + msgChars > MAX_CONV_CHARS && within.length > 0) break;
      within.unshift(trimmed[i]);
      totalChars += msgChars;
    }
    return within;
  }

  /* ══════════════════════════════════════════════════════
     Public API
     ══════════════════════════════════════════════════════ */

  var MissionState = {

    /* ── Mission state ────────────────────────────────── */

    /**
     * Get current missionState.
     * Returns the localStorage copy (immediately available).
     * Caller may optionally use refreshFromSupabase() for the latest server copy.
     */
    get: function() {
      return _lsGet(LS_KEY_STATE);
    },

    /**
     * Save (full replace + merge with blank defaults) and persist.
     * @param {Object} state  — partial or full missionState
     */
    save: function(state) {
      if (!state || typeof state !== 'object') return;
      var current = _lsGet(LS_KEY_STATE) || _blank();
      var next = _merge(current, state);
      _lsSet(LS_KEY_STATE, next);
      _pushToSupabase(next);
    },

    /**
     * Partial update — only supplied keys are changed.
     * Convenience alias for save() with a partial object.
     * @param {Object} patch
     */
    update: function(patch) {
      this.save(patch);
    },

    /**
     * Wipe local + remote mission state.
     */
    clear: function() {
      _lsRemove(LS_KEY_STATE);
      // Clear server copy
      try {
        var auth = window.AAAI && window.AAAI.auth;
        if (auth && auth.isLoggedIn && auth.isLoggedIn()) {
          auth.loadAIOSMemory().then(function(result) {
            var mem = (result && result.data) ? result.data : {};
            delete mem.missionState;
            auth.saveAIOSMemory(mem).catch(function(e) { console.error('[AAAI ERROR][mission-state.clear] saveAIOSMemory failed |', e); });
          }).catch(function(e) { console.error('[AAAI ERROR][mission-state.clear] loadAIOSMemory failed |', e); });
        }
      } catch(e) {}
    },

    /**
     * Async: pull latest from Supabase, merge with localStorage if newer,
     * then call callback(state).
     * Use on ?resume=1 to get the freshest state before routing.
     * @param {Function} callback  fn(state | null)
     */
    refreshFromSupabase: function(callback) {
      var local = _lsGet(LS_KEY_STATE);
      _pullFromSupabase(function(remote) {
        if (!remote) {
          if (typeof callback === 'function') callback(local);
          return;
        }
        // Use whichever is newer
        var localTs  = local  && local.lastUpdated  ? new Date(local.lastUpdated).getTime()  : 0;
        var remoteTs = remote && remote.lastUpdated ? new Date(remote.lastUpdated).getTime() : 0;
        var winner = remoteTs >= localTs ? remote : local;
        _lsSet(LS_KEY_STATE, winner);
        if (typeof callback === 'function') callback(winner);
      });
    },

    /**
     * Build a compact text summary of missionState for AI prompt injection.
     * Used by app.js RESUME_MISSION to enrich the context block.
     * @param {Object} state
     * @returns {string}
     */
    buildSummary: function(state) {
      if (!state) return '';
      var lines = ['## MISSION STATE (resumed)'];
      if (state.missionType)  lines.push('Mission type: ' + state.missionType);
      if (state.currentStep)  lines.push('Last step: ' + state.currentStep);
      if (state.primaryCategory) lines.push('Top priority: ' + state.primaryCategory);
      if (state.missingFields && state.missingFields.length > 0) {
        lines.push('Still needed: ' + state.missingFields.join(', '));
      }
      if (state.relatedDocuments && state.relatedDocuments.length > 0) {
        lines.push('Documents in play: ' + state.relatedDocuments.join(', '));
      }
      if (state.relatedTemplates && state.relatedTemplates.length > 0) {
        lines.push('Templates started: ' + state.relatedTemplates.join(', '));
      }
      if (state.lastUpdated) {
        lines.push('Last active: ' + new Date(state.lastUpdated).toLocaleDateString());
      }
      return lines.join('\n');
    },

    /* ── Conversation snapshot ────────────────────────── */

    /**
     * Save a trimmed snapshot of the current conversationHistory.
     * Call this from app.js after each AI response.
     * @param {Array} history  — full conversationHistory array
     */
    saveConversation: function(history) {
      if (!Array.isArray(history)) return;
      var snapshot = {
        history: _trimHistory(history),
        savedAt: _now()
      };
      _lsSet(LS_KEY_CONV, snapshot);
    },

    /**
     * Get the saved conversation snapshot (for rehydration on resume).
     * @returns {{history: Array, savedAt: string} | null}
     */
    getConversation: function() {
      return _lsGet(LS_KEY_CONV);
    },

    /**
     * Clear the conversation snapshot (e.g. after explicit "Start Over").
     */
    clearConversation: function() {
      _lsRemove(LS_KEY_CONV);
    },

    /**
     * Auto-extract and update missionState from AIOS module globals.
     * Call after each sendToAI() completes to keep state in sync.
     * Safe to call even when AIOS modules are not loaded.
     */
    syncFromAIOS: function() {
      try {
        var patch = { lastUpdated: _now() };

        // Pull missionType from AIOS.Mission if available
        if (window.AIOS && window.AIOS.Mission && window.AIOS.Mission.current) {
          var m = window.AIOS.Mission.current;
          if (m.type)        patch.missionType  = m.type;
          if (m.currentStep) patch.currentStep  = m.currentStep;
          if (Array.isArray(m.missingFields) && m.missingFields.length > 0) {
            patch.missingFields = m.missingFields;
          }
        }

        // Pull top resource category from AIOS.Resources
        if (window.AIOS && window.AIOS.Resources && window.AIOS.Memory) {
          try {
            var prof = window.AIOS.Memory.getProfile();
            var prio = window.AIOS.Resources.getPriority(prof);
            if (prio && prio.length > 0) patch.primaryCategory = prio[0].category;
          } catch(e) {}
        }

        // Pull documents / templates from AIOS.Memory if present
        if (window.AIOS && window.AIOS.Memory) {
          var memProf = window.AIOS.Memory.getProfile();
          if (memProf && memProf.documents) patch.relatedDocuments = memProf.documents;
        }

        var current = _lsGet(LS_KEY_STATE);
        if (current || patch.missionType || patch.primaryCategory) {
          this.save(patch);
        }
      } catch(e) { /* never throw */ }
    }

  };

  window.AIOS = window.AIOS || {};
  window.AIOS.MissionState = MissionState;

})();
