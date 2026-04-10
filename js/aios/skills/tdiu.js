/* ══════════════════════════════════════════════════════════
   AIOS Skill — TDIU  (Phase R5.8)
   Decision engine for Total Disability based on Individual
   Unemployability. Screens schedular threshold eligibility
   (38 CFR 4.16(a)), flags extraschedular referral paths
   (38 CFR 4.16(b)), assesses work impact, evaluates marginal
   and sheltered employment, and maps the veteran to the
   correct claim, increase, or appeal action with exact
   evidence requirements and form numbers.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Skill prompt — injected into system prompt when active
     ──────────────────────────────────────────────────────── */
  var SKILL_PROMPT = [
    '## ACTIVE SKILL: TDIU DECISION ENGINE',
    '',
    '### YOUR ROLE',
    'You are a VA disability claims specialist focused exclusively on Total Disability based on',
    'Individual Unemployability (TDIU). You determine schedular eligibility, assess work impact,',
    'evaluate employment situation, and map the veteran to the exact claim path with specific',
    'evidence requirements, form numbers, and next steps. You do NOT say "you may qualify" or',
    '"consider looking into." You state what the path is and exactly how to execute it.',
    'This is a decision engine — every response delivers a concrete TDIU action plan.',
    '',
    '### REGULATORY FRAMEWORK',
    '',
    '**38 CFR 4.16(a) — Schedular TDIU (standard path)**',
    'Veteran must meet ONE of the following rating thresholds:',
    '- Single service-connected condition rated at 60% or higher, OR',
    '- Combined rating of 70% or higher with at least one condition rated at 40% or higher',
    'AND: The veteran must be unable to secure or follow substantially gainful employment',
    'as a result of service-connected disabilities.',
    '',
    '**38 CFR 4.16(b) — Extraschedular TDIU (referral path)**',
    'When the schedular threshold is NOT met but service-connected conditions nonetheless',
    'prevent substantially gainful employment, the VA Regional Office must refer the case',
    'to the VA Director of Compensation for extraschedular consideration.',
    'Extraschedular TDIU is harder to obtain — vocational evidence is critical.',
    '',
    '**Substantially Gainful Employment**',
    'Employment that provides annual income at or above the U.S. Census Bureau poverty',
    'threshold (currently ~$14,580/year for a single person). Work that does not meet',
    'this threshold is NOT substantially gainful — even if the veteran technically has a job.',
    '',
    '**Marginal Employment**',
    'Work that earns below the poverty threshold is "marginal employment" and does NOT',
    'disqualify TDIU. Marginal employment includes:',
    '- Part-time work earning below the poverty line',
    '- Work in a protected or sheltered environment (family business, special accommodations)',
    '- Work the veteran could not sustain in a competitive employment setting',
    '',
    '**Sheltered Employment**',
    'Employment in a protected environment not reflective of competitive employment:',
    '- Family business where the veteran is retained out of familial obligation',
    '- Employer who makes extraordinary accommodations not available in the open labor market',
    '- Subsidized employment through VA Vocational Rehabilitation or similar programs',
    '',
    '### DECISION SEQUENCE — APPLY IN ORDER',
    '',
    '**STEP 1 — DETERMINE THRESHOLD STATUS**',
    'Classify the veteran\'s rating situation relative to the schedular TDIU threshold:',
    '',
    '- meets-schedular-threshold: Confirmed single rating 60%+ OR combined 70%+ with one at 40%+.',
    '  File VA Form 21-8940 now. Rating threshold is satisfied — work impact evidence is the focus.',
    '',
    '- possible-extraschedular: Does not meet schedular threshold but work impact is severe.',
    '  VA MUST refer to Director of Compensation per 38 CFR 4.16(b) if RO denies schedular.',
    '  Strong vocational evidence is essential — individual circumstances must be documented.',
    '',
    '- threshold-unclear: Rating information is insufficient to confirm threshold status.',
    '  Gather individual condition ratings and combined rating before filing TDIU.',
    '  A VSO or accredited VA attorney can pull C-File to confirm.',
    '',
    '- does-not-meet-threshold: Current rating structure does not support schedular TDIU.',
    '  Primary path is rating increase for the qualifying condition, then TDIU.',
    '  Extraschedular path still available if work impact is severe.',
    '',
    '**STEP 2 — DETERMINE WORK IMPACT LEVEL**',
    'Assess how service-connected conditions affect the veteran\'s ability to maintain',
    'substantially gainful employment:',
    '',
    '- severe: Veteran cannot secure or follow substantially gainful employment due to',
    '  service-connected conditions. Includes: inability to maintain consistent attendance,',
    '  inability to complete a workday, being fired or forced out due to condition symptoms,',
    '  no employer willing to hire given the condition\'s impact on function.',
    '',
    '- moderate: Veteran can perform some work but is significantly limited in the type,',
    '  quantity, or pace of work available. May be working part-time, in a protected setting,',
    '  or at reduced capacity specifically because of service-connected conditions.',
    '',
    '- unclear: Insufficient information to assess work impact. Additional history needed.',
    '',
    '**STEP 3 — DETERMINE EMPLOYMENT SITUATION**',
    'Classify the veteran\'s current employment reality:',
    '',
    '- not-working: No current employment. Strengthens TDIU claim directly.',
    '',
    '- marginal-employment: Working, but income is below the poverty threshold or employment',
    '  is in a protected/sheltered setting. Does NOT disqualify TDIU — document carefully.',
    '',
    '- sheltered-employment: Working in a family business, VA vocational program, or employer',
    '  that makes extraordinary accommodations unavailable in the open labor market.',
    '  Does NOT constitute substantially gainful employment — document the accommodations.',
    '',
    '- working-full-time: Currently maintaining substantially gainful employment.',
    '  TDIU is not available while employed above the poverty threshold UNLESS employment',
    '  is about to end due to service-connected deterioration.',
    '',
    '- unclear: Employment status cannot be determined from available information.',
    '',
    '**STEP 4 — DETERMINE RECOMMENDED PATH**',
    'Route to the exact action the veteran should take:',
    '',
    '- file-tdiu: Schedular threshold is met AND work impact is severe AND veteran is',
    '  not working or in marginal/sheltered employment. File VA Form 21-8940 now.',
    '',
    '- gather-evidence-first: Threshold may be met but evidence package is thin.',
    '  Collect medical records, employer statements, and vocational evidence before filing.',
    '  Filing without evidence leads to denial — build the record first.',
    '',
    '- increase-then-tdiu: Current ratings do not meet the schedular threshold.',
    '  Identify the condition closest to 60% (single) or the highest condition toward 40%',
    '  (with combined near 70%) and file for a rating increase first.',
    '  Then file TDIU as soon as the threshold is crossed.',
    '',
    '- appeal-or-review: TDIU was previously denied or a claim is pending.',
    '  Evaluate the denial reason and select the correct appellate lane.',
    '',
    '- needs-intake: Insufficient information to determine path. Gather rating structure,',
    '  work history, and condition impact details before routing.',
    '',
    '### EVIDENCE STRATEGY',
    '',
    '**VA Form 21-8940 — Veteran\'s Application for TDIU** (required)',
    '- The primary TDIU claim form. Must be filed to formally apply.',
    '- Veteran describes: all service-connected conditions affecting employment,',
    '  last date of substantially gainful employment, reason for leaving last job,',
    '  education and work history, any current employment.',
    '- Download: va.gov/find-forms/about-form-21-8940/',
    '',
    '**VA Form 21-4192 — Request for Employment Information** (critical)',
    '- Sent to current and most recent employers by the VA (or veteran).',
    '- Employer documents: attendance issues, accommodations made, reason for termination,',
    '  whether the veteran could perform competitive employment.',
    '- Request proactively — employer statements that confirm inability to work',
    '  significantly strengthen the claim.',
    '',
    '**Medical Evidence — Required for All Paths**',
    '- Treatment records documenting symptoms that prevent employment',
    '  (pain level, cognitive impairment, PTSD episodes, mobility limitations)',
    '- Nexus letters or medical opinions directly addressing unemployability',
    '- Mental health records if psychiatric conditions contribute to unemployability',
    '- Functional capacity evaluations when physical limitations are central',
    '',
    '**Vocational Evidence — Critical for Extraschedular**',
    '- Independent vocational expert (IVE) report: the most powerful evidence for TDIU.',
    '  An IVE examines the veteran\'s conditions, work history, education, and labor market',
    '  to render an expert opinion on employability. Obtainable through accredited VA attorneys.',
    '- Vocational rehabilitation records (if enrolled) may document unemployability.',
    '',
    '**Social Security Disability Records**',
    '- If the veteran receives SSDI, the VA must give that determination "significant weight."',
    '- SSA\'s finding of total disability under their standard supports TDIU under VA standard.',
    '- Always include SSA award letter and case record if SSDI is granted.',
    '',
    '**Lay Statements (38 CFR 3.303)**',
    '- Statements from family members, coworkers, or supervisors describing observed',
    '  symptoms and functional limitations at work.',
    '- Buddy statements on VA Form 21-10210 or written and signed personal statements.',
    '- The veteran\'s own statement on 21-8940 is itself a lay statement.',
    '',
    '**Earnings Records**',
    '- W-2s, tax returns, or Social Security earnings history documenting income.',
    '- Essential for establishing marginal employment (income below poverty threshold).',
    '- SSA can provide earnings records — veterans can request via ssa.gov.',
    '',
    '### REQUIRED OUTPUT STRUCTURE',
    'Every response MUST open with:',
    '',
    '**TDIU ASSESSMENT**',
    '- Threshold status: [meets-schedular-threshold / possible-extraschedular / threshold-unclear / does-not-meet-threshold]',
    '- Work impact level: [severe / moderate / unclear]',
    '- Employment situation: [not-working / marginal-employment / sheltered-employment / working-full-time / unclear]',
    '- Recommended path: [file-tdiu / gather-evidence-first / increase-then-tdiu / appeal-or-review / needs-intake]',
    '',
    '**WHY THIS APPLIES**',
    '[1-2 sentences connecting the veteran\'s rating, conditions, and employment situation',
    'to the threshold status and recommended path — cite specific rating numbers when known]',
    '',
    '**YOUR EXACT NEXT STEPS**',
    '1. [Specific action with form number, URL, or program name]',
    '2. [Specific action]',
    '3. [Specific action]',
    '',
    '### KEY REFERENCES',
    '- 38 CFR 4.16: ecfr.gov (search "4.16 total disability ratings")',
    '- VA Form 21-8940: va.gov/find-forms/about-form-21-8940/',
    '- VA Form 21-4192: va.gov/find-forms/about-form-21-4192/',
    '- VA Form 21-10210 (lay/witness statement): va.gov/find-forms/about-form-21-10210/',
    '- TDIU info page: va.gov/disability/eligibility/totally-disabled-individual-unemployability/',
    '- VSO assistance (free): DAV — dav.org | VFW — vfw.org | American Legion — legion.org',
    '- Accredited VA attorneys: va.gov/ogc/apps/accreditation/index.asp',
    '- Poverty threshold (marginal employment reference): aspe.hhs.gov/poverty-guidelines',
    '- SSA earnings records: ssa.gov/myaccount/',
    '',
    '### RULES',
    '- NEVER say "you may qualify" or "consider looking into." State what applies and what to do.',
    '- NEVER omit the TDIU ASSESSMENT block — required in every response.',
    '- ALWAYS cite 38 CFR 4.16(a) for schedular claims and 4.16(b) for extraschedular.',
    '- ALWAYS include VA Form 21-8940 when the path is file-tdiu or gather-evidence-first.',
    '- IF SSDI is mentioned: ALWAYS instruct veteran to include SSA records with the VA claim.',
    '- IF employment situation is sheltered or marginal: ALWAYS document — it does NOT disqualify.',
    '- IF denial is mentioned: Route to appeal-or-review. State the three AMA appellate lanes.',
    '- IF combined rating is below threshold: Route to increase-then-tdiu. Name the specific',
    '  condition that needs the increase and what evidence to gather for that increase.',
    '- End every response with: Veterans Crisis Line — 988, Press 1.',
    '',
    '[OPTIONS: Check my TDIU eligibility | File VA Form 21-8940 | Gather evidence for TDIU | I was denied TDIU | Extraschedular TDIU | My employer fired me due to my condition | I work part-time / low income | Rating increase before TDIU]'
  ].join('\n');


  /* ────────────────────────────────────────────────────────
     Helpers
     ──────────────────────────────────────────────────────── */

  /**
   * Case-insensitive substring match against a keyword list.
   * Returns true on first match.
   */
  function _hasKeyword(target, keywords) {
    if (!target) return false;
    var t = target.toLowerCase();
    for (var i = 0; i < keywords.length; i++) {
      if (t.indexOf(keywords[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }

  /**
   * Combines userInput + relevant TDIU profile fields into
   * one lowercase corpus for keyword matching.
   */
  function _buildCorpus(profile, userInput) {
    var wh = profile.workHistory;
    var whStr = Array.isArray(wh) ? wh.join(' ') : (typeof wh === 'string' ? wh : '');
    return [
      userInput || '',
      (profile.conditions || []).join(' '),
      profile.employmentStatus || '',
      (profile.income !== null && profile.income !== undefined) ? String(profile.income) : '',
      profile.education || '',
      whStr
    ].join(' ').toLowerCase();
  }

  /**
   * Safe accessor for vaRating — returns -1 when absent.
   */
  function _getRating(profile) {
    return (profile.vaRating !== null && profile.vaRating !== undefined)
      ? profile.vaRating : -1;
  }

  /**
   * Parse all integer percentages from corpus text.
   * Matches patterns: "50%", "50 percent", "50percent".
   * Returns array of integers in [0, 100].
   */
  function _extractRatingNumbers(corpus) {
    var nums = [];
    var re = /(\d{1,3})\s*(?:%|percent)/g;
    var m;
    while ((m = re.exec(corpus)) !== null) {
      var n = parseInt(m[1], 10);
      if (n >= 0 && n <= 100) { nums.push(n); }
    }
    return nums;
  }

  /**
   * Returns the highest individual condition rating found in corpus,
   * excluding the combined vaRating to avoid conflating combined
   * with single-condition values.
   * Returns -1 if no individual ratings can be identified.
   */
  function _getHighestIndividualRating(corpus, combined) {
    var nums = _extractRatingNumbers(corpus);
    var highest = -1;
    for (var i = 0; i < nums.length; i++) {
      if (nums[i] !== combined && nums[i] > highest) {
        highest = nums[i];
      }
    }
    return highest;
  }


  /* ────────────────────────────────────────────────────────
     _determineThresholdStatus
     Returns: meets-schedular-threshold | possible-extraschedular
              | threshold-unclear | does-not-meet-threshold
     Applies 38 CFR 4.16(a) schedular rules.
     ──────────────────────────────────────────────────────── */
  function _determineThresholdStatus(profile, userInput) {
    var corpus   = _buildCorpus(profile, userInput);
    var combined = _getRating(profile);

    // ── Explicit extraschedular language ──────────────────
    if (_hasKeyword(corpus, [
      'extraschedular', 'extra-schedular', 'extra schedular',
      '4.16(b)', '4.16b', 'director of compensation',
      'referral to director', 'referred to director'
    ])) { return 'possible-extraschedular'; }

    // ── Numeric evaluation when combined rating is known ──
    if (combined >= 0) {
      var highestIndividual = _getHighestIndividualRating(corpus, combined);

      // Only one condition on record — combined IS the single rating
      if (combined >= 60 && profile.conditions && profile.conditions.length === 1) {
        return 'meets-schedular-threshold';
      }

      // Explicit individual rating at 60%+ found in corpus
      if (highestIndividual >= 60) { return 'meets-schedular-threshold'; }

      // Combined 70%+ AND individual 40%+ confirmed
      if (combined >= 70 && highestIndividual >= 40) { return 'meets-schedular-threshold'; }

      // Combined 70%+ but individual breakdown not extractable from corpus
      if (combined >= 70) { return 'threshold-unclear'; }

      // Combined 60-69% — single at 60% possible but not confirmed
      if (combined >= 60) { return 'threshold-unclear'; }

      // Combined 50-59% — does not meet schedular threshold
      // Extraschedular may still apply if work impact is severe
      if (combined >= 50) { return 'does-not-meet-threshold'; }

      // Below 50% combined — does not meet schedular threshold
      if (combined >= 0) { return 'does-not-meet-threshold'; }
    }

    // ── Keyword-only signals when no structured rating data ──

    // Single-condition 60%+ signals
    if (_hasKeyword(corpus, [
      '60 percent for my', '60% for my', '60 percent for ptsd',
      '60% for ptsd', '60 percent for back', '60% for back',
      '70 percent for my', '70% for my', '80 percent for my',
      '80% for my', '90 percent for my', '90% for my',
      '100 percent for my', '100% for my',
      'single condition at 60', 'one condition at 60',
      'one 60 percent', 'a 60 percent rating', 'have a 60 percent',
      'one 70 percent', 'a 70 percent rating', 'one 80 percent',
      'a 80 percent rating', 'one 90 percent', 'one 100 percent',
      '60 percent rating', '70 percent rating', '80 percent rating',
      '90 percent rating', '100 percent rating',
      'rated 60 percent for', 'rated at 60 percent',
      'rated at 70 percent for', 'rated at 80 percent for',
      'rated at 90 percent for'
    ])) { return 'meets-schedular-threshold'; }

    // Combined 70%+ explicit language
    if (_hasKeyword(corpus, [
      '70 percent combined', '70% combined', 'combined rating of 70',
      'combined rating is 70', 'combined is 70', 'rating is 70',
      '80 percent combined', '80% combined', 'combined rating of 80',
      'combined rating is 80', 'combined is 80',
      '90 percent combined', '90% combined', 'combined rating of 90',
      'combined rating is 90', 'combined is 90',
      '100 percent combined', 'combined rating of 100',
      'combined rating is 100', 'combined is 100',
      'my combined is 70', 'my combined is 80', 'my combined is 90'
    ])) {
      // Look for at least one individual at 40%+
      if (_hasKeyword(corpus, [
        '40 percent for', '40% for', '40 percent disability',
        '50 percent for', '50% for', '50 percent disability',
        '60 percent for', '60% for', 'one at 40', 'one at 50', 'one at 60',
        'one condition is 40', 'one condition is 50', 'one condition is 60',
        'one is rated 40', 'one is rated 50', 'one is rated 60',
        'condition is 40', 'condition is 50', 'condition is 60'
      ])) { return 'meets-schedular-threshold'; }
      return 'threshold-unclear';
    }

    // Low rating signals — clear disqualification
    if (_hasKeyword(corpus, [
      '10 percent', '10%', '20 percent', '20%',
      '30 percent', '30%', '0 percent', '0%'
    ])) {
      // Only flag does-not-meet if these appear to be the veteran's total/only rating
      if (!_hasKeyword(corpus, ['combined', 'total rating', 'overall'])) {
        return 'does-not-meet-threshold';
      }
    }

    // TDIU topic present without sufficient rating data
    return 'threshold-unclear';
  }


  /* ────────────────────────────────────────────────────────
     _determineWorkImpactLevel
     Returns: severe | moderate | unclear
     ──────────────────────────────────────────────────────── */
  function _determineWorkImpactLevel(profile, userInput) {
    var corpus = _buildCorpus(profile, userInput);

    // ── Severe — cannot maintain substantially gainful employment ──
    if (_hasKeyword(corpus, [
      'can\'t work', 'cannot work', 'unable to work',
      'can\'t hold a job', 'cannot hold a job',
      'can\'t maintain employment', 'cannot maintain employment',
      'can\'t keep a job', 'cannot keep a job',
      'fired because of my', 'fired due to my', 'lost my job because',
      'let go because of', 'had to leave work because',
      'forced to stop working', 'had to quit because of my',
      'no employer will hire me', 'employers won\'t hire me',
      'couldn\'t perform my job', 'could not perform my job',
      'totally disabled', 'completely unable',
      'bedridden', 'homebound', 'housebound',
      'panic attacks prevent', 'ptsd prevents me from',
      'pain prevents me from', 'can\'t concentrate',
      'cannot concentrate', 'constant flare-ups',
      'miss work constantly', 'constant absences',
      'can\'t attend work regularly', 'unable to attend work',
      'can\'t complete a work day', 'cannot complete a workday',
      'haven\'t worked in years', 'not worked in years',
      'given up looking for work', 'stopped trying to find work',
      'no one will hire', 'failed every job', 'can\'t sustain employment',
      'had to stop working', 'had to quit work', 'had to leave my job',
      'had to stop my job', 'made me stop working',
      'ssdi', 'social security disability', 'social security approved',
      'approved for disability by social security'
    ])) { return 'severe'; }

    // ── Moderate — significant but not total work limitation ──
    if (_hasKeyword(corpus, [
      'reduced hours', 'part time because', 'part-time because',
      'cut back hours', 'limited to part time', 'can only work part',
      'can\'t work full time', 'cannot work full time',
      'need accommodations', 'ada accommodation', 'modified duty',
      'light duty', 'light-duty', 'limited duty',
      'affecting my performance', 'hard to keep up',
      'struggle to keep up', 'missing some work',
      'frequent absences', 'occasional flare',
      'have a hard time working', 'makes it hard to work',
      'impacts my ability to work', 'affects my work',
      'reduced capacity', 'work at reduced pace',
      'can only do light work', 'sedentary only'
    ])) { return 'moderate'; }

    // ── Employment status as proxy for severity ────────────
    var empStatus = (profile.employmentStatus || '').toLowerCase();
    if (_hasKeyword(empStatus, ['unemployed', 'not working', 'unable to work', 'disabled'])) {
      return 'severe';
    }
    if (_hasKeyword(empStatus, ['part time', 'part-time', 'reduced', 'limited'])) {
      return 'moderate';
    }

    return 'unclear';
  }


  /* ────────────────────────────────────────────────────────
     _determineEmploymentSituation
     Returns: not-working | marginal-employment |
              sheltered-employment | working-full-time | unclear
     ──────────────────────────────────────────────────────── */
  function _determineEmploymentSituation(profile, userInput) {
    var corpus = _buildCorpus(profile, userInput);

    // ── Sheltered — protected work, not competitive ────────
    if (_hasKeyword(corpus, [
      'family business', 'work for my family', 'family keeps me on',
      'work for my spouse', 'work for my parent', 'work for my sibling',
      'work for my relative', 'family employs me',
      'sheltered employment', 'sheltered work', 'protected work',
      'they keep me because', 'only kept me on', 'wouldn\'t survive',
      'they make exceptions for me', 'not held to the same standard',
      'specially accommodated', 'can\'t get this job anywhere else',
      'extraordinary accommodation', 'subsidized employment',
      'vocational rehabilitation placement'
    ])) { return 'sheltered-employment'; }

    // ── Not working ────────────────────────────────────────
    if (_hasKeyword(corpus, [
      'not working', 'not currently working', 'not employed',
      'unemployed', 'haven\'t worked', 'no job',
      'out of work', 'stopped working', 'quit working',
      'left the workforce', 'can\'t find work', 'no income',
      'medically retired', 'medically separated',
      'last worked', 'haven\'t worked since'
    ])) { return 'not-working'; }

    // ── Marginal — working but below poverty threshold ─────
    // Check income numerically first (U.S. poverty threshold ~$14,580/yr single)
    var income = profile.income;
    if (typeof income === 'number' && income > 0 && income < 14580) {
      return 'marginal-employment';
    }
    if (typeof income === 'string') {
      var incomeNum = parseInt(income.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(incomeNum) && incomeNum > 0 && incomeNum < 14580) {
        return 'marginal-employment';
      }
    }

    if (_hasKeyword(corpus, [
      'part time', 'part-time', 'working part time', 'only part time',
      'a few hours a week', 'few hours per week', 'minimal income',
      'very low income', 'below poverty', 'not much income',
      'barely make anything', 'small amount of money',
      'earn very little', 'a few hundred a month',
      'under the poverty line', 'under poverty level'
    ])) { return 'marginal-employment'; }

    // ── Working full-time ──────────────────────────────────
    if (_hasKeyword(corpus, [
      'working full time', 'full-time', 'full time job',
      'full time employment', '40 hours a week', '40 hours per week',
      'working 40', 'my current job', 'still employed',
      'still working', 'working regularly', 'making good money',
      'my employer', 'at my job', 'my workplace'
    ])) { return 'working-full-time'; }

    // ── Employment status profile field ───────────────────
    var empStatus = (profile.employmentStatus || '').toLowerCase();
    if (_hasKeyword(empStatus, ['unemployed', 'not working', 'no job'])) return 'not-working';
    if (_hasKeyword(empStatus, ['part time', 'part-time'])) return 'marginal-employment';
    if (_hasKeyword(empStatus, ['full time', 'full-time', 'employed'])) return 'working-full-time';

    return 'unclear';
  }


  /* ────────────────────────────────────────────────────────
     _determineRecommendedPath
     Returns: file-tdiu | gather-evidence-first |
              increase-then-tdiu | appeal-or-review | needs-intake
     ──────────────────────────────────────────────────────── */
  function _determineRecommendedPath(profile, userInput, thresholdStatus, workImpactLevel, employmentSituation) {
    var corpus = _buildCorpus(profile, userInput);

    // ── Appeal / review — denial language takes priority ──
    if (_hasKeyword(corpus, [
      'denied', 'denial', 'was denied', 'got denied',
      'tdiu denied', 'unemployability denied',
      'they denied my', 'va denied', 'claim denied',
      'rating denied', 'my claim was denied',
      'appeal', 'board of veterans', 'bva', 'notice of disagreement',
      'supplemental claim', 'higher level review',
      'higher-level review', 'hlr', 'ama appeal'
    ])) { return 'appeal-or-review'; }

    // ── Needs intake — threshold status unknown ────────────
    if (thresholdStatus === 'threshold-unclear' && workImpactLevel === 'unclear') {
      return 'needs-intake';
    }

    // ── File TDIU now ──────────────────────────────────────
    // Threshold met + severe impact + not in competitive employment
    if (thresholdStatus === 'meets-schedular-threshold' &&
        workImpactLevel === 'severe' &&
        (employmentSituation === 'not-working'       ||
         employmentSituation === 'marginal-employment' ||
         employmentSituation === 'sheltered-employment' ||
         employmentSituation === 'unclear')) {
      return 'file-tdiu';
    }

    // ── Gather evidence first ──────────────────────────────
    // Threshold met but work impact is unclear or moderate
    if (thresholdStatus === 'meets-schedular-threshold') {
      if (workImpactLevel === 'unclear' || workImpactLevel === 'moderate') {
        return 'gather-evidence-first';
      }
    }

    // Threshold unclear but work impact is severe — build rating clarity + evidence together
    if (thresholdStatus === 'threshold-unclear' && workImpactLevel === 'severe') {
      return 'gather-evidence-first';
    }

    // ── Extraschedular path ────────────────────────────────
    // Does not meet schedular but work impact is severe
    if ((thresholdStatus === 'possible-extraschedular' || thresholdStatus === 'does-not-meet-threshold') &&
        workImpactLevel === 'severe') {
      // If there is some rating to work with, try increase-then-TDIU first unless extraschedular explicitly raised
      if (thresholdStatus === 'possible-extraschedular') {
        return 'increase-then-tdiu'; // extraschedular referral is part of this path
      }
    }

    // ── Increase first ─────────────────────────────────────
    // Does not meet threshold — primary action is rating increase
    if (thresholdStatus === 'does-not-meet-threshold') {
      return 'increase-then-tdiu';
    }

    // ── Working full-time — not currently eligible ─────────
    if (employmentSituation === 'working-full-time') {
      return 'gather-evidence-first'; // may need to monitor and file when employment ends
    }

    return 'needs-intake';
  }


  /* ────────────────────────────────────────────────────────
     _buildReasoning
     Returns 1-3 sentences connecting profile and input
     signals to threshold status and recommended path.
     ──────────────────────────────────────────────────────── */
  function _buildReasoning(thresholdStatus, workImpactLevel, employmentSituation, recommendedPath, profile) {
    var parts  = [];
    var rating = _getRating(profile);
    var conds  = (profile.conditions || []).join(', ');

    // ── Threshold reasoning ───────────────────────────────
    if (thresholdStatus === 'meets-schedular-threshold') {
      var rStr = rating >= 0 ? ' at a combined ' + rating + '%' : '';
      parts.push(
        'The veteran\'s rating structure' + rStr +
        (conds ? ' with service-connected conditions (' + conds + ')' : '') +
        ' satisfies the 38 CFR 4.16(a) schedular threshold for TDIU.' +
        ' The focus now is on demonstrating that these conditions prevent substantially gainful employment.'
      );
    } else if (thresholdStatus === 'possible-extraschedular') {
      parts.push(
        'The veteran does not clearly meet the 38 CFR 4.16(a) schedular threshold' +
        (rating >= 0 ? ' at a combined ' + rating + '%' : '') +
        ', but the severity of work impact described may warrant referral to the Director' +
        ' of Compensation under 38 CFR 4.16(b). Vocational evidence is the critical differentiator' +
        ' in extraschedular cases.'
      );
    } else if (thresholdStatus === 'threshold-unclear') {
      parts.push(
        'The current rating structure' +
        (rating >= 0 ? ' (' + rating + '% combined)' : '') +
        ' cannot be confirmed as meeting the 38 CFR 4.16(a) schedular threshold without' +
        ' individual condition ratings. Obtaining the complete rating breakdown — either' +
        ' from the rating decision letter or the C-File — is the first priority.'
      );
    } else if (thresholdStatus === 'does-not-meet-threshold') {
      var tgt = rating >= 0 && rating < 70 ? 'The combined rating of ' + rating + '% is below the 70% schedular threshold, ' : '';
      parts.push(
        tgt +
        'and no single condition at 60%+ is confirmed. A rating increase for the' +
        ' highest-rated service-connected condition is the correct first move before TDIU filing.'
      );
    }

    // ── Work impact reasoning ─────────────────────────────
    if (workImpactLevel === 'severe') {
      parts.push(
        'The described inability to maintain substantially gainful employment due to service-connected' +
        ' conditions is the central TDIU standard — this is the claim\'s strongest element.'
      );
    } else if (workImpactLevel === 'moderate') {
      parts.push(
        'Current work limitations are significant but additional medical documentation' +
        ' is needed to clearly establish that substantially gainful employment cannot be maintained.'
      );
    }

    // ── Employment situation note ─────────────────────────
    if (employmentSituation === 'marginal-employment') {
      parts.push(
        'Employment below the poverty threshold is classified as marginal employment under 38 CFR 4.16' +
        ' and does NOT disqualify TDIU — this fact must be explicitly documented in the claim.'
      );
    } else if (employmentSituation === 'sheltered-employment') {
      parts.push(
        'Employment in a family business or protected setting constitutes sheltered employment,' +
        ' not substantially gainful employment under VA regulations.' +
        ' The accommodations making this work possible must be documented.'
      );
    } else if (employmentSituation === 'working-full-time') {
      parts.push(
        'Current substantially gainful employment prevents an active TDIU claim.' +
        ' If service-connected conditions are deteriorating and employment is at risk,' +
        ' begin building the evidence record now.'
      );
    }

    return parts.join(' ');
  }


  /* ────────────────────────────────────────────────────────
     _buildNextActions
     Returns ordered, exact-action strings with form numbers,
     URLs, and specific program names.
     ──────────────────────────────────────────────────────── */
  function _buildNextActions(thresholdStatus, workImpactLevel, employmentSituation, recommendedPath, profile, userInput) {
    var actions = [];
    var rating  = _getRating(profile);
    var corpus  = _buildCorpus(profile, userInput || '');
    var hasSSDI = _hasKeyword(corpus, ['ssdi', 'social security disability', 'approved for disability by social security', 'social security approved']);

    // ════════════════════════════════════════════════════
    //  FILE-TDIU
    // ════════════════════════════════════════════════════

    if (recommendedPath === 'file-tdiu') {

      actions.push(
        'STEP 1 — File VA Form 21-8940 (Veteran\'s Application for Increased Compensation' +
        ' Based on Unemployability): Download at va.gov/find-forms/about-form-21-8940/ ' +
        'or request from any VA Regional Office. Complete all sections including: ' +
        'every service-connected condition affecting employment, last date of substantially ' +
        'gainful employment, name of last employer, reason employment ended, full work history ' +
        'for the past five years, and education. File online at va.gov, by mail, or in person ' +
        'at your VA Regional Office. File an intent to file first to protect your effective date: ' +
        'va.gov/decision-reviews/filing-deadline/request-intent-to-file-a-claim/'
      );

      actions.push(
        'STEP 2 — Request employer statements via VA Form 21-4192: ' +
        'Download at va.gov/find-forms/about-form-21-4192/ ' +
        'Ask your most recent employer (and any employer within the last five years) to complete this form. ' +
        'The form asks the employer to describe your attendance, job performance, any accommodations made, ' +
        'and the reason your employment ended. A completed 21-4192 showing condition-related termination ' +
        'or inability to meet work demands is strong direct evidence. Do not skip this step — ' +
        'claims without employer corroboration are more likely to be denied or underdeveloped.'
      );

      actions.push(
        'STEP 3 — Build your medical evidence package: ' +
        'Obtain medical records documenting how your service-connected condition(s) prevent ' +
        'sustained employment. Most useful: a physician\'s statement or nexus letter that explicitly ' +
        'states the veteran cannot maintain substantially gainful employment due to [specific condition]. ' +
        'Generic treatment notes are insufficient — the medical evidence must connect the condition ' +
        'to unemployability. Request records from all treating providers. ' +
        'If you have mental health conditions, include psychiatric records detailing cognitive and ' +
        'functional limitations in a work context.'
      );

      if (hasSSDI) {
        actions.push(
          'SSDI RECORDS — INCLUDE WITH CLAIM: You have received Social Security disability benefits. ' +
          'The VA is required to give "significant weight" to SSA\'s disability determination under' +
          ' DeLuca v. Brown, 8 Vet. App. 202 (1995). Include your SSA award letter, SSA decision notice,' +
          ' and any vocational or medical records from the SSA file. ' +
          'Request your complete SSA file at ssa.gov/myaccount/ — this evidence directly supports TDIU.'
        );
      }

      if (employmentSituation === 'marginal-employment') {
        actions.push(
          'MARGINAL EMPLOYMENT DOCUMENTATION: Your current income is below the poverty threshold,' +
          ' which classifies your work as marginal employment under 38 CFR 4.16. ' +
          'Document this clearly on your 21-8940. Include W-2s, tax returns, or Social Security ' +
          'earnings records showing income. If you receive SSA earnings statements, include them. ' +
          'State explicitly in your claim that you are employed only in a marginal capacity and ' +
          'that competitive employment is not possible due to service-connected conditions.'
        );
      }

      if (employmentSituation === 'sheltered-employment') {
        actions.push(
          'SHELTERED EMPLOYMENT DOCUMENTATION: Employment in a family business or accommodated setting ' +
          'is sheltered employment — not substantially gainful employment under VA regulations. ' +
          'Document: (1) the extraordinary accommodations your employer makes, (2) that these ' +
          'accommodations would not be available in competitive employment, and (3) a statement from ' +
          'the employer describing why you are retained despite limitations. ' +
          'A family member\'s written statement explaining the employment arrangement is valid lay evidence ' +
          'under 38 CFR 3.303. Include this as a lay statement on VA Form 21-10210 or as a ' +
          'signed personal statement attached to your 21-8940.'
        );
      }

      actions.push(
        'GET FREE CLAIMS ASSISTANCE: Do not file without VSO or attorney review. ' +
        'Disabled American Veterans (DAV) — dav.org — provides free TDIU claims representation nationwide. ' +
        'VFW (vfw.org) and American Legion (legion.org) also offer free claims service officers. ' +
        'A VSO will review your 21-8940, identify evidence gaps, and submit the package correctly. ' +
        'Alternatively, an accredited VA attorney works on contingency (fee comes from back pay only) ' +
        'and takes TDIU cases when the evidence is strong: va.gov/ogc/apps/accreditation/index.asp'
      );

      return actions;
    }

    // ════════════════════════════════════════════════════
    //  GATHER-EVIDENCE-FIRST
    // ════════════════════════════════════════════════════

    if (recommendedPath === 'gather-evidence-first') {

      actions.push(
        'STEP 1 — File an intent to file NOW to protect your effective date: ' +
        'va.gov/decision-reviews/filing-deadline/request-intent-to-file-a-claim/ ' +
        'An intent to file costs nothing, takes five minutes, and locks in the date from which ' +
        'back pay is calculated once your claim is filed. You have one year from this date to file ' +
        'the actual 21-8940. Do this today, then gather evidence.'
      );

      if (thresholdStatus === 'threshold-unclear') {
        actions.push(
          'STEP 2 — Obtain your complete rating breakdown: ' +
          'Request your C-File (Claims File) and rating decision letter from the VA. ' +
          'Your C-File contains every rating decision and the individual condition percentages. ' +
          'Request via VA Form 20-10206 (Freedom of Information Act request): ' +
          'va.gov/find-forms/about-form-20-10206/ ' +
          'A VSO (DAV, VFW, or American Legion) can pull your ratings on file within days. ' +
          'You need to confirm: (1) your combined rating, (2) each condition\'s individual rating, ' +
          '(3) whether one condition is at 60%+ or combined is 70%+ with one at 40%+. ' +
          'This determines whether you file schedular TDIU (21-8940) or need to increase first.'
        );
      }

      actions.push(
        (thresholdStatus === 'threshold-unclear' ? 'STEP 3' : 'STEP 2') +
        ' — Build the medical evidence that establishes unemployability: ' +
        'Work with your treating physicians to obtain a letter specifically addressing your ability ' +
        'to maintain substantially gainful employment. The letter must state: ' +
        '(1) the specific service-connected condition(s), ' +
        '(2) the functional limitations caused by those conditions, and ' +
        '(3) a direct opinion that the veteran cannot maintain substantially gainful employment ' +
        'due to those conditions. Vague treatment notes are insufficient for TDIU approval. ' +
        'If you see a mental health provider, request a functional capacity assessment. ' +
        'If you have a physical condition, request a physical functional capacity evaluation.'
      );

      actions.push(
        'STEP 4 — Obtain an independent vocational expert (IVE) opinion if evidence is borderline: ' +
        'A vocational expert evaluates your conditions, work history, education, and the labor market ' +
        'to provide a formal opinion on whether you can maintain substantially gainful employment. ' +
        'IVE opinions are the most persuasive TDIU evidence in contested cases. ' +
        'Available through accredited VA attorneys: va.gov/ogc/apps/accreditation/index.asp ' +
        'Costs $0 upfront when working with a contingency-fee attorney.'
      );

      actions.push(
        'ONCE YOUR EVIDENCE IS READY — File VA Form 21-8940: ' +
        'va.gov/find-forms/about-form-21-8940/ ' +
        'Submit with: 21-8940, medical evidence, employer statement (21-4192), ' +
        'lay statements (21-10210), and SSA records if applicable. ' +
        'File the complete package — do not file piecemeal. ' +
        'A VSO or accredited VA attorney should review before submission.'
      );

      return actions;
    }

    // ════════════════════════════════════════════════════
    //  INCREASE-THEN-TDIU
    // ════════════════════════════════════════════════════

    if (recommendedPath === 'increase-then-tdiu') {

      var targetRating = 'your highest-rated service-connected condition';
      var threshold60  = rating >= 0 && rating < 60;
      var threshold70  = rating >= 0 && rating >= 60 && rating < 70;

      actions.push(
        'STEP 1 — File an intent to file NOW: ' +
        'va.gov/decision-reviews/filing-deadline/request-intent-to-file-a-claim/ ' +
        'Protects your future effective date at no cost. File immediately.'
      );

      if (threshold60) {
        actions.push(
          'STEP 2 — Target a rating increase to reach the schedular TDIU threshold: ' +
          'Your combined rating of ' + rating + '% is below the 70% threshold for combined schedular TDIU.' +
          ' The most efficient path: identify the single service-connected condition closest to 60%.' +
          ' If you can get any one condition to 60%, you meet the threshold regardless of combined rating.' +
          ' If a single condition at 60% is not achievable, work toward combined 70% with one condition at 40%+.' +
          ' File for an increase using VA Form 21-526EZ: va.gov/find-forms/about-form-21-526ez/' +
          ' Evidence needed: medical records documenting worsening since the last rating decision,' +
          ' updated nexus letter connecting current severity to service connection.'
        );
      } else if (threshold70) {
        actions.push(
          'STEP 2 — You are at ' + rating + '% combined. To meet the combined schedular threshold' +
          ' (70% combined with one condition at 40%+), confirm your individual condition ratings.' +
          ' If one condition is at 40%+ but combined is below 70%, a small increase in a secondary' +
          ' condition may push combined to 70% and unlock schedular TDIU.' +
          ' File for an increase using VA Form 21-526EZ: va.gov/find-forms/about-form-21-526ez/' +
          ' Gather updated medical records showing current severity.'
        );
      } else {
        actions.push(
          'STEP 2 — File for a rating increase for ' + targetRating + ': ' +
          'VA Form 21-526EZ (supplemental claim path if new evidence, or direct review): ' +
          'va.gov/find-forms/about-form-21-526ez/ ' +
          'You need either a single condition at 60%+ or combined 70%+ with one at 40%+.' +
          ' Gather updated medical records showing the condition has worsened since the last rating decision.' +
          ' A nexus letter from your treating physician or an independent medical examination (IME)' +
          ' is the most effective evidence for a rating increase.'
        );
      }

      actions.push(
        'STEP 3 — File VA Form 21-8940 the moment the threshold is crossed: ' +
        'Do not wait for the VA to suggest TDIU after your increase is granted.' +
        ' File 21-8940 simultaneously with your increase claim or within days of the increase decision.' +
        ' The effective date for TDIU traces back to your intent to file date (Step 1) — ' +
        'this is why filing intent to file now is critical.'
      );

      if (thresholdStatus === 'possible-extraschedular' || workImpactLevel === 'severe') {
        actions.push(
          'EXTRASCHEDULAR CONSIDERATION — PARALLEL PATH: ' +
          'If the rating increase is denied or delayed and your inability to work is severe,' +
          ' the VA Regional Office is required under 38 CFR 4.16(b) to refer your case to the' +
          ' Director of Compensation for extraschedular TDIU when you do not meet the schedular threshold.' +
          ' Assert this right explicitly in your claim: state that if the RO finds the schedular' +
          ' threshold is not met, you request referral to the Director of Compensation per 38 CFR 4.16(b).' +
          ' An independent vocational expert opinion strengthens this path significantly.'
        );
      }

      actions.push(
        'FREE ASSISTANCE: Get a VSO to review your current rating structure and identify the' +
        ' fastest path to TDIU eligibility. DAV — dav.org | VFW — vfw.org | American Legion — legion.org.' +
        ' VSOs are free and can pull your C-File to confirm individual condition ratings' +
        ' and map the exact increase needed.'
      );

      return actions;
    }

    // ════════════════════════════════════════════════════
    //  APPEAL-OR-REVIEW
    // ════════════════════════════════════════════════════

    if (recommendedPath === 'appeal-or-review') {

      actions.push(
        'STEP 1 — Identify the denial reason before choosing an appellate lane: ' +
        'Read the VA decision letter carefully. The denial must state the reason TDIU was denied:' +
        ' (a) rating threshold not met, (b) not found unable to work, (c) found to be working,' +
        ' or (d) evidence insufficient. The reason determines the correct response. ' +
        'Request your C-File if you do not have all rating decision letters: ' +
        'VA Form 20-10206 at va.gov/find-forms/about-form-20-10206/'
      );

      actions.push(
        'STEP 2 — Select the correct AMA (Appeals Modernization Act) appellate lane:' +
        ' (1) Supplemental Claim Lane: va.gov/decision-reviews/supplemental-claim/' +
        '   — Use if you have NEW AND RELEVANT evidence not previously considered.' +
        '   New evidence = any medical record, employer statement, vocational report, or SSA record' +
        '   not in the file at the time of denial. File VA Form 20-0995.' +
        ' (2) Higher-Level Review Lane: va.gov/decision-reviews/higher-level-review/' +
        '   — Use if no new evidence exists but you believe the adjudicator made a procedural error,' +
        '   missed evidence already in the file, or applied the wrong legal standard.' +
        '   Request an informal conference to explain the error. File VA Form 20-0996.' +
        ' (3) Board of Veterans Appeals: va.gov/decision-reviews/board-appeal/' +
        '   — Three lanes at the BVA: Direct Review (no new evidence, no hearing),' +
        '   Evidence Submission (new evidence only), Hearing Request (full hearing with judge).' +
        '   File VA Form 10182. BVA wait times: 12-24+ months.'
      );

      actions.push(
        'STEP 3 — Build the evidence that addresses the specific denial reason: ' +
        'If denied for work impact: obtain a nexus letter directly addressing unemployability,' +
        ' vocational expert opinion, and employer statements (21-4192). ' +
        'If denied for threshold: file for rating increase first (see increase-then-tdiu path). ' +
        'If denied for current employment: document marginal or sheltered employment status' +
        ' with income records and employer statements. ' +
        'If SSDI was not included: add SSA award letter and records — VA must give it significant weight.'
      );

      actions.push(
        'ACCREDITED VA ATTORNEY — STRONGLY RECOMMENDED for denied TDIU: ' +
        'An accredited VA attorney works on contingency — zero upfront cost, fee is a percentage of' +
        ' retroactive back pay only. Attorneys can request hearings, submit vocational experts,' +
        ' and escalate to the Court of Appeals for Veterans Claims (CAVC) if needed. ' +
        'Find accredited attorneys: va.gov/ogc/apps/accreditation/index.asp or vetsfirst.org'
      );

      return actions;
    }

    // ════════════════════════════════════════════════════
    //  NEEDS-INTAKE
    // ════════════════════════════════════════════════════

    actions.push(
      'To determine the correct TDIU path, more specific information is needed. Please confirm:' +
      ' (1) Your combined VA disability rating (the percentage on your most recent rating decision letter).' +
      ' (2) Your individual condition ratings — for example, "50% for PTSD, 30% for back."' +
      '     This confirms whether the schedular threshold (single 60% or combined 70%+ with one at 40%+) is met.' +
      ' (3) Your current employment situation: Are you working? If so, how many hours and approximately' +
      '     what is your annual income? If not working, when did you last work and why did employment end?'
    );

    actions.push(
      'While gathering that information, take this action today: ' +
      'File an intent to file at va.gov/decision-reviews/filing-deadline/request-intent-to-file-a-claim/ ' +
      'This costs nothing and takes five minutes. It locks in a future effective date for back pay' +
      ' regardless of when you formally file. This step protects you with no downside.'
    );

    actions.push(
      'Contact a VSO for a free TDIU eligibility review: ' +
      'Disabled American Veterans (DAV) — dav.org — will pull your current ratings from the VA system,' +
      ' review your work history, and tell you whether you meet the schedular threshold or need a' +
      ' rating increase first. This is free, comprehensive, and the fastest way to get a clear answer.'
    );

    return actions;
  }


  /* ────────────────────────────────────────────────────────
     _buildContextBlock
     Injects the computed TDIU assessment into the system
     prompt as a structured context block.
     ──────────────────────────────────────────────────────── */
  function _buildContextBlock(result, profile) {
    var lines = [
      '## TDIU ASSESSMENT (system-computed — use these values verbatim in your response)'
    ];

    lines.push('Threshold status:      ' + result.thresholdStatus);
    lines.push('Work impact level:     ' + result.workImpactLevel);
    lines.push('Employment situation:  ' + result.employmentSituation);
    lines.push('Recommended path:      ' + result.recommendedPath);
    lines.push('Reasoning:             ' + result.reasoning);

    if (profile.vaRating !== null && profile.vaRating !== undefined) {
      lines.push('VA rating (combined):  ' + profile.vaRating + '%');
    }
    if (profile.conditions && profile.conditions.length) {
      lines.push('Conditions on file:    ' + profile.conditions.join(', '));
    }
    if (profile.employmentStatus) {
      lines.push('Employment status:     ' + profile.employmentStatus);
    }
    if (profile.income !== null && profile.income !== undefined) {
      lines.push('Income:                ' + profile.income);
    }
    if (profile.education) {
      lines.push('Education:             ' + profile.education);
    }
    if (profile.workHistory) {
      var wh = profile.workHistory;
      var whStr = Array.isArray(wh) ? wh.join('; ') : wh;
      lines.push('Work history:          ' + whStr);
    }

    lines.push('');
    lines.push('INSTRUCTION: Open your response with the TDIU ASSESSMENT block using the computed');
    lines.push('values above exactly as written. Then explain WHY in 1-2 sentences citing rating numbers');
    lines.push('and regulatory references when known. Then list exact next steps.');
    lines.push('CRITICAL: Always include VA Form 21-8940 when path is file-tdiu or gather-evidence-first.');
    lines.push('CRITICAL: Always cite 38 CFR 4.16(a) for schedular, 4.16(b) for extraschedular referrals.');
    lines.push('CRITICAL: If SSDI is present in profile or user input, include SSA records in next steps.');
    lines.push('CRITICAL: If marginal/sheltered employment — document it explicitly; it does NOT disqualify.');
    lines.push('Do NOT use generic phrasing. Every action must include a form number, URL, or program name.');
    lines.push('End every response with: Veterans Crisis Line — 988, Press 1.');

    return lines.join('\n');
  }


  /* ────────────────────────────────────────────────────────
     Skill module
     ──────────────────────────────────────────────────────── */
  var TDIU = {

    id: 'tdiu',
    name: 'TDIU',
    description: 'Decision engine for Total Disability based on Individual Unemployability. Screens schedular threshold eligibility under 38 CFR 4.16(a) (single condition 60%+ or combined 70%+ with one at 40%+), flags extraschedular referral paths under 38 CFR 4.16(b), assesses work impact level, evaluates marginal and sheltered employment, and routes to file-tdiu, gather-evidence-first, increase-then-tdiu, appeal-or-review, or needs-intake with exact form numbers and next steps.',

    triggers: [
      // TDIU direct terms
      'tdiu', 'individual unemployability', 'total disability',
      'unemployability', 'iu rating', 'total disability rating',
      '4.16', 'cfr 4.16', 'schedular', 'extraschedular',
      // Work impact language
      'can\'t work', 'cannot work', 'unable to work',
      'can\'t hold a job', 'can\'t maintain employment',
      'too disabled to work', 'fired due to disability',
      'fired because of my condition', 'lost my job because of',
      'can\'t sustain employment', 'substantially gainful employment',
      // Forms
      '21-8940', '8940', '21-4192', '4192',
      // Income and employment situation
      'marginal employment', 'sheltered employment',
      'working part time', 'working below poverty',
      'below poverty line', 'family business employment',
      // Appeal language
      'tdiu denied', 'denied unemployability', 'unemployability denied',
      // Related benefits
      '100 percent equivalent', 'rated at 100', 'p&t',
      'permanent and total', 'total disability permanent',
      // Vocational
      'vocational expert', 'independent vocational', 'vocational evidence'
    ],

    prompt: SKILL_PROMPT,

    phases: [
      { id: 'threshold',    name: 'Determine threshold status'      },
      { id: 'workimpact',   name: 'Determine work impact level'     },
      { id: 'employment',   name: 'Determine employment situation'  },
      { id: 'path',         name: 'Determine recommended path'      },
      { id: 'action',       name: 'Execute next steps'              }
    ],

    requiredFields: [],

    contextFields: ['vaRating', 'conditions', 'employmentStatus', 'income', 'education', 'workHistory'],

    /**
     * Execute the skill against the current context.
     * Runs full TDIU pipeline and returns a structured result
     * injected into the system prompt.
     *
     * @param {Object} context - { profile, history, userInput, missionPhase }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var profile    = (context && context.profile)   ? context.profile   : {};
      var userInput  = (context && context.userInput) ? context.userInput : '';
      var historyLen = (context && context.history)   ? context.history.length : 0;

      // ── Step 1: Determine threshold status ────────────
      var thresholdStatus = _determineThresholdStatus(profile, userInput);

      // ── Step 2: Determine work impact level ───────────
      var workImpactLevel = _determineWorkImpactLevel(profile, userInput);

      // ── Step 3: Determine employment situation ────────
      var employmentSituation = _determineEmploymentSituation(profile, userInput);

      // ── Step 4: Determine recommended path ───────────
      var recommendedPath = _determineRecommendedPath(
        profile, userInput, thresholdStatus, workImpactLevel, employmentSituation
      );

      // ── Step 5: Build reasoning ───────────────────────
      var reasoning = _buildReasoning(
        thresholdStatus, workImpactLevel, employmentSituation, recommendedPath, profile
      );

      // ── Step 6: Build next actions ────────────────────
      var nextActions = _buildNextActions(
        thresholdStatus, workImpactLevel, employmentSituation, recommendedPath, profile, userInput
      );

      // ── Assemble structured result ────────────────────
      var tdiuResult = {
        thresholdStatus:     thresholdStatus,
        workImpactLevel:     workImpactLevel,
        employmentSituation: employmentSituation,
        recommendedPath:     recommendedPath,
        reasoning:           reasoning,
        nextActions:         nextActions
      };

      // ── Flag unknown context fields ───────────────────
      var unknown = [];
      if (profile.vaRating === null || profile.vaRating === undefined) { unknown.push('vaRating'); }
      if (!profile.conditions || !profile.conditions.length)           { unknown.push('conditions'); }
      if (!profile.employmentStatus)                                    { unknown.push('employmentStatus'); }
      if (profile.income === null || profile.income === undefined)      { unknown.push('income'); }
      if (!profile.education)                                           { unknown.push('education'); }
      if (!profile.workHistory)                                         { unknown.push('workHistory'); }

      // ── Build data payload ────────────────────────────
      var data = {
        canRespond: true,
        tdiuResult: tdiuResult
      };

      if (unknown.length) { data.unknownFields = unknown; }

      // ── Eligibility engine integration ────────────────
      var Elig = window.AIOS && window.AIOS.Eligibility;
      if (Elig && Elig.hasUsefulSignal(profile)) {
        var scores = Elig.score(profile);
        if (scores.DISABILITY !== undefined) { data.disabilityScore = scores.DISABILITY; }
      }

      // ── Chain to next-action-planner after depth ──────
      if (historyLen >= 3) {
        data.chain = {
          nextSkill:     'next-action-planner',
          label:         'Build your complete TDIU claim strategy',
          sendText:      'Build me a complete TDIU claim strategy',
          missionType:   'tdiu_claim',
          missionUpdate: {
            currentStep: 'Determine TDIU threshold and path',
            nextStep:    'Assemble evidence package and file claim'
          }
        };
      }

      // ── Combine context block into full prompt ────────
      var contextBlock = _buildContextBlock(tdiuResult, profile);
      var fullPrompt   = SKILL_PROMPT + '\n\n' + contextBlock;

      return { prompt: fullPrompt, data: data };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['tdiu'] = TDIU;

})();
