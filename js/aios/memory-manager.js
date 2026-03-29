/* ══════════════════════════════════════════════════════════
   AIOS — Memory Manager
   Tracks veteran profile data, session facts, and
   cross-session persistent memory (via Supabase).
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var MemoryManager = {

    /** In-session veteran profile (built during conversation) */
    profile: {
      name: null,
      branch: null,
      serviceEra: null,
      dischargeStatus: null,
      vaRating: null,
      state: null,
      primaryNeed: null,
      needs: [],
      documents: []
    },

    /**
     * Update a profile field.
     * @param {string} key
     * @param {*} value
     */
    set: function(key, value) {
      MemoryManager.profile[key] = value;
    },

    /**
     * Get a profile field.
     * @param {string} key
     * @returns {*}
     */
    get: function(key) {
      return MemoryManager.profile[key];
    },

    /**
     * Get the full profile snapshot.
     * @returns {Object}
     */
    getProfile: function() {
      return Object.assign({}, MemoryManager.profile);
    },

    /**
     * Reset all in-session memory.
     */
    reset: function() {
      MemoryManager.profile = {
        name: null, branch: null, serviceEra: null,
        dischargeStatus: null, vaRating: null, state: null,
        primaryNeed: null, needs: [], documents: []
      };
    },

    /**
     * Persist current profile to Supabase (placeholder).
     * @returns {Promise}
     */
    save: function() {
      // Placeholder — will POST to Supabase profiles table
      return Promise.resolve();
    },

    /**
     * Load profile from Supabase for a returning user (placeholder).
     * @param {string} userId
     * @returns {Promise}
     */
    load: function(userId) {
      // Placeholder — will GET from Supabase profiles table
      return Promise.resolve(null);
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Memory = MemoryManager;

})();
