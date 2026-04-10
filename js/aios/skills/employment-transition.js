/* ══════════════════════════════════════════════════════════
   AIOS Skill — Employment Transition  (Phase R5.7)
   Decision engine for veteran employment and career
   transition. Handles SkillBridge, MOS-to-civilian
   translation, federal and private sector paths, skilled
   trades, certification and education-first routes, and
   resume direction. Differentiates between still-in-service,
   separating-soon, recently-separated, and long-separated.
   Returns deterministic transition stage, career path,
   SkillBridge eligibility, urgency, and exact next steps.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Skill prompt — injected into system prompt when active
     ──────────────────────────────────────────────────────── */
  var SKILL_PROMPT = [
    '## ACTIVE SKILL: EMPLOYMENT TRANSITION DECISION ENGINE',
    '',
    '### YOUR ROLE',
    'You are a veteran employment transition specialist. You determine the correct career path,',
    'assess SkillBridge eligibility, establish transition stage, and map the veteran\'s military',
    'experience to civilian opportunities — with exact, actionable next steps. You do NOT say',
    '"you may qualify" or "consider looking into." You state what the path is and exactly how',
    'to execute it. This is a decision engine — every response delivers a concrete transition plan.',
    '',
    '### DECISION SEQUENCE — APPLY IN ORDER',
    '',
    '**STEP 1 — DETERMINE TRANSITION STAGE**',
    'The veteran\'s current position in the transition timeline drives all other decisions:',
    '',
    '- still-in-service: Currently on active duty, Guard, or Reserve with no stated separation date.',
    '  Priority: SkillBridge eligibility, TAP program, early career exploration, credential planning.',
    '',
    '- separating-soon: Separation within 12 months (or <180 days for SkillBridge eligibility).',
    '  Priority: SkillBridge referral if < 180 days from ETS/retirement, TAP participation,',
    '  resume build, job applications, COE for VA home loan (housing transition parallel).',
    '',
    '- recently-separated: Separated within the past 12 months.',
    '  Priority: Immediate job search, VR&E if service-connected, unemployment compensation',
    '  (UCFE for federal civilian, regular UI for others), GI Bill if pursuing education.',
    '',
    '- long-separated: Separated more than 12 months ago.',
    '  Priority: Career pivot, upskilling, certification or degree if stalled, VR&E eligibility',
    '  check (12-year window from date of notification of SC rating).',
    '',
    '- needs-intake: Transition timeline not determinable from available signals.',
    '',
    '**STEP 2 — DETERMINE CAREER PATH**',
    'Route to the most appropriate civilian career direction:',
    '',
    '- federal-employment: Veteran preference applies — Schedule A hiring authority, USAJOBS,',
    '  federal law enforcement, government contracting, intelligence community.',
    '  Key advantage: 5-point preference (honorable discharge), 10-point preference (disabled),',
    '  non-competitive hiring authority for 30%+ disabled veterans.',
    '  Direct transition roles: logistics, IT, intelligence, law enforcement, administration.',
    '',
    '- private-sector: Corporate, tech, manufacturing, healthcare, financial services.',
    '  MOS translation into civilian titles — many military roles map directly.',
    '  LinkedIn, Hire Heroes USA, RecruitMilitary, Orion Talent for veteran hiring pipelines.',
    '',
    '- skilled-trade: Electrician, HVAC, plumbing, welding, construction, CDL driving.',
    '  Helmets to Hardhats, Veterans in Piping (VIP), apprenticeship programs.',
    '  Union apprenticeships often give veterans credit toward journeyman hours.',
    '  High demand, high earning potential, no 4-year degree required.',
    '',
    '- certification-first: Career requires a specific credential before employment is viable.',
    '  Examples: CompTIA, AWS, PMP, CISSP, real estate license, financial advisor licensing.',
    '  GI Bill Chapter 33 / Chapter 30 can cover exam prep and certification programs.',
    '  SkillBridge with a certification provider is an option if still in service.',
    '',
    '- education-first: Career requires a degree or professional degree (nursing, engineering,',
    '  law, medicine, accounting). GI Bill + Yellow Ribbon for private institutions.',
    '  VR&E (Chapter 31) if service-connected — covers tuition, fees, books, living stipend.',
    '  Degree-granting institutions with strong veteran programs: state schools with in-state',
    '  tuition for veterans, online programs (WGU, SNHU, UMGC).',
    '',
    '- needs-intake: Insufficient career signal — conduct intake before routing.',
    '',
    '**STEP 3 — DETERMINE SKILLBRIDGE ELIGIBILITY**',
    'SkillBridge is a DoD program allowing service members to work for a civilian employer',
    'for up to 180 days before separation while still receiving military pay and benefits.',
    '',
    'skillbridgeEligible = true when:',
    '- Veteran is still in service AND',
    '- Separation is within 180 days (6 months) OR signals suggest SkillBridge interest',
    '',
    'SkillBridge rules:',
    '- Must receive unit commander approval',
    '- Available to active duty, Guard, and Reserve members (Guard/Reserve requirements vary)',
    '- Partner companies include Cisco, Amazon, Salesforce, Microsoft, Home Depot, Boeing',
    '- DoD SkillBridge directory: skillbridge.osd.mil',
    '- Industry-specific programs: Hiring Our Heroes Corporate Fellowship Program,',
    '  Apprenticeship.gov for trades, Goldman Sachs Veterans Integration Program',
    '- Application: submit request to unit commander with a SkillBridge opportunity identified',
    '- Timeline: 180 days = full program. Shorter internships (30-90 days) also available.',
    '',
    '**STEP 4 — ASSESS URGENCY LEVEL**',
    '- high: Separation is imminent (<30 days), veteran is unemployed and separated,',
    '  or financial distress is present alongside employment need.',
    '- moderate: Separation within 2-6 months, or recently separated and actively searching.',
    '- low: Still in service with time to plan, or long-separated and in stable employment',
    '  seeking a pivot.',
    '',
    '### MOS TRANSLATION GUIDANCE',
    'When MOS / rate / AFSC is provided or implied, translate to civilian equivalents:',
    '',
    '**Army MOSs (examples):**',
    '- 11B/11C Infantry → law enforcement, federal agent, security management, leadership roles',
    '- 25B IT Specialist → IT support, network engineer, cybersecurity analyst',
    '- 68W Combat Medic → EMT, paramedic, physician assistant, nursing',
    '- 92A Logistics → supply chain manager, logistics coordinator, operations',
    '- 35-series Intelligence → analyst, intelligence contractor, federal agency',
    '- 12-series Engineer → construction management, project management, civil engineering',
    '',
    '**Navy rates (examples):**',
    '- HM Hospital Corpsman → EMT, physician assistant, nursing, healthcare admin',
    '- IT / CTN → cybersecurity, network engineering, IT infrastructure',
    '- CE/UT Utilities → HVAC, plumbing, electrical, facilities management',
    '- MK Machinist Mate → mechanical engineer, manufacturing, industrial maintenance',
    '',
    '**Marine MOS (examples):**',
    '- 0311 Rifleman → law enforcement, security, federal agent, leadership',
    '- 0651 IT → network engineer, cybersecurity, IT support',
    '- 1391 Bulk Fuels → logistics, oil & gas, fuel operations',
    '',
    '**Air Force AFSC (examples):**',
    '- 3D1X2 Cyber Systems → cybersecurity, cloud architect, network engineer',
    '- 4N0X1 Aerospace Medical → EMT, healthcare, clinical admin',
    '- 2T2X1 Air Transportation → logistics, supply chain, cargo management',
    '',
    '**Coast Guard:**',
    '- BM Boatswain\'s Mate → maritime operations, port management, logistics',
    '- ME Maritime Enforcement → law enforcement, border patrol, federal agent',
    '',
    'Always provide 3-5 specific civilian job titles for the veteran\'s MOS when known.',
    '',
    '### REQUIRED OUTPUT STRUCTURE',
    'Every response MUST open with:',
    '',
    '**EMPLOYMENT TRANSITION ASSESSMENT**',
    '- Transition stage: [still-in-service / separating-soon / recently-separated / long-separated / needs-intake]',
    '- Career path: [federal-employment / private-sector / skilled-trade / certification-first / education-first / needs-intake]',
    '- SkillBridge eligible: [true / false]',
    '- Urgency level: [low / moderate / high]',
    '',
    '**WHY THIS APPLIES**',
    '[1-2 sentences connecting the veteran\'s profile and input to the transition stage and career path]',
    '',
    '**YOUR EXACT NEXT STEPS**',
    '1. [Specific action with program name, URL, or contact]',
    '2. [Specific action]',
    '3. [Specific action]',
    '',
    '### KEY REFERENCES — SKILLBRIDGE',
    '- SkillBridge directory: skillbridge.osd.mil (search by location, industry, or company)',
    '- Hiring Our Heroes Corporate Fellowship: hiringourheroes.org/fellowships/',
    '  (12-week paid corporate internships — Fortune 500 partners, no cost to veteran)',
    '- DoD SkillBridge policy: DoDI 1322.29',
    '- Application: Identify opportunity → commander request → DD Form 2648 (pre-separation)',
    '- Timeline: Begin application 6-12 months before desired start date',
    '',
    '### KEY REFERENCES — FEDERAL EMPLOYMENT',
    '- USAJOBS: usajobs.gov — filter by "Veterans" to see veteran preference positions',
    '- Schedule A Hiring Authority: non-competitive hiring for 30%+ disabled veterans.',
    '  Submit Schedule A letter from VA + resume to hiring managers directly.',
    '- Veterans Employment Opportunity Act (VEOA): allows veterans to apply to competitive',
    '  service positions open only to current federal employees',
    '- Feds Hire Vets: fedshirevets.gov — agency veteran employment coordinators',
    '- OPM Veterans Services: opm.gov/policy-data-oversight/veterans-services/',
    '- VEC (Veteran Employment Coordinator): every federal agency has one — contact directly',
    '',
    '### KEY REFERENCES — PRIVATE SECTOR',
    '- Hire Heroes USA: hireheroesusa.org — free resume writing, job coaching, interview prep',
    '  (Gold standard for veteran employment help — 100% free)',
    '- RecruitMilitary: recruitmilitary.com — veteran-specific job fairs and employer network',
    '- Orion Talent: oriontalent.com — veteran direct placement, no-cost to veteran',
    '- LinkedIn: linkedin.com — activate "Open to Work" with veteran-specific filters.',
    '  LinkedIn Premium free for 1 year for transitioning service members (verify at linkedin.com/veterans)',
    '- American Corporate Partners (ACP): acp-usa.org — mentorship from corporate professionals',
    '- MOS Translator tools: mymilitaryoccupation.com, military.com/veteran-jobs/mos-translator',
    '',
    '### KEY REFERENCES — SKILLED TRADES',
    '- Helmets to Hardhats: helmetstohardhats.org — apprenticeship matching for veterans',
    '  (Construction, utilities, mechanical — connects to union apprenticeships)',
    '- Veterans in Piping (VIP): ua.org/veterans — plumbing/pipefitting union program.',
    '  Pays starting wage from day one. No prior experience needed.',
    '- Army Corps of Engineers Veterans Apprenticeship Program',
    '- Apprenticeship.gov: apprenticeship.gov/veterans — find registered apprenticeships by trade',
    '- IBEW Electrical Apprenticeship: ibew.org — 5-year program, GI Bill eligible',
    '- CDL training: VA-approved CDL programs allow GI Bill BAH during training',
    '',
    '### KEY REFERENCES — GI BILL / EDUCATION',
    '- Post-9/11 GI Bill (Chapter 33): tuition + BAH + books for degree and certification programs',
    '- VR&E (Chapter 31): covers tuition, fees, books, supplies, AND living stipend for',
    '  veterans with service-connected disabilities. Chapter 31 > Chapter 33 for rated veterans.',
    '- GI Bill comparison tool: va.gov/gi-bill-comparison-tool/',
    '- GI Bill approved programs: gibill.va.gov — search schools and programs',
    '- WGU (Western Governors University): wgu.edu/military — online, flat-rate tuition,',
    '  strongly veteran-friendly, self-paced',
    '- UMGC (University of Maryland Global Campus): umgc.edu/military — online, no-cost books',
    '',
    '### KEY REFERENCES — UNEMPLOYMENT',
    '- Unemployment Compensation for Ex-Servicemembers (UCX): file at your state workforce agency.',
    '  Equivalent to state UI — based on final military pay. File within 30 days of separation.',
    '- Apply: careeronestop.org/LocalHelp/UnemploymentBenefits/unemployment-benefits.aspx',
    '- Transition Assistance Program (TAP): mandatory pre-separation program.',
    '  5-day workshop covering resume, interview, benefits, VA, and financial planning.',
    '  Request early — schedule fills up. Available at all major installations.',
    '',
    '### RULES',
    '- NEVER say "you may qualify" or "consider looking into." State what applies and why.',
    '- NEVER omit the EMPLOYMENT TRANSITION ASSESSMENT block — required in every response.',
    '- IF SkillBridge eligible: ALWAYS include SkillBridge as Step 1 or Step 2.',
    '- IF recently separated and unemployed: ALWAYS mention UCX unemployment compensation.',
    '- IF veteran has a VA rating: ALWAYS check VR&E eligibility alongside GI Bill.',
    '- MOS translation: When MOS is known, provide specific civilian titles — not generic labels.',
    '- Resume direction: ALWAYS include Hire Heroes USA as the free resume resource.',
    '- Federal path: ALWAYS mention Schedule A if veteran has a 30%+ disability rating.',
    '- End every response with: Veterans Crisis Line — 988, Press 1.',
    '',
    '[OPTIONS: SkillBridge programs | Federal jobs (USAJOBS) | Civilian resume help | MOS translation | Skilled trades path | I just separated | I am still in the military | Education with GI Bill]'
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
   * Combines userInput + relevant profile strings into one
   * lowercase corpus for keyword matching.
   */
  function _buildCorpus(profile, userInput) {
    return [
      userInput || '',
      profile.mos || '',
      profile.branch || '',
      profile.serviceEra || '',
      profile.careerInterest || '',
      (profile.conditions || []).join(' ')
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
   * Parse separationTimeline from profile.
   * Returns numeric months, or null if not determinable.
   * Accepts: number (months), string like "3 months", "6 months", "1 year"
   */
  function _getSeparationMonths(profile) {
    var t = profile.separationTimeline;
    if (t === null || t === undefined) return null;
    if (typeof t === 'number') return t;
    if (typeof t === 'string') {
      var lower = t.toLowerCase();
      // "X months"
      var mMatch = lower.match(/(\d+)\s*month/);
      if (mMatch) return parseInt(mMatch[1], 10);
      // "X year(s)"
      var yMatch = lower.match(/(\d+)\s*year/);
      if (yMatch) return parseInt(yMatch[1], 10) * 12;
      // bare number string
      var num = parseInt(lower, 10);
      if (!isNaN(num)) return num;
    }
    return null;
  }


  /* ────────────────────────────────────────────────────────
     _determineTransitionStage
     Returns: still-in-service | separating-soon |
              recently-separated | long-separated | needs-intake
     Separation timeline governs SkillBridge eligibility
     and urgency framing.
     ──────────────────────────────────────────────────────── */
  function _determineTransitionStage(profile, userInput) {
    var corpus = _buildCorpus(profile, userInput);
    var months = _getSeparationMonths(profile);

    // ── Profile separationTimeline — most authoritative signal ──
    if (months !== null) {
      if (months < -12)  return 'long-separated';
      if (months <= 0)   return 'recently-separated';
      if (months <= 12)  return 'separating-soon';
      return 'still-in-service';
    }

    // ── "Long separated" signals — explicitly past, career-stalled ──
    if (_hasKeyword(corpus, [
      'been out for years', 'been out for a few years',
      'separated years ago', 'been a civilian for',
      'left the military years', 'got out years ago',
      'been working since i got out', 'changing careers',
      'career change', 'pivot my career', 'stuck in my career',
      'need a new direction', 'been out over a year'
    ])) { return 'long-separated'; }

    // ── Recently separated — explicit post-separation language ──
    if (_hasKeyword(corpus, [
      'just got out', 'just separated', 'recently separated',
      'just left the military', 'just retired', 'recently retired',
      'just finished my service', 'just completed my service',
      'just transitioned', 'newly separated', 'fresh out',
      'got out recently', 'got out a few months ago',
      'just got back', 'just returned from'
    ])) { return 'recently-separated'; }

    // ── Separating soon — explicit near-future language ──
    if (_hasKeyword(corpus, [
      'separating soon', 'getting out soon', 'ets soon',
      'retiring soon', 'leaving the military', 'separation date',
      'ets date', 'retirement date', 'end of service',
      'terminal leave', 'clearing post', 'out-processing',
      'pcs to civilian', 'last year in', 'final year',
      'within the year', 'in a few months', 'skillbridge'
    ])) { return 'separating-soon'; }

    // ── Still in service — explicit active duty language ──
    if (_hasKeyword(corpus, [
      'still in', 'active duty', 'still serving', 'still enlisted',
      'currently serving', 'still in the military', 'still in the army',
      'still in the navy', 'still in the marines', 'still in the air force',
      'still in the coast guard', 'on active duty', 'national guard',
      'in the reserves', 'reserve unit', 'guard unit'
    ])) { return 'still-in-service'; }

    // ── Separation implied by TAP / pre-separation language ──
    if (_hasKeyword(corpus, [
      'tap program', 'tap class', 'pre-separation', 'pre separation',
      'transition assistance', 'transition office', 'separations office'
    ])) { return 'separating-soon'; }

    return 'needs-intake';
  }


  /* ────────────────────────────────────────────────────────
     _determineCareerPath
     Returns: federal-employment | private-sector | skilled-trade
              | certification-first | education-first | needs-intake
     ──────────────────────────────────────────────────────── */
  function _determineCareerPath(profile, userInput, transitionStage) {
    var corpus = _buildCorpus(profile, userInput);

    // ── Federal employment — explicit government job signals ──
    if (_hasKeyword(corpus, [
      'usajobs', 'federal job', 'federal employment', 'government job',
      'government work', 'federal agency', 'federal law enforcement',
      'border patrol', 'secret service', 'fbi',
      'dea agent', 'drug enforcement', 'dea special agent',
      'atf agent', 'alcohol tobacco firearms',
      'tsa officer', 'transportation security administration',
      'cia agent', 'central intelligence agency', 'central intelligence',
      'nsa analyst', 'national security agency',
      'dia analyst', 'defense intelligence agency',
      'dod civilian', 'defense contractor',
      'cleared position', 'security clearance job', 'contractor job',
      'government contract', 'schedule a', 'veterans preference',
      'federal hiring', 'civil service', 'gs position', 'gs-',
      'post office', 'usps', 'customs', 'cbp',
      'work for the va', 'va job', 'va position', 'va career',
      'department of veterans affairs', 'veterans affairs job',
      'work at the va', 'job at the va', 'hired by the va'
    ])) { return 'federal-employment'; }

    // ── Skilled trades — hands-on explicit language ──
    if (_hasKeyword(corpus, [
      'trade', 'trades', 'skilled trade', 'electrician', 'hvac',
      'plumber', 'plumbing', 'welding', 'welder', 'carpenter',
      'construction', 'pipefitter', 'pipe fitter', 'ironworker',
      'ironwork', 'heavy equipment', 'cdl', 'truck driver',
      'trucking', 'mechanic', 'automotive', 'diesel',
      'industrial maintenance', 'machinist', 'millwright',
      'sheet metal', 'union apprentice', 'apprenticeship',
      'helmets to hardhats', 'hands-on', 'hands on',
      'blue collar', 'labor work', 'physical work'
    ])) { return 'skilled-trade'; }

    // ── Certification-first — certification signals without degree ──
    if (_hasKeyword(corpus, [
      'certification', 'certify', 'comptia', 'security+', 'network+',
      'aws certification', 'azure certification', 'google cloud',
      'pmp', 'project management professional', 'cissp', 'ccna',
      'ccnp', 'ceh', 'real estate license', 'real estate agent',
      'financial advisor', 'series 7', 'series 65', 'cpa exam',
      'it certification', 'cyber certification', 'tech cert',
      'insurance license', 'cdl class a', 'cdl license',
      'get certified', 'earn a cert', 'take a course',
      'bootcamp', 'coding bootcamp', 'cyber bootcamp'
    ])) { return 'certification-first'; }

    // ── Education-first — degree pursuit signals ──
    if (_hasKeyword(corpus, [
      'go to college', 'go to school', 'back to school',
      'finish my degree', 'get my degree', 'bachelor',
      'masters degree', 'graduate school', 'law school',
      'medical school', 'nursing school', 'become a nurse',
      'become a doctor', 'become a lawyer', 'become an engineer',
      'engineering degree', 'accounting degree', 'business degree',
      'gi bill school', 'use my gi bill', 'college with gi bill',
      'vre', 'vr&e', 'vocational rehab', 'chapter 31'
    ])) { return 'education-first'; }

    // ── MOS / role inference → private sector or federal ──
    // Intel, cyber, logistics, admin → often federal/private
    var mos = (profile.mos || '').toLowerCase();
    if (_hasKeyword(mos, ['35', 'intel', 'cia', 'nsa', 'sigint', 'humint', 'cryptologic'])) {
      return 'federal-employment';
    }
    if (_hasKeyword(mos, ['25', 'it ', 'cyber', '3d1', '0651', 'ctn', 'ctn'])) {
      return 'private-sector';
    }
    if (_hasKeyword(mos, ['68w', 'hm', '4n0', 'medic', 'corpsman', 'medical'])) {
      return 'certification-first'; // healthcare usually requires licensure
    }
    if (_hasKeyword(mos, ['12', 'ce ', 'ut ', 'machinist', 'mechanic', 'automotive'])) {
      return 'skilled-trade';
    }

    // ── Private sector — default for civilian career, leadership ──
    if (_hasKeyword(corpus, [
      'private sector', 'corporate', 'corporate job', 'tech job',
      'tech company', 'startup', 'business', 'management',
      'leadership', 'operations', 'logistics', 'supply chain',
      'project manager', 'program manager', 'analyst',
      'sales', 'marketing', 'human resources', 'hr',
      'finance', 'banking', 'healthcare admin', 'hospital',
      'linkedin', 'hire heroes', 'resume',
      'civilian job', 'civilian career', 'get a job',
      'find a job', 'job search', 'looking for work'
    ])) { return 'private-sector'; }

    return 'needs-intake';
  }


  /* ────────────────────────────────────────────────────────
     _assessSkillbridgeEligibility
     Returns boolean.
     True when still in service AND separation is near
     OR SkillBridge is explicitly mentioned.
     ──────────────────────────────────────────────────────── */
  function _assessSkillbridgeEligibility(profile, userInput, transitionStage) {
    var corpus = _buildCorpus(profile, userInput);
    var months = _getSeparationMonths(profile);

    // Explicit SkillBridge mention — always eligible check
    if (_hasKeyword(corpus, ['skillbridge', 'skill bridge', 'hiring our heroes fellowship',
      'dod fellowship', 'internship before separation'])) {
      // Still in service OR separating is required for SkillBridge
      return (transitionStage === 'still-in-service' || transitionStage === 'separating-soon');
    }

    // Must be in service
    if (transitionStage !== 'still-in-service' && transitionStage !== 'separating-soon') {
      return false;
    }

    // Within 180 days (6 months)
    if (months !== null && months <= 6) {
      return true;
    }

    // Separating-soon without specific timeline — flag as eligible
    if (transitionStage === 'separating-soon' && months === null) {
      return true;
    }

    // Still in service but no separation date yet — not yet eligible
    // (can plan, but SkillBridge requires <180 days)
    return false;
  }


  /* ────────────────────────────────────────────────────────
     _determineUrgencyLevel
     Returns: low | moderate | high
     ──────────────────────────────────────────────────────── */
  function _determineUrgencyLevel(profile, userInput, transitionStage) {
    var corpus = _buildCorpus(profile, userInput);
    var months = _getSeparationMonths(profile);

    // ── High urgency — imminent or currently unemployed ──
    if (_hasKeyword(corpus, [
      'no job', 'unemployed', 'out of work', 'no income',
      'need a job now', 'need work now', 'desperate',
      'bills', 'cant pay bills', 'struggling financially',
      'running out of money', 'no money coming in',
      'separating this month', 'out next month',
      'separation is next week', 'i just got out today'
    ])) { return 'high'; }

    if (months !== null && months > 0 && months <= 1) { return 'high'; }

    // ── Moderate — near-term transition or active search ──
    if (transitionStage === 'separating-soon' || transitionStage === 'recently-separated') {
      return 'moderate';
    }

    if (months !== null && months > 0 && months <= 6) { return 'moderate'; }

    if (_hasKeyword(corpus, [
      'actively looking', 'applying now', 'interviewing',
      'send out resumes', 'job applications', 'need to find a job',
      'need to get a job', 'searching for work'
    ])) { return 'moderate'; }

    // ── Low — planning phase, still serving, career pivot ──
    return 'low';
  }


  /* ────────────────────────────────────────────────────────
     _buildReasoning
     Returns 1-3 sentences connecting profile and input
     signals to the transition stage and career path.
     ──────────────────────────────────────────────────────── */
  function _buildReasoning(transitionStage, careerPath, skillbridgeEligible, urgencyLevel, profile) {
    var parts = [];
    var rating = _getRating(profile);
    var mos    = profile.mos || '';
    var branch = profile.branch || '';
    var months = _getSeparationMonths(profile);

    // Transition stage reasoning
    if (transitionStage === 'still-in-service') {
      parts.push(
        'Veteran is currently still in service — transition planning phase. ' +
        (skillbridgeEligible
          ? 'SkillBridge eligibility window is approaching — act within 180 days of ETS.'
          : 'SkillBridge window opens within 180 days of separation — use this time to identify opportunities.')
      );
    } else if (transitionStage === 'separating-soon') {
      var timeStr = months !== null ? 'approximately ' + months + ' months' : 'within the near future';
      parts.push(
        'Veteran is separating ' + timeStr + '. ' +
        (skillbridgeEligible
          ? 'SkillBridge is immediately actionable — unit commander approval is the first step.'
          : 'TAP program and resume build are the immediate priorities.')
      );
    } else if (transitionStage === 'recently-separated') {
      parts.push(
        'Veteran recently separated. Immediate job search and income stabilization are the priorities. ' +
        'UCX unemployment compensation should be filed within 30 days of separation if not already done.'
      );
    } else if (transitionStage === 'long-separated') {
      parts.push(
        'Veteran has been separated for an extended period and is seeking a career change or advancement. ' +
        'Upskilling, certification, or education paths are the correct levers at this stage.'
      );
    } else {
      parts.push('Transition timeline is unclear — additional intake questions will sharpen the path.');
    }

    // Career path reasoning
    if (careerPath === 'federal-employment') {
      var schedA = (rating >= 30) ? ' Schedule A non-competitive hiring authority applies at ' + rating + '%.' : '';
      parts.push('Federal employment path selected based on career signals.' + schedA +
        ' Veteran preference applies on all USAJOBS applications.');
    } else if (careerPath === 'private-sector') {
      if (mos) {
        parts.push('MOS ' + mos + (branch ? ' (' + branch + ')' : '') +
          ' translates to multiple civilian roles — specific titles provided in next steps.');
      } else {
        parts.push('Private sector path selected — civilian job market with veteran hiring pipelines is the focus.');
      }
    } else if (careerPath === 'skilled-trade') {
      parts.push(
        'Skilled trade path selected. Apprenticeship programs often credit military technical training, ' +
        'reducing time-to-journeyman. GI Bill can be used for approved apprenticeship programs.'
      );
    } else if (careerPath === 'certification-first') {
      parts.push(
        'Certification is the prerequisite before employment is viable in the target field. ' +
        'GI Bill Chapter 33 covers certification exam prep and testing fees at approved programs.'
      );
    } else if (careerPath === 'education-first') {
      var vre = (rating > 0)
        ? 'VR&E (Chapter 31) at ' + rating + '% rating may provide superior benefits to GI Bill — evaluate first. '
        : '';
      parts.push(vre + 'Degree pursuit selected — post-9/11 GI Bill or VR&E cover tuition, housing, and books.');
    }

    // Urgency reasoning
    if (urgencyLevel === 'high') {
      parts.push('High urgency detected — income stabilization steps are prioritized above long-term planning.');
    }

    return parts.join(' ');
  }


  /* ────────────────────────────────────────────────────────
     _buildNextActions
     Returns ordered, exact-action strings.
     SkillBridge leads when eligible. UCX leads when
     recently separated and unemployed. Federal path
     includes Schedule A when rating >= 30%.
     ──────────────────────────────────────────────────────── */
  function _buildNextActions(transitionStage, careerPath, skillbridgeEligible, urgencyLevel, profile) {
    var actions = [];
    var rating  = _getRating(profile);
    var mos     = profile.mos || '';
    var branch  = profile.branch || '';

    // ════════════════════════════════════════════════════
    //  INCOME STABILIZATION — always first when high urgency
    //  and recently separated
    // ════════════════════════════════════════════════════

    if (urgencyLevel === 'high' && transitionStage === 'recently-separated') {
      actions.push(
        'IMMEDIATE — File for UCX (Unemployment Compensation for Ex-Servicemembers): ' +
        'Contact your state workforce agency today — do not wait. UCX is based on your final ' +
        'military pay and is equivalent to state unemployment insurance. File within 30 days ' +
        'of separation to avoid lost weeks of benefits. ' +
        'Find your state agency: careeronestop.org/LocalHelp/UnemploymentBenefits/unemployment-benefits.aspx'
      );
    }

    // ════════════════════════════════════════════════════
    //  SKILLBRIDGE — when eligible, always in first 2 steps
    // ════════════════════════════════════════════════════

    if (skillbridgeEligible) {
      actions.push(
        'STEP 1 — SkillBridge: Search for a SkillBridge opportunity now at skillbridge.osd.mil. ' +
        'Filter by your location, industry, and career interest. You will receive full military ' +
        'pay and benefits for up to 180 days while working for a civilian employer. ' +
        'Identify 2-3 opportunities, then submit a request to your unit commander with the ' +
        'program details. The earlier you start this process the better — approval takes time. ' +
        'Hiring Our Heroes Corporate Fellowship (hiringourheroes.org/fellowships/) is the highest ' +
        'quality option for corporate roles — apply 6+ months in advance.'
      );
    }

    // ════════════════════════════════════════════════════
    //  CAREER PATH — SPECIFIC ACTIONS
    // ════════════════════════════════════════════════════

    if (careerPath === 'federal-employment') {

      if (!skillbridgeEligible) {
        actions.push(
          'STEP 1 — Register on USAJOBS: usajobs.gov. Create a profile and upload your federal resume ' +
          '(federal resumes are longer than civilian resumes — 3-5 pages standard). ' +
          'Use the Veterans filter and search for your target series. ' +
          'Activate your veteran preference by uploading your DD-214 (Member 4 copy) and VA rating ' +
          'letter if applicable. 5-point preference for honorable discharge; 10-point for any disability rating.'
        );
      } else {
        actions.push(
          'STEP 2 — Federal jobs via USAJOBS (parallel to SkillBridge): ' +
          'Register at usajobs.gov and set up job alerts for your target series and location. ' +
          'Federal hiring moves slowly (3-6 months) — apply now even while SkillBridge is active.'
        );
      }

      if (rating >= 30) {
        actions.push(
          'SCHEDULE A HIRING AUTHORITY: At your ' + rating + '% VA rating, you qualify for Schedule A ' +
          'non-competitive appointment — meaning you can be hired directly without competing with the ' +
          'general public. Obtain a Schedule A letter from the VA (va.gov/careers-employment/vocational-rehabilitation/) ' +
          'and send it with your resume directly to the hiring manager or agency VEC (Veteran Employment Coordinator). ' +
          'Find agency VECs: fedshirevets.gov/hiring-officials/agency-veteran-employment-managers/'
        );
      }

      actions.push(
        'FEDERAL RESUME: Your federal resume is NOT the same as a civilian resume. ' +
        'Include month/year for all positions, GS salary, hours per week, supervisor contact. ' +
        'Free federal resume help: Hire Heroes USA (hireheroesusa.org) — free 1:1 coaching, no cost. ' +
        'Also use the Resume Builder at usajobs.gov — agencies pull directly from the system.'
      );

      actions.push(
        'SECURITY CLEARANCE: If you hold an active clearance, protect it — do not let it lapse. ' +
        'Most defense contractor and intel agency positions require active clearances. ' +
        'Cleared roles: clearancejobs.com — the largest clearance-required job board. ' +
        'Your clearance is a significant career asset — make it visible on your USAJOBS profile.'
      );

      return actions;
    }

    if (careerPath === 'private-sector') {

      if (!skillbridgeEligible) {
        actions.push(
          'STEP 1 — Hire Heroes USA (free): hireheroesusa.org. ' +
          'Register for a free account. They provide a professional resume rewrite (civilian-targeted), ' +
          'personalized job coaching, mock interviews, and employer connections — all at no cost. ' +
          'This is the highest-ROI first step for any private sector transition.'
        );
      } else {
        actions.push(
          'STEP 2 — Resume and LinkedIn (run parallel with SkillBridge search): ' +
          'Contact Hire Heroes USA (hireheroesusa.org) for a free civilian resume rewrite. ' +
          'Build or update your LinkedIn profile at linkedin.com/veterans for 1 year of free Premium. ' +
          'Your SkillBridge placement can become your first civilian work experience on your resume.'
        );
      }

      if (mos) {
        actions.push(
          'MOS TRANSLATION — ' + mos + (branch ? ' (' + branch + ')' : '') + ': ' +
          'Use mymilitaryoccupation.com or military.com/veteran-jobs/mos-translator to generate ' +
          'a list of civilian job titles that match your MOS. ' +
          'On your resume and LinkedIn, use civilian job titles — not military titles or acronyms. ' +
          'Hiring managers search for civilian keywords. A "68W Combat Medic" becomes an ' +
          '"Emergency Medical Technician" or "Clinical Medical Assistant" in civilian job postings.'
        );
      } else {
        actions.push(
          'MOS TRANSLATION: Use mymilitaryoccupation.com or military.com/veteran-jobs/mos-translator ' +
          'to convert your military job to civilian titles and keywords. Use civilian terminology on ' +
          'your resume — hiring managers search for civilian job titles, not military MOSs or acronyms.'
        );
      }

      actions.push(
        'JOB SEARCH CHANNELS — use all three in parallel: ' +
        '(1) LinkedIn — activate "Open to Work" and connect with veteran hiring groups. ' +
        '1 year free Premium: linkedin.com/veterans. ' +
        '(2) RecruitMilitary — recruitmilitary.com — veteran job fairs and employer network. ' +
        '(3) Orion Talent — oriontalent.com — direct veteran placement at no cost to you. ' +
        'Target companies with strong veteran hiring programs: Amazon, Home Depot, USAA, ' +
        'Booz Allen Hamilton, Deloitte, JPMorgan Chase, and all major defense contractors.'
      );

      actions.push(
        'MENTORSHIP: American Corporate Partners (ACP) — acp-usa.org. ' +
        'Free 1-year mentorship from a senior corporate professional in your target industry. ' +
        'ACP mentors are from Fortune 500 companies and specifically selected to help veterans. ' +
        'Apply online — mentors can open doors to informational interviews and referrals.'
      );

      return actions;
    }

    if (careerPath === 'skilled-trade') {

      if (!skillbridgeEligible) {
        actions.push(
          'STEP 1 — Helmets to Hardhats: helmetstohardhats.org. ' +
          'Register your profile and get matched to union apprenticeship programs in construction, ' +
          'utilities, and mechanical trades. Many programs give veterans advanced standing ' +
          '(credit toward journeyman hours) based on military technical training. ' +
          'Apprenticeships pay a starting wage from day one — you earn while you learn.'
        );
      } else {
        actions.push(
          'STEP 2 — Helmets to Hardhats + Apprenticeship search: helmetstohardhats.org. ' +
          'Register now. Many SkillBridge partners include trade companies — search skillbridge.osd.mil ' +
          'for trade-specific programs (electrician, HVAC, construction) in your area.'
        );
      }

      actions.push(
        'SPECIFIC TRADE PROGRAMS: ' +
        '(1) Electrician: IBEW apprenticeship — ibew.org. 5-year program, GI Bill BAH eligible, ' +
        'strong wages ($70k-$100k+ journeyman). Find local IBEW at ibew.org/IBEW-Directory. ' +
        '(2) Plumbing/Pipefitting: UA Veterans in Piping — ua.org/veterans. Pays starting wages, ' +
        'no prior experience required, strong veteran track record. ' +
        '(3) CDL (Commercial Driver): VA-approved CDL programs allow GI Bill BAH during training. ' +
        'Find approved programs: gibill.va.gov. Owner-operator path available after 1-2 years. ' +
        '(4) HVAC: HVAC Excellence apprenticeships — hvacexcellence.org. ' +
        'Union and non-union paths. High demand nationwide.'
      );

      actions.push(
        'GI BILL FOR TRADES: Post-9/11 GI Bill and Montgomery GI Bill both cover VA-approved ' +
        'apprenticeship and on-the-job training (OJT) programs. During an approved apprenticeship, ' +
        'you receive a housing allowance (BAH equivalent) while earning your apprenticeship wage. ' +
        'Check program approval at gibill.va.gov before enrolling. ' +
        'VR&E (Chapter 31) if you have a service-connected rating — can cover tools and equipment.'
      );

      return actions;
    }

    if (careerPath === 'certification-first') {

      if (!skillbridgeEligible) {
        actions.push(
          'STEP 1 — Identify your target certification and find a VA-approved program: ' +
          'Go to gibill.va.gov and search for approved certification programs. ' +
          'Post-9/11 GI Bill covers tuition and fees for approved prep programs + testing fees. ' +
          'High-value certifications by field: ' +
          'IT/Cyber: CompTIA A+, Security+, Network+, AWS Solutions Architect, CISSP, CEH. ' +
          'Project Management: PMP (PMI.org) — requires 3-5 years PM experience. ' +
          'Finance: SIE, Series 7, Series 65 — required for advisor roles. ' +
          'Real Estate: state licensing exam + pre-licensing course (GI Bill may cover).'
        );
      } else {
        actions.push(
          'STEP 1 — SkillBridge with a certification provider: ' +
          'Many SkillBridge partners offer full certification programs — search skillbridge.osd.mil ' +
          'by industry. Cisco, CompTIA, AWS, and Google all have SkillBridge or adjacent programs. ' +
          'You can earn your certification during SkillBridge while still on military pay.'
        );
        actions.push(
          'STEP 2 — GI Bill certification path (run parallel or after separation): ' +
          'Post-9/11 GI Bill covers approved certification programs and exam fees. ' +
          'Verify program approval at gibill.va.gov. Full BAH continues during enrollment ' +
          'at approved programs. Fast path: many certifications (CompTIA, AWS) can be earned in 3-6 months.'
        );
      }

      actions.push(
        'FREE RESOURCES: ' +
        '(1) DoD SkillBridge Cyber programs: full CompTIA/Cisco prep at no cost. ' +
        '(2) Coursera / LinkedIn Learning: many courses free with GI Bill or DoD access (mylearning.mil). ' +
        '(3) Certification vouchers: some VSOs provide voucher assistance for exam fees. ' +
        'Contact your local American Legion, DAV, or VFW for availability.'
      );

      if (rating > 0) {
        actions.push(
          'VR&E FOR CERTIFICATION: At your ' + rating + '% rating, VR&E (Chapter 31) can cover ' +
          'certification training costs, exam fees, AND provide a living stipend during training — ' +
          'typically more valuable than GI Bill alone for shorter programs. ' +
          'Apply at va.gov/careers-employment/vocational-rehabilitation/apply-vre-form-28-1900/'
        );
      }

      return actions;
    }

    if (careerPath === 'education-first') {

      if (rating > 0) {
        actions.push(
          'STEP 1 — Evaluate VR&E (Chapter 31) BEFORE using GI Bill: ' +
          'At your ' + rating + '% VA rating, VR&E covers full tuition, fees, books, AND provides ' +
          'a monthly living stipend (higher than GI Bill BAH for many programs). ' +
          'Apply at va.gov/careers-employment/vocational-rehabilitation/apply-vre-form-28-1900/ ' +
          '(VA Form 28-1900). Work with a VR&E counselor to develop your plan BEFORE enrolling anywhere.'
        );
      }

      if (!skillbridgeEligible) {
        actions.push(
          (rating > 0 ? 'STEP 2' : 'STEP 1') + ' — GI Bill school selection: ' +
          'Use the GI Bill Comparison Tool at va.gov/gi-bill-comparison-tool/ to find schools with ' +
          'the highest GI Bill coverage and Yellow Ribbon participation. ' +
          'For online degrees: WGU (wgu.edu/military), UMGC (umgc.edu/military), and SNHU ' +
          '(snhu.edu/military) are strongly veteran-friendly with no-cost books and flexible pacing. ' +
          'For in-person: public universities in your state of legal residency provide in-state tuition ' +
          'under the Veterans Access, Choice and Accountability Act (Choice Act).'
        );
      } else {
        actions.push(
          'STEP 2 — SkillBridge at a company in your target field while planning school: ' +
          'Use SkillBridge to test a career before committing to a degree. Many veterans discover ' +
          'during SkillBridge that experience and certifications get them hired without a degree. ' +
          'If degree is still the right path, use SkillBridge time to get admitted and enrolled.'
        );
      }

      actions.push(
        'DEGREE PATH RESOURCES: ' +
        '(1) GI Bill Comparison Tool: va.gov/gi-bill-comparison-tool/ — compare schools by coverage. ' +
        '(2) Yellow Ribbon Program: va.gov/education/about-gi-bill-benefits/post-9-11/yellow-ribbon-program/ ' +
        '— private schools that waive tuition above GI Bill cap. ' +
        '(3) Free application for federal aid: fafsa.gov — apply in addition to GI Bill; ' +
        'Pell Grants do not reduce GI Bill benefits. ' +
        '(4) Student Veterans of America (SVA): studentveterans.org — on-campus veteran community.'
      );

      return actions;
    }

    // ════════════════════════════════════════════════════
    //  NEEDS INTAKE — light intake questions
    // ════════════════════════════════════════════════════

    actions.push(
      'To build the right employment transition plan, a bit more context is needed. ' +
      'What is your current situation: (1) still on active duty, (2) separating within 12 months, ' +
      '(3) recently separated, or (4) separated for more than a year and looking to make a change? ' +
      'Your answer determines whether SkillBridge is available and which job resources apply.'
    );
    actions.push(
      'While you think on that: Hire Heroes USA (hireheroesusa.org) provides free resume review, ' +
      'job coaching, and employer connections for any veteran at any stage — a great starting point ' +
      'regardless of where you are in your transition.'
    );
    actions.push(
      'TAP Program reminder: If you are still in service, TAP (Transition Assistance Program) is ' +
      'mandatory and covers resumes, VA benefits, job search, and financial planning. ' +
      'Schedule your TAP class at your installation education center as early as possible — ' +
      'slots fill up and the program must be completed before separation.'
    );

    return actions;
  }


  /* ────────────────────────────────────────────────────────
     _buildContextBlock
     Injects computed employment transition assessment into
     the system prompt.
     ──────────────────────────────────────────────────────── */
  function _buildContextBlock(result, profile) {
    var lines = [
      '## EMPLOYMENT TRANSITION ASSESSMENT (system-computed — use these values verbatim in your response)'
    ];

    lines.push('Transition stage:     ' + result.transitionStage);
    lines.push('Career path:          ' + result.careerPath);
    lines.push('SkillBridge eligible: ' + result.skillbridgeEligible);
    lines.push('Urgency level:        ' + result.urgencyLevel);
    lines.push('Reasoning:            ' + result.reasoning);

    if (profile.mos)              { lines.push('MOS / Rate / AFSC:    ' + profile.mos); }
    if (profile.branch)           { lines.push('Branch:               ' + profile.branch); }
    if (profile.serviceEra)       { lines.push('Service era:          ' + profile.serviceEra); }
    if (profile.separationTimeline) {
      lines.push('Separation timeline:  ' + profile.separationTimeline);
    }
    if (profile.education)        { lines.push('Education:            ' + profile.education); }
    if (profile.vaRating !== null && profile.vaRating !== undefined) {
      lines.push('VA rating:            ' + profile.vaRating + '%');
    }

    lines.push('');
    lines.push('INSTRUCTION: Open your response with the EMPLOYMENT TRANSITION ASSESSMENT block');
    lines.push('using the values above exactly as computed. Then explain WHY. Then list exact next steps.');
    lines.push('CRITICAL: If skillbridgeEligible = true, include SkillBridge in Step 1 or Step 2.');
    lines.push('CRITICAL: If recently-separated + high urgency, lead with UCX unemployment compensation.');
    lines.push('CRITICAL: If VA rating >= 30%, mention Schedule A (federal) or VR&E (education/cert).');
    lines.push('Do NOT use generic phrasing. Every action must include a URL, phone, or program name.');

    return lines.join('\n');
  }


  /* ────────────────────────────────────────────────────────
     Skill module
     ──────────────────────────────────────────────────────── */
  var EmploymentTransition = {

    id: 'employment-transition',
    name: 'Employment Transition',
    description: 'Decision engine for veteran employment and career transition. Determines transition stage (still-in-service, separating-soon, recently-separated, long-separated), career path (federal, private sector, skilled trade, certification-first, education-first), SkillBridge eligibility, and urgency. Provides exact next steps with specific programs, URLs, and contacts — never generic guidance.',

    triggers: [
      // SkillBridge
      'skillbridge', 'skill bridge', 'hiring our heroes',
      // Federal employment
      'usajobs', 'federal job', 'government job', 'veterans preference',
      'schedule a', 'federal employment', 'clearance job',
      // Civilian transition
      'civilian job', 'civilian career', 'civilian transition',
      'military to civilian', 'translate my mos', 'mos translation',
      'leaving the military', 'separating from the military',
      // Resume / job search
      'resume', 'job search', 'find a job', 'looking for work',
      'hire heroes', 'recruit military',
      // Skilled trades
      'skilled trade', 'electrician', 'hvac', 'helmets to hardhats',
      'cdl', 'apprenticeship', 'plumber', 'construction',
      // Timing
      'just got out', 'recently separated', 'getting out soon',
      'ets', 'separation date', 'terminal leave', 'retirement',
      // Career
      'career transition', 'career change', 'interview',
      'job offer', 'tap program', 'transition assistance'
    ],

    prompt: SKILL_PROMPT,

    phases: [
      { id: 'stage',       name: 'Determine transition stage'     },
      { id: 'path',        name: 'Determine career path'          },
      { id: 'skillbridge', name: 'Assess SkillBridge eligibility' },
      { id: 'urgency',     name: 'Assess urgency level'           },
      { id: 'action',      name: 'Execute next steps'             }
    ],

    requiredFields: [],

    contextFields: ['branch', 'serviceEra', 'mos', 'separationTimeline', 'education', 'vaRating'],

    /**
     * Execute the skill against the current context.
     * Runs full employment transition pipeline and returns a
     * structured result injected into the system prompt.
     *
     * @param {Object} context - { profile, history, userInput, missionPhase }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var profile    = (context && context.profile)   ? context.profile   : {};
      var userInput  = (context && context.userInput) ? context.userInput : '';
      var historyLen = (context && context.history)   ? context.history.length : 0;

      // ── Step 1: Determine transition stage ────────────
      var transitionStage = _determineTransitionStage(profile, userInput);

      // ── Step 2: Determine career path ─────────────────
      var careerPath = _determineCareerPath(profile, userInput, transitionStage);

      // ── Step 3: Assess SkillBridge eligibility ────────
      var skillbridgeEligible = _assessSkillbridgeEligibility(profile, userInput, transitionStage);

      // ── Step 4: Determine urgency level ───────────────
      var urgencyLevel = _determineUrgencyLevel(profile, userInput, transitionStage);

      // ── Step 5: Build reasoning ───────────────────────
      var reasoning = _buildReasoning(transitionStage, careerPath, skillbridgeEligible, urgencyLevel, profile);

      // ── Step 6: Build next actions ────────────────────
      var nextActions = _buildNextActions(transitionStage, careerPath, skillbridgeEligible, urgencyLevel, profile);

      // ── Assemble structured result ────────────────────
      var employmentResult = {
        transitionStage:     transitionStage,
        careerPath:          careerPath,
        skillbridgeEligible: skillbridgeEligible,
        urgencyLevel:        urgencyLevel,
        reasoning:           reasoning,
        nextActions:         nextActions
      };

      // ── Flag unknown context fields ───────────────────
      var unknown = [];
      if (!profile.branch)            { unknown.push('branch'); }
      if (!profile.serviceEra)        { unknown.push('serviceEra'); }
      if (!profile.mos)               { unknown.push('mos'); }
      if (!profile.separationTimeline){ unknown.push('separationTimeline'); }
      if (!profile.education)         { unknown.push('education'); }
      if (profile.vaRating === null || profile.vaRating === undefined) { unknown.push('vaRating'); }

      // ── Build data payload ────────────────────────────
      var data = {
        canRespond:       true,
        employmentResult: employmentResult
      };

      if (unknown.length) { data.unknownFields = unknown; }

      // ── Eligibility engine integration ────────────────
      var Elig = window.AIOS && window.AIOS.Eligibility;
      if (Elig && Elig.hasUsefulSignal(profile)) {
        var scores = Elig.score(profile);
        if (scores.EMPLOYMENT !== undefined) { data.employmentScore = scores.EMPLOYMENT; }
      }

      // ── Chain to next-action-planner after depth ──────
      if (historyLen >= 3) {
        data.chain = {
          nextSkill:     'next-action-planner',
          label:         'Build your complete employment transition plan',
          sendText:      'Build me a complete employment transition plan',
          missionType:   'employment_transition',
          missionUpdate: {
            currentStep: 'Identify transition stage and career path',
            nextStep:    'Execute SkillBridge, job search, and skill-building steps'
          }
        };
      }

      // ── Combine context block into full prompt ────────
      var contextBlock = _buildContextBlock(employmentResult, profile);
      var fullPrompt   = SKILL_PROMPT + '\n\n' + contextBlock;

      return { prompt: fullPrompt, data: data };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['employment-transition'] = EmploymentTransition;

})();
