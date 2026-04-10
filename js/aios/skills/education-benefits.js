/* ══════════════════════════════════════════════════════════
   AIOS Skill — Education Benefits Navigator  (Phase R5.2)
   Decision engine for GI Bill chapter selection, VR&E,
   VET TEC, transfer, and entitlement guidance.
   Produces deterministic path recommendations — not
   generic "you may qualify" answers.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var SKILL_PROMPT = [
    '## ACTIVE SKILL: EDUCATION BENEFITS NAVIGATOR',
    '',
    '### YOUR ROLE',
    'You are a VA education benefits decision engine. You make specific, justified recommendations',
    'about which education program fits this veteran — and exactly how to access it.',
    'You do NOT say "you may qualify." You explain which path fits and WHY, based on what you know.',
    'You do NOT overwhelm — you recommend ONE primary path, then state ONE backup.',
    '',
    '### DECISION LOGIC — APPLY IN THIS ORDER',
    '',
    '**STEP 1 — Determine primary eligibility gate:**',
    '- Honorable or General discharge: eligible for Post-9/11 GI Bill (Ch. 33)',
    '- OTH or worse: NOT eligible for GI Bill. Route to VSO for Character of Discharge review first.',
    '- 10%+ VA disability rating with employment barrier: VR&E (Ch. 31) is likely the strongest path — it pays',
    '  full tuition + monthly stipend. VR&E eligibility depends on discharge status and VA determination.',
    '- Still active duty: Montgomery GI Bill (Ch. 30) or tuition assistance (TA) — NOT Post-9/11 yet.',
    '',
    '**STEP 2 — Score primary path:**',
    '- VA rating >= 10% AND cannot work in current field: recommend VR&E (Ch. 31) FIRST.',
    '  Reason: VR&E covers tuition + books + monthly subsistence — often more than Ch. 33 alone.',
    '  VR&E also covers licensing/certification exams and OJT programs.',
    '- Post-9/11 service (Sept 11, 2001 or later) + honorable discharge: recommend Ch. 33 if no VR&E.',
    '  Ch. 33 covers tuition (100% at public in-state), BAH at E-5 with-dependent rate, $1,000/yr books.',
    '- Pre-9/11 only + honorable: recommend Montgomery GI Bill (Ch. 30) — $2,143/month full-time (2024).',
    '- Dependents seeking education after veteran death/disability: DEA (Ch. 35) — 45 months.',
    '',
    '**STEP 3 — Refine based on goal:**',
    '- Goal = 4-year degree: Ch. 33 or Ch. 31 (Chapter 33 school must be VA-approved, Ch. 31 any approved school)',
    '- Goal = certification or trade license: VET TEC (IT only) or VR&E (all fields). VET TEC pays 100% tuition,',
    '  provides monthly stipend, no entitlement used. Apply at va.gov/education/about-gi-bill-benefits/how-to-use-benefits/vettec-high-tech-program.',
    '- Goal = apprenticeship/OJT: Ch. 33 or Ch. 30 covers OJT — 6 months full rate, diminishing to 40% at month 18+.',
    '- Goal = transfer benefit to child or spouse: Ch. 33 Transfer of Entitlement (TOE). Must be requested',
    '  WHILE STILL ON ACTIVE DUTY or before separation. Cannot transfer after separating.',
    '',
    '**STEP 4 — Separation timeline urgency flags:**',
    '- Separating within 12 months: apply for GI Bill NOW at va.gov (processing takes 30-60 days).',
    '  File Intent to Enroll if school term starts before benefits activate.',
    '  Transfer of entitlement MUST happen before separation — time-critical.',
    '- Within 1-5 years of separation: 15-year entitlement clock is running on Ch. 30.',
    '  Ch. 33 has no expiration for most veterans (post-2013 change — confirm with VA).',
    '',
    '### REQUIRED OUTPUT FORMAT',
    'Structure your answer as:',
    '',
    '**YOUR RECOMMENDED PATH: [Ch. 33 / VR&E / VET TEC / Ch. 30 / Other]**',
    'Why this fits you: [1-2 sentences directly tied to their situation]',
    '',
    '**What you will receive:**',
    '- [Specific dollar amount or benefit, not vague ranges]',
    '- [Specific dollar amount or benefit #2]',
    '- [Specific dollar amount or benefit #3 if applicable]',
    '',
    '**Your 3 next actions:**',
    '1. [Specific action — name the form, URL, or phone number]',
    '2. [Specific action]',
    '3. [Specific action]',
    '',
    '**Backup path:** [Alternative if primary is unavailable or insufficient]',
    '',
    '### KEY KNOWLEDGE',
    '- Ch. 33 (Post-9/11): 100% tuition at public in-state, up to $28,937/yr private (2024-25), BAH at E-5 w/dep rate',
    '  by zip, $1,000/yr book stipend. Apply: va.gov/education/apply-for-education-benefits/application/1990',
    '- Ch. 30 (MGIB): $2,143/month full-time (2024), no housing allowance. Must contribute $1,200 during service.',
    '- VR&E / Ch. 31: Tuition + fees 100%, books, monthly subsistence allowance (~$1,169-$1,606/month 2024).',
    '  Apply: va.gov/careers-employment/vocational-rehabilitation/apply-vre-form-28-1900',
    '- VET TEC: IT certification programs only. 100% tuition, monthly stipend. Zero entitlement used.',
    '  Apply: va.gov/education/about-gi-bill-benefits/how-to-use-benefits/vettec-high-tech-program',
    '- Transfer of Entitlement (TOE): Must be active duty when submitted. At least 6 years served. Service obligation required.',
    '  Apply through MilConnect: milconnect.dmdc.osd.mil',
    '- Yellow Ribbon: Supplements Ch. 33 at private/out-of-state schools above tuition cap. School must participate.',
    '- STEM Scholarship: 9-month extension for Ch. 33 in STEM degrees — requires 6 months or fewer of benefits remaining.',
    '',
    '### RULES',
    '- Never say "you may qualify" or "you might be eligible." Say what applies and why.',
    '- Never recommend a chapter without stating what it pays in concrete terms.',
    '- If discharge status is OTH or worse, state this clearly and redirect to discharge upgrade or VSO review first.',
    '- If transfer to dependent is mentioned and veteran is already separated, state clearly: transfer is no longer possible.',
    '- If information is missing, ask ONE specific question — not multiple.',
    '- Always give exactly 3 next actions, each with a specific form number, URL, or phone number.',
    '- End with a follow-up question or OPTIONS to keep the veteran moving forward.',
    '',
    '[OPTIONS: Apply for GI Bill now | Explore VR&E | Ask about VET TEC | Transfer to my dependent | Check my entitlement remaining]'
  ].join('\n');


  /* ────────────────────────────────────────────────────────
     Path determination helper
     Returns the recommended chapter based on profile data.
     ──────────────────────────────────────────────────────── */
  function _determinePrimaryPath(profile, userInput) {
    var input = (userInput || '').toLowerCase();

    // OTH or worse — must flag before anything else
    var discharge = profile.dischargeStatus || '';
    if (discharge === 'Other Than Honorable' || discharge === 'Bad Conduct' || discharge === 'Dishonorable') {
      return 'discharge-review-required';
    }

    // Still active duty
    if (profile.separationTimeline === 'active-duty') {
      return 'active-duty-ta-or-ch30';
    }

    // Transfer request — flag time-criticality (must check before VR&E gate; rated veterans can still transfer)
    if (
      (input.indexOf('transfer') !== -1 && (
        input.indexOf('gi bill') !== -1 ||
        input.indexOf('entitlement') !== -1 ||
        input.indexOf('benefit') !== -1 ||
        input.indexOf('to my') !== -1
      )) ||
      input.indexOf('dependent') !== -1 ||
      input.indexOf('child') !== -1 ||
      input.indexOf('spouse') !== -1
    ) {
      if (profile.separationTimeline && profile.separationTimeline !== 'active-duty' && profile.separationTimeline !== 'within-1-year') {
        return 'transfer-too-late';
      }
      return 'transfer-entitlement';
    }

    // VR&E wins when VA rating >= 10 (employment barrier implied by seeking education)
    var vaRating = (profile.vaRating !== null && profile.vaRating !== undefined) ? profile.vaRating : -1;
    if (vaRating >= 10) {
      return 'vre-ch31';
    }

    // Certification / tech training request — offer VET TEC if IT-adjacent
    var certGoal = (
      input.indexOf('certification') !== -1 ||
      input.indexOf('cert') !== -1 ||
      input.indexOf('trade') !== -1 ||
      input.indexOf('vet tec') !== -1 ||
      input.indexOf('it program') !== -1 ||
      input.indexOf('cyber') !== -1 ||
      input.indexOf('coding') !== -1
    );
    if (certGoal) {
      return 'vettec-or-vre';
    }

    // Post-9/11 service era — Chapter 33 is primary
    var era = (profile.serviceEra || '').toLowerCase();
    if (
      era.indexOf('post-9/11') !== -1 ||
      era.indexOf('oef') !== -1 ||
      era.indexOf('oif') !== -1 ||
      era.indexOf('ond') !== -1 ||
      era.indexOf('oir') !== -1
    ) {
      return 'ch33-post911';
    }

    // Pre-9/11 with honorable — Montgomery (Ch. 30)
    if (discharge === 'Honorable' || discharge === 'General') {
      return 'ch30-mgib';
    }

    // Fallback — need more info
    return 'needs-intake';
  }


  /* ────────────────────────────────────────────────────────
     Prompt data builder
     Injects structured decision context into SKILL_PROMPT
     so the AI response is specific, not generic.
     ──────────────────────────────────────────────────────── */
  function _buildContextBlock(profile, primaryPath, separationUrgent) {
    var lines = ['## EDUCATION CONTEXT (system-computed — use to personalize response)'];

    // Primary path recommendation
    var pathMap = {
      'vre-ch31':                 'VR&E (Chapter 31) is the recommended primary path. With a VA rating of 10% or more, education can be a pathway to suitable employment under VR&E.',
      'ch33-post911':             'Post-9/11 GI Bill (Chapter 33) is the recommended primary path, based on confirmed post-9/11 service.',
      'ch30-mgib':                'Montgomery GI Bill (Chapter 30) is the recommended primary path for pre-9/11 service with an honorable discharge.',
      'vettec-or-vre':            'VET TEC (IT certifications, zero entitlement used) or VR&E is recommended for certification or trade goals.',
      'transfer-entitlement':     'Transfer of Entitlement (TOE) is time-sensitive — it must be requested while still on active duty, before separation.',
      'transfer-too-late':        'Transfer of entitlement is no longer available after separation. The veteran can still use their own GI Bill benefits, and dependents may have other paths such as the Fry Scholarship (for survivors of service members who died in the line of duty after Sept 10, 2001) or DEA / Chapter 35 (for dependents of veterans permanently and totally disabled or who died from a service-connected condition).',
      'active-duty-ta-or-ch30':   'Tuition Assistance (TA) or the Montgomery GI Bill is the recommended path while on active duty.',
      'discharge-review-required':'A discharge upgrade or Character of Discharge review through a VSO is the first step before GI Bill eligibility can be established.',
      'needs-intake':             'Not enough profile data yet — discharge status and service era are needed before a path can be recommended.'
    };
    lines.push('Recommended path: ' + (pathMap[primaryPath] || primaryPath));

    // Separation urgency
    if (separationUrgent) {
      lines.push('URGENCY FLAG: Veteran separating within 12 months — apply for GI Bill now, transfer must happen before ETS');
    }

    // Known profile fields
    if (profile.serviceEra)        lines.push('Service era: ' + profile.serviceEra);
    if (profile.dischargeStatus)   lines.push('Discharge: ' + profile.dischargeStatus);
    if (profile.vaRating !== null && profile.vaRating !== undefined)
                                   lines.push('VA rating: ' + profile.vaRating + '%');
    if (profile.separationTimeline) lines.push('Separation timeline: ' + profile.separationTimeline);

    return lines.join('\n');
  }


  /* ────────────────────────────────────────────────────────
     Skill module
     ──────────────────────────────────────────────────────── */
  var EducationBenefits = {

    id: 'education-benefits',
    name: 'Education Benefits Navigator',
    description: 'Decision engine for GI Bill chapter selection, VR&E, VET TEC, and education entitlement guidance.',

    triggers: [
      'GI Bill', 'education benefits', 'chapter 33', 'chapter 31',
      'VR&E', 'vocational rehabilitation', 'VET TEC',
      'go back to school', 'finish my degree', 'tuition',
      'certification', 'apprenticeship', 'transfer GI Bill'
    ],

    prompt: SKILL_PROMPT,

    phases: [
      { id: 'path-select',   name: 'Determine primary education path' },
      { id: 'entitlement',   name: 'Estimate entitlement and benefits' },
      { id: 'apply',         name: 'Complete application' },
      { id: 'enroll',        name: 'Certify enrollment and activate benefits' }
    ],

    requiredFields: ['dischargeStatus', 'serviceEra'],

    contextFields: ['dischargeStatus', 'serviceEra', 'vaRating', 'separationTimeline'],

    /**
     * Execute the skill against the current context.
     * @param {Object} context - { profile, history, userInput, missionPhase }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var profile    = (context && context.profile) ? context.profile : {};
      var userInput  = (context && context.userInput) ? context.userInput : '';
      var historyLen = (context && context.history) ? context.history.length : 0;

      // ── Determine primary path ─────────────────────────
      var primaryPath = _determinePrimaryPath(profile, userInput);

      // ── Urgency flag ───────────────────────────────────
      var separationUrgent = (
        profile.separationTimeline === 'active-duty' ||
        profile.separationTimeline === 'within-1-year'
      );

      // ── Unknown fields ─────────────────────────────────
      var unknown = [];
      if (!profile.dischargeStatus)                                              unknown.push('dischargeStatus');
      if (!profile.serviceEra)                                                   unknown.push('serviceEra');
      if (profile.vaRating === null || profile.vaRating === undefined)           unknown.push('vaRating');
      if (!profile.separationTimeline)                                           unknown.push('separationTimeline');

      // ── Build context block ────────────────────────────
      var contextBlock = _buildContextBlock(profile, primaryPath, separationUrgent);

      // ── Structured output data ─────────────────────────
      var data = {
        canRespond:      true,
        recommendedPath: primaryPath,
        separationUrgent: separationUrgent
      };

      if (unknown.length) data.unknownFields = unknown;

      // ── Eligibility signal ─────────────────────────────
      var Elig = window.AIOS && window.AIOS.Eligibility;
      if (Elig && Elig.hasUsefulSignal(profile)) {
        var scores = Elig.score(profile);
        if (scores.GI_BILL !== undefined)           data.giBillScore  = scores.GI_BILL;
        if (scores.VR_E    !== undefined)           data.vreScore     = scores.VR_E;
        if (scores.EMPLOYMENT_SUPPORT !== undefined) data.employScore  = scores.EMPLOYMENT_SUPPORT;
      }

      // ── Chain to next-action-planner after depth ───────
      if (historyLen >= 3) {
        data.chain = {
          nextSkill:     'next-action-planner',
          label:         'Ready to build your full education action plan?',
          sendText:      'Build my education action plan',
          missionType:   'education_benefits',
          missionUpdate: {
            currentStep: 'Select education program and confirm eligibility',
            nextStep:    'Submit application at va.gov'
          }
        };
      }

      // ── Combine context block into prompt ──────────────
      var fullPrompt = SKILL_PROMPT + '\n\n' + contextBlock;

      return { prompt: fullPrompt, data: data };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['education-benefits'] = EducationBenefits;

})();
