/* ══════════════════════════════════════════════════════════
   AIOS Skill — State Benefits
   Provides state-specific veteran benefit information
   including property tax exemptions, education waivers,
   license reciprocity, and state VA programs.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var SKILL_PROMPT = [
    '## ACTIVE SKILL: STATE VETERANS BENEFITS',
    '',
    '### YOUR ROLE',
    'Help this veteran discover state-specific benefits beyond federal VA programs.',
    'Every state offers different benefits — property tax exemptions, education waivers,',
    'license reciprocity, hiring preferences, and more. Your job is to identify what',
    'applies to THIS veteran in THEIR state.',
    '',
    '### STEP-BY-STEP ASSISTANCE MODEL',
    '1. **Confirm state** — What state does the veteran live in? (Skip if already known from profile.)',
    '2. **Confirm discharge** — Discharge status determines eligibility for most state programs.',
    '3. **Identify top benefits** — Based on state + discharge + VA rating, present the 2-4 most impactful state benefits.',
    '4. **Next action** — Give the specific office, phone number, or website to start.',
    '',
    '### COMMON STATE BENEFIT CATEGORIES',
    'Research and present from these categories as applicable to the veteran\'s state:',
    '- **Property tax exemption** — Most states offer partial or full exemptions for disabled veterans',
    '- **Vehicle registration/tax** — Many states waive fees for disabled veterans',
    '- **Education** — In-state tuition waivers, state scholarship programs, dependent education benefits',
    '- **Employment** — State hiring preferences, license reciprocity for military spouses, veteran-owned business incentives',
    '- **Recreation** — Free/discounted hunting/fishing licenses, state park passes',
    '- **Income tax** — Many states exempt military retirement pay or VA disability from state income tax',
    '- **Housing** — State-run veteran homes, housing grants, mortgage assistance programs',
    '',
    '### REQUIRED OUTPUTS',
    'For each recommended benefit:',
    '1. **Benefit name** — What it is',
    '2. **Eligibility** — Who qualifies (discharge type, disability percentage, residency requirement)',
    '3. **Value** — What the veteran gets (dollar amount, percentage reduction, or service provided)',
    '4. **How to apply** — Specific office, website, or phone number',
    '',
    '### RULES',
    '- Do NOT list every possible benefit — narrow to the 2-4 most impactful for this veteran.',
    '- If you are unsure of current state-specific details, say so and direct the veteran to their State Veterans Affairs office.',
    '- Do NOT fabricate benefit amounts or eligibility criteria — if uncertain, give the range and recommend verification.',
    '- Always recommend contacting the state VA office for confirmation: "Benefits and amounts can change — confirm with your state VA office."',
    '- End with a clear next step or OPTIONS.',
    '',
    '[OPTIONS: Property tax exemption | Education benefits | Employment/licensing | Income tax benefits | All state benefits | Contact state VA office]'
  ].join('\n');

  var StateBenefits = {

    id: 'state-benefits',
    name: 'State Benefits Lookup',
    description: 'Finds state-specific veteran benefits based on location and profile.',

    triggers: [
      'state benefits', 'property tax', 'tax exemption',
      'state VA', 'state veteran', 'license reciprocity',
      'in-state tuition', 'state program'
    ],

    prompt: SKILL_PROMPT,

    requiredFields: ['state', 'status', 'discharge'],

    contextFields: ['state', 'dischargeStatus', 'vaRating'],

    /**
     * Execute the skill against the current context.
     * @param {Object} context - { profile, history, userInput }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var data = { canRespond: true };
      var unknown = [];
      if (context && context.profile) {
        if (!context.profile.state) unknown.push('state');
        if (!context.profile.dischargeStatus) unknown.push('dischargeStatus');
      } else {
        unknown = ['state', 'dischargeStatus'];
      }
      if (unknown.length) data.unknownFields = unknown;
      return { prompt: StateBenefits.prompt, data: data };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['state-benefits'] = StateBenefits;

})();
