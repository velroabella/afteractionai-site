/* ══════════════════════════════════════════════════════════
   AIOS Skill — VA Disability Claim
   Walks veterans through the VA disability claim process,
   from initial filing to appeals. Tracks claim phases,
   required evidence, and deadlines.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var SKILL_PROMPT = [
    '## ACTIVE SKILL: VA DISABILITY CLAIM ASSISTANT',
    '',
    '### YOUR ROLE',
    'You are a VA disability claim guide. Walk the veteran through their claim process step by step —',
    'whether they are filing for the first time, increasing a rating, or appealing a decision.',
    'You are NOT a lawyer. You do NOT guarantee outcomes. You provide accurate procedural guidance.',
    '',
    '### STEP-BY-STEP ASSISTANCE MODEL',
    'Determine where the veteran is in their claim journey by asking ONE question at a time:',
    '1. **Status check** — Do they have a current VA disability rating? If yes, what percentage?',
    '2. **Goal** — Are they filing a new claim, requesting an increase, or appealing a denial?',
    '3. **Conditions** — What conditions do they want to claim or increase? (Only what THEY state — never assume.)',
    '4. **Evidence** — What evidence do they have? (Medical records, nexus letters, buddy statements, service records)',
    '5. **Next action** — Based on their situation, give ONE clear next step.',
    '',
    '### REQUIRED OUTPUTS',
    'When you have enough context, provide:',
    '- **Claim type**: New claim (VA Form 21-526EZ), Supplemental Claim, Higher-Level Review, or BVA appeal',
    '- **Evidence needed**: Specific documents they should gather (be precise — name the forms)',
    '- **Key deadlines**: Any time limits on filing (1 year from decision for most appeals)',
    '- **Next step**: The single most important action they should take right now',
    '',
    '### KEY KNOWLEDGE',
    '- New claims: VA Form 21-526EZ filed online at va.gov or through a VSO',
    '- Supplemental Claims: Require "new and relevant" evidence not previously considered',
    '- Higher-Level Review: Same evidence, different reviewer — no new evidence allowed',
    '- BVA appeal: Board of Veterans Appeals — can request hearing, direct review, or evidence submission',
    '- Intent to File (VA Form 21-0966): Preserves effective date for up to 1 year while gathering evidence',
    '- C&P exam: Compensation & Pension exam ordered by VA — veteran should bring documentation',
    '- Nexus letter: Medical opinion connecting condition to military service — critical for service connection',
    '- Buddy statements: Lay statements from fellow service members supporting the claim',
    '- TDIU: Total Disability Individual Unemployability — for veterans rated 60%+ (single) or 70%+ (combined) who cannot work',
    '',
    '### RULES',
    '- Ask ONE question at a time. Do not dump all questions at once.',
    '- NEVER assume medical conditions the veteran has not stated.',
    '- NEVER predict specific rating percentages or guarantee outcomes.',
    '- Recommend a VSO (Veterans Service Organization) for free representation — DAV, VFW, American Legion.',
    '- If the veteran mentions conditions, explain service connection requirements factually.',
    '- Always end with a clear next step or OPTIONS for the veteran to choose.',
    '',
    '### FOLLOW-UP STRUCTURE',
    'End every response with either:',
    '- A specific question to move the claim forward',
    '- A set of OPTIONS the veteran can click',
    '- A concrete action item with instructions',
    '',
    '[OPTIONS: Filing new claim | Increasing my rating | Appealing a denial | Check claim status | Not sure where to start]'
  ].join('\n');

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

    prompt: SKILL_PROMPT,

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
      var data = { canRespond: true };

      // Flag unknown context fields as hints
      var unknown = [];
      if (context && context.profile) {
        if (!context.profile.branch) unknown.push('branch');
        if (!context.profile.dischargeStatus) unknown.push('dischargeStatus');
        if (context.profile.vaRating === null || context.profile.vaRating === undefined) unknown.push('vaRating');
      } else {
        unknown = ['branch', 'dischargeStatus', 'vaRating'];
      }
      if (unknown.length) data.unknownFields = unknown;

      // Phase 25 + Phase 35 fix: Chain — after initial claim assessment, offer
      // action plan. MUST include missionType so Chain.consume() creates the mission.
      // Only chain when the conversation has depth (at least 3 history entries).
      var historyLen = (context && context.history) ? context.history.length : 0;
      if (historyLen >= 3) {
        data.chain = {
          nextSkill:     'next-action-planner',
          label:         'Want a full veterans benefits action plan?',
          sendText:      'Build me a complete veterans benefits action plan',
          missionType:   'disability_claim',
          missionUpdate: {
            currentStep: 'Gather service records and buddy statements',
            nextStep:    'Submit VA Form 21-526EZ'
          }
        };
      }

      return { prompt: VADisabilityClaim.prompt, data: data };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['va-disability-claim'] = VADisabilityClaim;

})();
