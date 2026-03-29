/* ══════════════════════════════════════════════════════════
   AIOS Skill — VA Disability Claim
   Walks veterans through the VA disability claim process,
   from initial filing to appeals. Tracks claim phases,
   required evidence, and deadlines.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var VADisabilityClaim = {

    id: 'va-disability-claim',
    name: 'VA Disability Claim Assistant',
    description: 'Guides veterans through filing or appealing a VA disability claim.',

    triggers: [
      'disability claim', 'file a claim', 'VA claim',
      'disability rating', 'C&P exam', 'appeal',
      'supplemental claim', 'higher-level review',
      'Board of Veterans Appeals', 'BVA', 'nexus letter'
    ],

    prompt: '',

    /** Mission phases for this multi-turn skill */
    phases: [
      { id: 'assess', name: 'Assess current claim status' },
      { id: 'evidence', name: 'Identify required evidence' },
      { id: 'file', name: 'Prepare filing documents' },
      { id: 'track', name: 'Track claim progress' }
    ],

    requiredFields: ['branch', 'status', 'discharge', 'vaRating'],

    /**
     * Execute the skill against the current context.
     * @param {Object} context - { profile, history, userInput, missionPhase }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var data = {};

      // Phase 25: Chain — after initial claim assessment, offer to build a
      // full action plan via the Next Action Planner skill.
      // missionUpdate advances the active disability_claim mission to the
      // evidence-gathering step if one is already running.
      data.chain = {
        nextSkill:   'next-action-planner',
        label:       'Want a full veterans benefits action plan?',
        sendText:    'Build me a complete veterans benefits action plan',
        missionUpdate: {
          currentStep: 'Gather service records and buddy statements',
          nextStep:    'Submit VA Form 21-526EZ'
        }
      };

      return { prompt: VADisabilityClaim.prompt, data: data };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['va-disability-claim'] = VADisabilityClaim;

})();
