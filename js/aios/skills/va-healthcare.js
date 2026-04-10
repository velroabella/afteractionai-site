/* ══════════════════════════════════════════════════════════
   AIOS Skill — VA Healthcare Enrollment  (Phase R5.4)
   Decision engine for VA healthcare enrollment, priority
   group estimation, care path routing, dental eligibility,
   and mental health access. Returns deterministic enrollment
   assessment and exact next steps — never vague eligibility.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Skill prompt — injected into system prompt when active
     ──────────────────────────────────────────────────────── */
  var SKILL_PROMPT = [
    '## ACTIVE SKILL: VA HEALTHCARE ENROLLMENT DECISION ENGINE',
    '',
    '### YOUR ROLE',
    'You are a VA healthcare enrollment analyst. You determine enrollment eligibility, estimate',
    'priority group, route to the correct care path, and assess dental access — all based on',
    'the veteran\'s profile. You do NOT say "you may qualify." You explain what applies and why.',
    'This is a decision engine — every response delivers a concrete enrollment determination.',
    '',
    '### DECISION SEQUENCE — APPLY IN ORDER',
    '',
    '**STEP 1 — DETERMINE ENROLLMENT STATUS**',
    'Use discharge status, VA rating, service era, and income to classify:',
    '',
    '- likely-eligible: Honorable/General discharge, OR any discharge with 50%+ VA rating',
    '- likely-eligible-needs-priority-review: Eligible but priority group depends on income/assets',
    '- possible-character-of-discharge-issue: OTH/BCD/Dishonorable — NOT an automatic denial.',
    '  VA makes individual determinations. Route to Health Eligibility Center (HEC).',
    '  Veterans with OTH CAN receive VA healthcare for service-connected conditions.',
    '- needs-intake: Insufficient data to determine',
    '',
    '**STEP 2 — ESTIMATE PRIORITY GROUP**',
    'VA assigns veterans to 1 of 8 priority groups. Higher priority = more benefits, lower copays.',
    '',
    'Group 1: 50%+ service-connected disability rating',
    'Group 2: 30-40% service-connected disability rating',
    'Group 3: 10-20% service-connected disability rating, former POW, Purple Heart,',
    '         discharge for disability incurred/aggravated in line of duty, Medal of Honor,',
    '         or VA pension recipient',
    'Group 4: Housebound or Aid & Attendance recipient',
    'Group 5: Non-service-connected veteran below VA income threshold (means test),',
    '         or receiving VA pension, or eligible for Medicaid',
    'Group 6: Compensable 0% service-connected condition, toxic exposure (PACT Act),',
    '         Vietnam-era veteran, Gulf War/post-9/11 veteran (within 10 years of separation),',
    '         Camp Lejeune, radiation exposure, Project 112/SHAD',
    'Group 7: Above income threshold with income below geographic threshold + agree to copays',
    'Group 8: Above geographic income threshold + agree to copays',
    '',
    '**STEP 3 — DETERMINE CARE PATH**',
    'Based on profile signals, route to the most appropriate care entry:',
    '',
    '- enroll-now: Not yet enrolled — immediate enrollment is priority',
    '- enroll-and-request-primary-care: Enrolled or enrolling — needs PCP assignment',
    '- enroll-and-request-mental-health: Mental health signals detected — fast-track mental health access',
    '- vet-center-route: User specifically mentions Vet Center, or combat/MST/bereavement context.',
    '  Vet Centers are separate from VA Medical Centers. They offer readjustment counseling,',
    '  no enrollment required, free, confidential. 300+ locations. Eligible: combat veterans,',
    '  MST survivors, drone crews, bereaved family. Phone: 1-877-927-8387.',
    '- community-care-review: When VA facility is inaccessible (distance, wait time, service gap)',
    '- urgent-care-guidance: Immediate care need — route to nearest VA ER or approved urgent care',
    '- needs-intake: Not enough data',
    '',
    '**STEP 4 — ASSESS DENTAL ELIGIBILITY**',
    'VA dental is NOT automatic with healthcare enrollment. Separate eligibility:',
    '',
    '- likely-eligible: 100% disability rating (any), 100% P&T, former POW (any duration),',
    '  service-connected dental condition rated compensable, enrolled in VR&E (Ch. 31),',
    '  Homeless veteran (HCHV/CWT programs), or discharged within 180 days (one-time)',
    '- likely-not-eligible: Standard enrolled veteran without above qualifiers.',
    '  May still access dental via VA Dental Insurance Program (VADIP) — supplemental coverage.',
    '- needs-review: Ambiguous — suggest contacting dental eligibility at local VAMC',
    '',
    '### REQUIRED OUTPUT STRUCTURE',
    'Every response MUST open with:',
    '',
    '**HEALTHCARE ASSESSMENT**',
    '- Enrollment status: [likely-eligible / likely-eligible-needs-priority-review / possible-character-of-discharge-issue / needs-intake]',
    '- Priority group: [1-8 or unknown]',
    '- Care path: [enroll-now / enroll-and-request-primary-care / enroll-and-request-mental-health / vet-center-route / community-care-review / urgent-care-guidance / needs-intake]',
    '- Dental access: [likely-eligible / likely-not-eligible / needs-review]',
    '',
    '**WHY THIS APPLIES**',
    '[1-2 sentences connecting profile data to the enrollment/priority determination]',
    '',
    '**YOUR EXACT NEXT STEPS**',
    '1. [Specific action with form number, URL, or phone]',
    '2. [Specific action]',
    '3. [Specific action]',
    '',
    '### KEY REFERENCES',
    '- Enrollment: VA Form 10-10EZ at va.gov/health-care/apply or call 1-877-222-8387',
    '- Health Eligibility Center (HEC): 1-877-222-8387 (enrollment questions, priority group, means test)',
    '- My HealtheVet: myhealth.va.gov (patient portal, secure messaging, Rx refills)',
    '- Vet Centers: va.gov/find-locations/?facilityType=vet_center or 1-877-927-8387',
    '  (no enrollment required, free, confidential readjustment counseling)',
    '- Community Care: va.gov/communitycare or call 1-877-881-7618',
    '  (MISSION Act: 30-minute drive time / 20-day wait time standards)',
    '- Urgent Care: va.gov/find-locations (nearest VA ER or approved urgent care)',
    '  (3 urgent care visits/year at approved community providers for enrolled veterans)',
    '- Travel Reimbursement: va.gov/health-care/get-reimbursed-for-travel-pay/',
    '  (Beneficiary Travel: 41.5¢/mile, $7.77 deductible each way, waived for',
    '  service-connected 30%+, travel >25 miles, or low income)',
    '- Dental: VA Dental Insurance Program (VADIP) — delta.va.gov or metlife.com/vadip',
    '  (supplemental dental for enrolled veterans — ~$10-$50/month)',
    '- Mental Health: va.gov/health-care/health-needs-conditions/mental-health/',
    '  Same-day mental health services at every VA Medical Center.',
    '  Veterans Crisis Line: 988, Press 1.',
    '- Women Veterans: Women Veterans Call Center 1-855-829-6636',
    '  Every VAMC has a Women Veterans Program Manager (WVPM)',
    '- Copay rates (2024): Priority Groups 7-8 pay copays.',
    '  Primary care: $15/visit. Specialty: $50/visit. Medications: $5-$11.',
    '  Groups 1-6: generally no copays for service-connected care.',
    '',
    '### PACT ACT HEALTHCARE EXPANSION',
    '- Post-9/11 veterans (served after Sept 11, 2001): 10-year enrollment window from separation',
    '- Gulf War veterans (served after Aug 2, 1990): same 10-year window',
    '- Toxic exposure veterans: Priority Group 6 regardless of income',
    '- Vietnam veterans: Priority Group 6 for Agent Orange presumptive conditions',
    '- Camp Lejeune: eligible for healthcare for 15+ covered conditions',
    '- If veteran served in a covered era and is NOT enrolled — flag as high priority',
    '',
    '### RULES',
    '- NEVER say "you may qualify" or "consider looking into." State what applies and why.',
    '- NEVER omit the HEALTHCARE ASSESSMENT block — required in every response.',
    '- OTH/BCD/Dishonorable is NOT an automatic bar. Always route to HEC for individual review.',
    '- Vet Centers are SEPARATE from VA Medical Centers — never conflate them.',
    '- Always mention travel reimbursement when discussing VA facility visits.',
    '- Mental health: same-day services available at EVERY VAMC — no appointment needed for crisis.',
    '- If asking about dental and not 100% rated: state VADIP as the dental access path.',
    '- End every response with: Veterans Crisis Line — 988, Press 1.',
    '',
    '[OPTIONS: Enroll in VA healthcare | Check my priority group | Find a VA facility near me | Vet Center counseling | Dental coverage | Mental health services | Community care options | Am I eligible with my discharge?]'
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
   * Combines userInput + conditions into one lowercase string
   * for keyword matching.
   */
  function _buildCorpus(profile, userInput) {
    return [
      userInput || '',
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


  /* ────────────────────────────────────────────────────────
     _determineEnrollmentStatus
     Returns one of:
       likely-eligible
       likely-eligible-needs-priority-review
       possible-character-of-discharge-issue
       needs-intake
     ──────────────────────────────────────────────────────── */
  function _determineEnrollmentStatus(profile, userInput) {
    var discharge = (profile.dischargeStatus || '').toLowerCase();
    var rating    = _getRating(profile);
    var corpus    = _buildCorpus(profile, userInput);

    // Discharge issues — but NOT an automatic bar
    var badDischarge = (
      discharge.indexOf('other than honorable') !== -1 ||
      discharge.indexOf('oth') !== -1 ||
      discharge.indexOf('bad conduct') !== -1 ||
      discharge.indexOf('bcd') !== -1 ||
      discharge.indexOf('dishonorable') !== -1
    );

    // If discharge is bad BUT rating >= 50, VA still provides care
    if (badDischarge && rating < 50) {
      return 'possible-character-of-discharge-issue';
    }

    // Honorable or General — or any discharge with 50%+ rating
    if (
      discharge.indexOf('honorable') !== -1 ||
      discharge.indexOf('general') !== -1 ||
      rating >= 50
    ) {
      return 'likely-eligible';
    }

    // Has some rating but discharge status unknown — likely eligible
    if (rating >= 0) {
      return 'likely-eligible';
    }

    // Era signals suggesting PACT Act healthcare eligibility
    var era = (profile.serviceEra || '').toLowerCase();
    if (
      era.indexOf('post-9/11') !== -1 || era.indexOf('post 9/11') !== -1 ||
      era.indexOf('oef') !== -1 || era.indexOf('oif') !== -1 ||
      era.indexOf('gulf war') !== -1 || era.indexOf('desert storm') !== -1 ||
      era.indexOf('vietnam') !== -1
    ) {
      return 'likely-eligible';
    }

    // Location keywords suggesting service — inference toward eligible
    if (_hasKeyword(corpus, [
      'iraq', 'afghanistan', 'vietnam', 'kuwait', 'camp lejeune',
      'burn pit', 'agent orange', 'combat', 'deployed'
    ])) {
      return 'likely-eligible';
    }

    // Discharge unknown + user input suggesting veteran seeking care
    if (_hasKeyword(corpus, [
      'enroll', 'sign up', 'va healthcare', 'va hospital',
      'va doctor', 'see a doctor', 'get care', 'medical care',
      'primary care', 'prescription'
    ])) {
      return 'likely-eligible-needs-priority-review';
    }

    return 'needs-intake';
  }


  /* ────────────────────────────────────────────────────────
     _estimatePriorityGroup
     Returns string: '1' through '8', or 'unknown'.
     Based on 38 CFR 17.36 priority group definitions.
     ──────────────────────────────────────────────────────── */
  function _estimatePriorityGroup(profile, userInput) {
    var rating    = _getRating(profile);
    var discharge = (profile.dischargeStatus || '').toLowerCase();
    var era       = (profile.serviceEra || '').toLowerCase();
    var corpus    = _buildCorpus(profile, userInput);

    // ── Group 1: 50%+ service-connected disability ──
    if (rating >= 50) return '1';

    // ── Group 2: 30-40% service-connected ──
    if (rating >= 30 && rating < 50) return '2';

    // ── Group 3: 10-20% service-connected, former POW, Purple Heart ──
    if (rating >= 10 && rating < 30) return '3';
    if (_hasKeyword(corpus, ['pow', 'prisoner of war', 'purple heart', 'medal of honor'])) return '3';

    // ── Group 4: Housebound or Aid & Attendance ──
    if (_hasKeyword(corpus, ['housebound', 'aid and attendance', 'aid & attendance'])) return '4';

    // ── Group 5: Low income / VA pension / Medicaid ──
    if (_hasKeyword(corpus, ['pension', 'medicaid', 'low income', 'below threshold'])) return '5';
    if (profile.income && profile.income === 'below-threshold') return '5';

    // ── Group 6: Toxic exposure / era-based expanded eligibility ──
    // Compensable 0% rating
    if (rating === 0) return '6';
    // PACT Act eras within 10 years of separation
    if (
      era.indexOf('post-9/11') !== -1 || era.indexOf('post 9/11') !== -1 ||
      era.indexOf('oef') !== -1 || era.indexOf('oif') !== -1 ||
      era.indexOf('gulf war') !== -1 || era.indexOf('desert storm') !== -1
    ) { return '6'; }
    // Vietnam-era / toxic exposure
    if (era.indexOf('vietnam') !== -1) return '6';
    if (_hasKeyword(corpus, [
      'burn pit', 'agent orange', 'camp lejeune', 'radiation exposure',
      'toxic exposure', 'pact act', 'depleted uranium'
    ])) { return '6'; }

    // ── Group 7 or 8: Income-based, above thresholds ──
    if (profile.income && (profile.income === 'above-threshold' || profile.income === 'high')) {
      return '7-or-8';
    }

    return 'unknown';
  }


  /* ────────────────────────────────────────────────────────
     _determineCarePath
     Returns the most appropriate care entry point based on
     profile signals and user input.
     ──────────────────────────────────────────────────────── */
  function _determineCarePath(profile, userInput, enrollmentStatus) {
    var corpus = _buildCorpus(profile, userInput);

    // ── Urgent care — immediate need ──
    if (_hasKeyword(corpus, [
      'emergency', 'urgent care', 'urgent', 'er visit', 'need care now',
      'need to see someone today', 'same day', 'walk in', 'walk-in',
      'crisis', 'immediate'
    ])) { return 'urgent-care-guidance'; }

    // ── Vet Center — distinct from VAMC, no enrollment needed ──
    if (_hasKeyword(corpus, [
      'vet center', 'readjustment', 'mst', 'military sexual trauma',
      'combat stress', 'bereavement', 'bereaved',
      'grief counseling', 'readjustment counseling'
    ])) { return 'vet-center-route'; }

    // ── Mental health — fast-track ──
    if (_hasKeyword(corpus, [
      'ptsd', 'depression', 'anxiety', 'therapy', 'counseling',
      'mental health', 'suicide', 'suicidal', 'therapist',
      'psychiatrist', 'psychologist', 'substance abuse',
      'alcohol', 'addiction', 'sleep problems', 'insomnia',
      'nightmares', 'anger', 'anger management', 'tbi',
      'traumatic brain injury', 'brain injury',
      'behavioral health', 'mood', 'panic', 'stress'
    ])) { return 'enroll-and-request-mental-health'; }

    // ── Community care — access/distance/wait issues ──
    if (_hasKeyword(corpus, [
      'community care', 'mission act', 'outside va',
      'private doctor', 'civilian doctor', 'too far',
      'no va near me', 'closest va', 'drive time',
      'wait time', 'can not get an appointment', 'long wait'
    ])) { return 'community-care-review'; }

    // ── Women veterans — route to primary care with WVPM ──
    if (_hasKeyword(corpus, [
      'woman veteran', 'women veteran', 'female veteran', 'women\'s health',
      'maternity', 'prenatal', 'gynecolog', 'mammogram',
      'pap smear', 'contraception', 'fertility'
    ])) { return 'enroll-and-request-primary-care'; }

    // ── Character of discharge issue — special path ──
    if (enrollmentStatus === 'possible-character-of-discharge-issue') {
      return 'enroll-now';  // Still direct to enrollment — HEC will adjudicate
    }

    // ── Already mentioning existing VA care ──
    if (_hasKeyword(corpus, [
      'already enrolled', 'have va healthcare', 'my doctor at va',
      'my va doctor', 'change my pcp', 'switch doctors',
      'new primary care', 'need a referral', 'referral'
    ])) { return 'enroll-and-request-primary-care'; }

    // ── Default: not enrolled → enroll ──
    return 'enroll-now';
  }


  /* ────────────────────────────────────────────────────────
     _assessDentalStatus
     Returns: likely-eligible / likely-not-eligible / needs-review
     VA dental is separate from general healthcare enrollment.
     ──────────────────────────────────────────────────────── */
  function _assessDentalStatus(profile, userInput) {
    var rating = _getRating(profile);
    var corpus = _buildCorpus(profile, userInput);

    // 100% rating — full dental coverage
    if (rating === 100) return 'likely-eligible';

    // Former POW (any duration)
    if (_hasKeyword(corpus, ['pow', 'prisoner of war'])) return 'likely-eligible';

    // Service-connected dental condition
    if (_hasKeyword(corpus, [
      'dental injury', 'teeth injured', 'jaw injury',
      'dental trauma', 'dental service connected'
    ])) { return 'likely-eligible'; }

    // VR&E (Chapter 31) participant — dental authorized if needed for employment
    if (_hasKeyword(corpus, ['chapter 31', 'vr&e', 'vocational rehabilitation'])) {
      return 'likely-eligible';
    }

    // Recently separated (within 180 days) — one-time dental
    if (_hasKeyword(corpus, [
      'just separated', 'recently separated', 'just got out',
      'within 180 days', 'just discharged', 'ets', 'just etsed'
    ])) { return 'likely-eligible'; }

    // Homeless veteran programs
    if (_hasKeyword(corpus, ['homeless', 'hchv', 'cwt'])) {
      return 'likely-eligible';
    }

    // Explicitly asking about dental — they probably don't have it
    if (_hasKeyword(corpus, ['dental', 'dentist', 'teeth', 'tooth'])) {
      if (rating >= 0) return 'likely-not-eligible';
      return 'needs-review';
    }

    // Default — if not explicitly asking, mark as needs-review
    return 'needs-review';
  }


  /* ────────────────────────────────────────────────────────
     _buildNextActions
     Returns ordered array of exact action strings tailored
     to the care path and enrollment determination.
     ──────────────────────────────────────────────────────── */
  function _buildNextActions(carePath, enrollmentStatus, priorityGroup, dentalStatus, profile) {
    var actions = [];
    var rating = _getRating(profile);

    switch (carePath) {

      case 'urgent-care-guidance':
        actions.push(
          'For life-threatening emergencies: Call 911 or go to the nearest emergency room — ' +
          'VA or non-VA. The VA can cover non-VA emergency care in many cases; report the visit ' +
          'to the VA within 72 hours. Locate nearest VA ER at va.gov/find-locations.'
        );
        if (enrollmentStatus === 'enrolled' || enrollmentStatus === 'likely-eligible') {
          actions.push(
            'For non-emergency urgent care (enrolled veterans): You can use approved ' +
            'community urgent care providers under the VA community care urgent care benefit. ' +
            'Find one at va.gov/find-locations/?facilityType=urgent_care. ' +
            'Bring your Veterans Health Identification Card (VHIC). ' +
            'Confirm visit limits and any copays with your VAMC.'
          );
        } else {
          actions.push(
            'For non-emergency urgent care (not yet enrolled): Your fastest options are ' +
            '(1) walk in to the nearest VA Medical Center and ask to be seen, ' +
            '(2) use any community urgent care clinic (self-pay or private insurance may apply, ' +
            'as community urgent care benefits generally require VA enrollment first), or ' +
            '(3) start your VA healthcare enrollment now at va.gov/health-care/apply ' +
            '(VA Form 10-10EZ) so future urgent care visits can be covered.'
          );
        }
        actions.push(
          'Not sure where to go? Call the VA at 1-877-222-VETS (1-877-222-8387) ' +
          'to speak with a representative who can route you to the right service.'
        );
        break;

      case 'vet-center-route':
        actions.push(
          'Find your nearest Vet Center at va.gov/find-locations/?facilityType=vet_center ' +
          'or call 1-877-927-8387. Vet Centers are free and confidential — ' +
          'no VA enrollment required. Walk-ins welcome.'
        );
        actions.push(
          'Vet Centers serve: combat veterans (all eras), military sexual trauma survivors, ' +
          'drone/unmanned aerial vehicle crews, and bereaved family members. ' +
          'Services: individual/group/family counseling, readjustment support, referrals.'
        );
        actions.push(
          'If you also need VA medical care (prescriptions, primary care, specialty), ' +
          'enroll separately at va.gov/health-care/apply (VA Form 10-10EZ). ' +
          'Vet Center counseling and VA Medical Center care are independent systems.'
        );
        break;

      case 'enroll-and-request-mental-health':
        actions.push(
          'Every VA Medical Center offers same-day mental health services — ' +
          'walk in to any VAMC and ask for mental health. No appointment needed for initial evaluation. ' +
          'Or call your local VAMC and request a mental health appointment.'
        );
        actions.push(
          'If not yet enrolled: Apply at va.gov/health-care/apply (VA Form 10-10EZ) ' +
          'or call 1-877-222-8387. Mental health enrollment is fast-tracked. ' +
          'You can also access the Veterans Crisis Line at 988, Press 1 — 24/7.'
        );
        actions.push(
          'Additional access: VA telehealth mental health appointments available from home. ' +
          'Vet Centers also provide free, confidential counseling without VA enrollment (1-877-927-8387). ' +
          'For substance abuse: VA SARRTP programs at va.gov/health-care/health-needs-conditions/substance-use-problems/.'
        );
        break;

      case 'community-care-review':
        actions.push(
          'Under the MISSION Act, you qualify for community care if: (1) VA cannot provide the service, ' +
          '(2) your drive time exceeds 30 minutes for primary care / 60 minutes for specialty, ' +
          '(3) your wait time exceeds 20 days for primary care / 28 days for specialty, ' +
          'or (4) it is in your best medical interest.'
        );
        actions.push(
          'Request community care: Call your VA Medical Center and ask for a community care referral, ' +
          'or contact the VA Community Care line at 1-877-881-7618. ' +
          'You must be enrolled in VA healthcare and have a referral/authorization before receiving community care.'
        );
        actions.push(
          'If not yet enrolled: Apply first at va.gov/health-care/apply (VA Form 10-10EZ). ' +
          'Once enrolled, request a community care eligibility determination from your VAMC.'
        );
        break;

      case 'enroll-and-request-primary-care':
        actions.push(
          'If not yet enrolled: Apply at va.gov/health-care/apply (VA Form 10-10EZ) ' +
          'or call 1-877-222-8387. Processing takes 5-10 business days.'
        );
        actions.push(
          'Once enrolled: Call your assigned VA Medical Center and request a primary care appointment. ' +
          'Set up My HealtheVet at myhealth.va.gov for secure messaging, Rx refills, and appointment scheduling.'
        );
        if (_hasKeyword((profile.conditions || []).join(' ') + ' ' + (profile.branch || ''), [
          'women', 'female'
        ]) || _hasKeyword('', ['women', 'female'])) {
          actions.push(
            'Women Veterans: Every VAMC has a Women Veterans Program Manager (WVPM). ' +
            'Call the Women Veterans Call Center at 1-855-829-6636 for personalized assistance ' +
            'with primary care, maternity care, and gender-specific services.'
          );
        } else {
          actions.push(
            'Travel reimbursement: If you travel to a VA facility, you may be eligible for mileage reimbursement ' +
            '(41.5¢/mile). Apply via Beneficiary Travel at va.gov/health-care/get-reimbursed-for-travel-pay/. ' +
            'Copay for travel deductible waived for 30%+ service-connected or low-income veterans.'
          );
        }
        break;

      default: // 'enroll-now' and fallback
        if (enrollmentStatus === 'possible-character-of-discharge-issue') {
          actions.push(
            'Apply for VA healthcare at va.gov/health-care/apply (VA Form 10-10EZ) — ' +
            'OTH/BCD/Dishonorable discharge does NOT automatically bar you from VA healthcare. ' +
            'VA makes individual eligibility determinations. Your application will be reviewed by the ' +
            'Health Eligibility Center (HEC). Call 1-877-222-8387 to discuss your specific situation.'
          );
          actions.push(
            'While HEC reviews your application: You CAN receive VA care for any condition ' +
            'the VA determines is service-connected, regardless of discharge character. ' +
            'You can also access Vet Center counseling (1-877-927-8387) — no enrollment needed. ' +
            'Mental health crisis: 988, Press 1 — available to ALL veterans regardless of discharge.'
          );
          actions.push(
            'Consider a discharge upgrade: Apply to your branch\'s Discharge Review Board (DRB) ' +
            'or Board for Correction of Military Records (BCMR). ' +
            'Free legal help available from VSOs (DAV 1-800-827-1000) or legal aid organizations.'
          );
        } else {
          actions.push(
            'Enroll in VA healthcare NOW at va.gov/health-care/apply (VA Form 10-10EZ). ' +
            'Online takes 15-20 minutes. Or call 1-877-222-8387 to enroll by phone. ' +
            'Or visit any VA Medical Center in person — enrollment staff will help you complete the form.'
          );
          actions.push(
            'After enrollment: You will receive a priority group assignment and be assigned a ' +
            'VA Medical Center. Set up My HealtheVet (myhealth.va.gov) for secure messaging, ' +
            'appointment scheduling, and prescription refills.' +
            (priorityGroup === '7-or-8' ? ' Note: Priority Groups 7-8 pay copays ($15 primary, $50 specialty, $5-$11 Rx).' : '')
          );
          actions.push(
            'Travel reimbursement: If you travel to a VA facility, apply for mileage reimbursement ' +
            '(41.5¢/mile) via va.gov/health-care/get-reimbursed-for-travel-pay/.' +
            (rating >= 30 ? ' Your 30%+ rating waives the travel deductible.' : '')
          );
        }
    }

    // ── Dental callout when relevant ──
    if (dentalStatus === 'likely-eligible') {
      actions.push(
        'Dental: You may be eligible for VA dental care depending on your eligibility class. ' +
        'VA dental benefits are organized into six classes (Class I through Class VI) based on factors ' +
        'such as VA rating, POW status, service-connected dental conditions, and participation in ' +
        'specific VA programs. Class I (100% P&T or unemployability) receives comprehensive care; ' +
        'other classes cover only service-connected dental conditions. ' +
        'Veterans separating from active duty also have a one-time 180-day post-discharge dental window — ' +
        'apply within 180 days of separation for a full course of dental treatment. ' +
        'To apply: complete VA Form 10-10EZD (Application for Extended Care Services) or contact ' +
        'the dental clinic at your assigned VAMC. ' +
        'Confirm your eligibility class before scheduling to avoid unexpected costs.'
      );
    } else if (dentalStatus === 'likely-not-eligible') {
      actions.push(
        'Dental: Standard VA healthcare enrollment does NOT include dental coverage. ' +
        'Access affordable dental through the VA Dental Insurance Program (VADIP): ' +
        'delta.va.gov or metlife.com/vadip — plans start at ~$10/month. ' +
        'You must be enrolled in VA healthcare to qualify for VADIP.'
      );
    }

    // ── VSO support — always last ──
    actions.push(
      'Contact a VSO for free enrollment assistance: ' +
      'DAV (1-800-827-1000), VFW (vfw.org), American Legion (legion.org). ' +
      'VSOs can help navigate enrollment, priority group disputes, and copay waivers.'
    );

    return actions;
  }


  /* ────────────────────────────────────────────────────────
     _buildContextBlock
     Injects computed healthcare assessment into the prompt.
     ──────────────────────────────────────────────────────── */
  function _buildContextBlock(result, profile) {
    var lines = [
      '## HEALTHCARE ASSESSMENT (system-computed — use these values verbatim in your response)'
    ];

    lines.push('Enrollment status:     ' + result.probableEnrollmentStatus);
    lines.push('Priority group:        ' + result.probablePriorityGroup);
    lines.push('Care path:             ' + result.carePath);
    lines.push('Dental access:         ' + result.dentalStatus);
    lines.push('Reasoning:             ' + result.reasoning);

    if (profile.serviceEra)       { lines.push('Service era:           ' + profile.serviceEra); }
    if (profile.branch)           { lines.push('Branch:                ' + profile.branch); }
    if (profile.dischargeStatus)  { lines.push('Discharge:             ' + profile.dischargeStatus); }
    if (profile.vaRating !== null && profile.vaRating !== undefined) {
      lines.push('Current VA rating:     ' + profile.vaRating + '%');
    }
    if (profile.conditions && profile.conditions.length) {
      lines.push('Conditions on file:    ' + profile.conditions.join(', '));
    }
    if (profile.income) {
      lines.push('Income signal:         ' + profile.income);
    }

    lines.push('');
    lines.push('INSTRUCTION: Open your response with the HEALTHCARE ASSESSMENT block using the');
    lines.push('values above exactly as computed. Then explain WHY. Then list exact next steps.');
    lines.push('If dental was assessed, include dental guidance in the next steps.');
    lines.push('Always mention travel reimbursement for in-person VA visits.');

    return lines.join('\n');
  }


  /* ────────────────────────────────────────────────────────
     _buildReasoning
     Generates a concise explanation for the determination.
     ──────────────────────────────────────────────────────── */
  function _buildReasoning(enrollmentStatus, priorityGroup, carePath, dentalStatus, profile) {
    var parts = [];
    var rating = _getRating(profile);
    var discharge = (profile.dischargeStatus || '').toLowerCase();

    // Enrollment reasoning
    switch (enrollmentStatus) {
      case 'likely-eligible':
        if (rating >= 50) {
          parts.push('Service-connected disability rating of ' + rating + '% establishes healthcare eligibility in Priority Group 1 with no copays.');
        } else if (rating >= 0) {
          parts.push('Existing VA disability rating confirms service connection — healthcare enrollment is established.');
        } else if (discharge.indexOf('honorable') !== -1 || discharge.indexOf('general') !== -1) {
          parts.push('Honorable/General discharge confirms basic healthcare eligibility.');
        } else {
          parts.push('Your service history may qualify you for VA healthcare, but eligibility depends on discharge status, service details, and enrollment status.');
        }
        break;
      case 'likely-eligible-needs-priority-review':
        parts.push('Enrollment is likely but priority group depends on income verification (means test). ' +
          'The VA Health Eligibility Center will determine your exact group after enrollment.');
        break;
      case 'possible-character-of-discharge-issue':
        parts.push('Discharge status requires individual VA review — this is NOT an automatic bar. ' +
          'The Health Eligibility Center reviews each case individually. ' +
          'Service-connected conditions are covered regardless of discharge character.');
        break;
      default:
        parts.push('Additional information needed to determine enrollment eligibility. ' +
          'Provide discharge status and service era for a specific determination.');
    }

    // Priority group reasoning
    if (priorityGroup !== 'unknown') {
      var pgNote = '';
      if (priorityGroup === '1') pgNote = 'Priority Group 1: no copays, full access to all VA healthcare services.';
      else if (priorityGroup === '2') pgNote = 'Priority Group 2: no copays for service-connected care.';
      else if (priorityGroup === '3') pgNote = 'Priority Group 3: no copays for service-connected care.';
      else if (priorityGroup === '6') pgNote = 'Priority Group 6: eligible under toxic exposure / era-based expansion (PACT Act).';
      else if (priorityGroup === '7-or-8') pgNote = 'Priority Group 7 or 8: copays apply ($15 primary, $50 specialty). Income verification required.';
      if (pgNote) parts.push(pgNote);
    }

    // Dental reasoning
    if (dentalStatus === 'likely-eligible') {
      parts.push('Dental access confirmed based on eligibility category (100% rating, POW, or other qualifying criteria).');
    }

    return parts.join(' ');
  }


  /* ────────────────────────────────────────────────────────
     Skill module
     ──────────────────────────────────────────────────────── */
  var VAHealthcare = {

    id: 'va-healthcare',
    name: 'VA Healthcare Enrollment',
    description: 'Decision engine for VA healthcare enrollment, priority group estimation, care path routing, dental eligibility, and mental health access.',

    triggers: [
      'VA healthcare', 'va health care', 'enroll in va', 'va enrollment',
      'va hospital', 'va medical center', 'vamc', 'va doctor',
      'priority group', 'va copay', 'copayment',
      'community care', 'mission act', 'vet center',
      'va dental', 'dental coverage', 'va dentist',
      'mental health', 'ptsd', 'counseling', 'therapy',
      'va prescription', 'va pharmacy', 'my healthevet',
      'travel reimbursement', 'beneficiary travel',
      'urgent care', 'va emergency', 'woman veteran', 'women veteran',
      'see a va doctor', 'get va care', 'va primary care'
    ],

    prompt: SKILL_PROMPT,

    phases: [
      { id: 'enrollment', name: 'Determine enrollment eligibility' },
      { id: 'priority',   name: 'Estimate priority group'         },
      { id: 'carepath',   name: 'Route to care path'              },
      { id: 'activate',   name: 'Complete enrollment + access'    }
    ],

    requiredFields: ['dischargeStatus'],

    contextFields: ['serviceEra', 'branch', 'dischargeStatus', 'vaRating', 'conditions', 'income', 'familyStatus'],

    /**
     * Execute the skill against the current context.
     * Runs full healthcare enrollment pipeline and returns
     * a structured result injected into the system prompt.
     *
     * @param {Object} context - { profile, history, userInput, missionPhase }
     * @returns {Object} { prompt: string, data: Object }
     */
    run: function(context) {
      var profile    = (context && context.profile)   ? context.profile   : {};
      var userInput  = (context && context.userInput) ? context.userInput : '';
      var historyLen = (context && context.history)   ? context.history.length : 0;

      // Phase R6.8: read session context (read-only)
      var _ctx = (window.AIOS && window.AIOS.Memory &&
                  typeof window.AIOS.Memory.getSkillContext === 'function')
        ? window.AIOS.Memory.getSkillContext()
        : { profile: {}, session: { symptoms: [], goals: [], lastActiveSkill: null,
            atRiskSignal: { flagged: false, turn: null, subtype: null } } };
      var _ctxProfile = _ctx.profile;
      var _ctxSession = _ctx.session;

      // ── Step 1: Determine enrollment status ───────────
      var enrollmentStatus = _determineEnrollmentStatus(profile, userInput);

      // ── Step 2: Estimate priority group ───────────────
      var priorityGroup = _estimatePriorityGroup(profile, userInput);

      // ── Step 3: Determine care path ───────────────────
      var carePath = _determineCarePath(profile, userInput, enrollmentStatus);

      // ── Step 4: Assess dental eligibility ─────────────
      var dentalStatus = _assessDentalStatus(profile, userInput);

      // ── Step 5: Build reasoning ───────────────────────
      var reasoning = _buildReasoning(enrollmentStatus, priorityGroup, carePath, dentalStatus, profile);

      // ── Step 6: Build next actions ────────────────────
      var nextActions = _buildNextActions(carePath, enrollmentStatus, priorityGroup, dentalStatus, profile);

      // ── Assemble structured result ────────────────────
      var healthcareResult = {
        probableEnrollmentStatus: enrollmentStatus,
        probablePriorityGroup:    priorityGroup,
        carePath:                 carePath,
        dentalStatus:             dentalStatus,
        reasoning:                reasoning,
        nextActions:              nextActions
      };

      // ── Flag unknown context fields ───────────────────
      var unknown = [];
      if (!profile.serviceEra)      { unknown.push('serviceEra'); }
      if (!profile.branch)          { unknown.push('branch'); }
      if (!profile.dischargeStatus) { unknown.push('dischargeStatus'); }
      if (profile.vaRating === null || profile.vaRating === undefined) { unknown.push('vaRating'); }
      if (!profile.conditions || !profile.conditions.length) { unknown.push('conditions'); }
      if (!profile.income) { unknown.push('income'); }

      // ── Build data payload ────────────────────────────
      var data = {
        canRespond:       true,
        healthcareResult: healthcareResult
      };

      if (unknown.length) { data.unknownFields = unknown; }

      // Phase R6.8: inject session symptom context into reasoning (read-only)
      var _mhSymptoms = [], _respSymptoms = [];
      for (var _si = 0; _si < _ctxSession.symptoms.length; _si++) {
        var _sym = _ctxSession.symptoms[_si];
        if (_sym.category === 'mental-health')  { _mhSymptoms.push(_sym.token); }
        if (_sym.category === 'respiratory')    { _respSymptoms.push(_sym.token); }
      }
      if (_mhSymptoms.length > 0 || _respSymptoms.length > 0) {
        var _symNote = 'Session context — symptoms already shared: ';
        if (_mhSymptoms.length)   { _symNote += 'Mental health: '  + _mhSymptoms.join(', ')  + '. '; }
        if (_respSymptoms.length) { _symNote += 'Respiratory: ' + _respSymptoms.join(', ') + '. '; }
        _symNote += 'Address these directly — do not re-ask for symptom intake.';
        healthcareResult.reasoning = healthcareResult.reasoning
          ? healthcareResult.reasoning + ' ' + _symNote : _symNote;
        data.sessionSymptomContext = _symNote;
        console.log('[AIOS][SKILL][VA_HEALTHCARE] Session symptom context injected | mh:' +
          _mhSymptoms.length + ' resp:' + _respSymptoms.length);
      }

      // ── Eligibility engine integration ────────────────
      var Elig = window.AIOS && window.AIOS.Eligibility;
      if (Elig && Elig.hasUsefulSignal(profile)) {
        var scores = Elig.score(profile);
        if (scores.HEALTHCARE      !== undefined) { data.healthcareScore = scores.HEALTHCARE; }
        if (scores.DISABILITY_COMP !== undefined) { data.disabilityScore = scores.DISABILITY_COMP; }
      }

      // ── Chain to next-action-planner after depth ──────
      if (historyLen >= 3) {
        data.chain = {
          nextSkill:     'next-action-planner',
          label:         'Build your complete VA healthcare action plan',
          sendText:      'Build me a complete VA healthcare action plan',
          missionType:   'healthcare_enrollment',
          missionUpdate: {
            currentStep: 'Confirm enrollment eligibility and priority group',
            nextStep:    'Submit VA Form 10-10EZ and activate care access'
          }
        };
      }

      // ── Combine context block into full prompt ────────
      var contextBlock = _buildContextBlock(healthcareResult, profile);
      var fullPrompt   = SKILL_PROMPT + '\n\n' + contextBlock;

      return { prompt: fullPrompt, data: data };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['va-healthcare'] = VAHealthcare;

})();
