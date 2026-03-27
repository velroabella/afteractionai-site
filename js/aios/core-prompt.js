/* ══════════════════════════════════════════════════════════
   AIOS — Core Prompt Manager
   Assembles the system prompt from base instructions,
   active skill context, veteran profile, and mission state.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var CorePrompt = {

    /** Base system instructions shared across all interactions */
    baseInstructions: '',

    /**
     * Build the full system prompt for a given request context.
     * @param {Object} context - { skill, profile, mission, history }
     * @returns {string} Assembled system prompt
     */
    build: function(context) {
      // Placeholder — will compose prompt from base + skill + profile + mission
      return CorePrompt.baseInstructions;
    },

    /**
     * Set the base instructions (loaded once at init).
     * @param {string} instructions
     */
    setBase: function(instructions) {
      CorePrompt.baseInstructions = instructions;
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.CorePrompt = CorePrompt;

})();
