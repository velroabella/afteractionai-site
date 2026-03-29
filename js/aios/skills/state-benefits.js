/* ══════════════════════════════════════════════════════════
   AIOS Skill — State Benefits
   Provides state-specific veteran benefit information
   including property tax exemptions, education waivers,
   license reciprocity, and state VA programs.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var StateBenefits = {

    id: 'state-benefits',
    name: 'State Benefits Lookup',
    description: 'Finds state-specific veteran benefits based on location and profile.',

    triggers: [
      'state benefits', 'property tax', 'tax exemption',
      'state VA', 'state veteran', 'license reciprocity',
      'in-state tuition', 'state program'
    ],

    prompt: '',

    requiredFields: ['state', 'status', 'discharge'],

    /**
     * Execute the skill against the current context.
     * @param {Object} context - { profile, history, userInput }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      // Placeholder — will query state benefits database
      return { prompt: StateBenefits.prompt, data: {} };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['state-benefits'] = StateBenefits;

})();
