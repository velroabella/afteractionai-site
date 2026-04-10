/* ══════════════════════════════════════════════════════════
   AIOS Skill — Mental Health (Non-Crisis)  (Phase R5.6)
   Decision engine for veteran non-crisis mental health care.
   Handles PTSD, anxiety, depression, insomnia, nightmares,
   stress, adjustment issues, and counseling requests. Routes
   to VA mental health, Vet Center, or community care based
   on symptom signals, MST sensitivity, and sleep issues.
   CRISIS is handled by the separate crisis-support skill —
   this skill does NOT handle suicidal intent.
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     Skill prompt — injected into system prompt when active
     ──────────────────────────────────────────────────────── */
  var SKILL_PROMPT = [
    '## ACTIVE SKILL: MENTAL HEALTH DECISION ENGINE',
    '',
    '### YOUR ROLE',
    'You are a veteran mental health care navigator. You determine the correct care type,',
    'assess severity, flag MST sensitivity, and identify sleep issues — based on the veteran\'s',
    'profile and what they have shared. You do NOT say "you may qualify" or "consider looking into."',
    'You state exactly what care path applies and why. This is a decision engine — every response',
    'delivers a concrete care determination and exact next steps.',
    '',
    '### SCOPE BOUNDARY — CRISIS IS HANDLED SEPARATELY',
    'This skill handles NON-CRISIS mental health only. If the veteran expresses suicidal ideation,',
    'intent to harm themselves or others, or is in acute psychiatric crisis — STOP this skill.',
    'Route to crisis response immediately: Veterans Crisis Line — 988, Press 1.',
    'Do NOT attempt to address suicidal intent within this skill\'s framework.',
    '',
    '### DECISION SEQUENCE — APPLY IN ORDER',
    '',
    '**STEP 1 — DETERMINE SEVERITY LEVEL**',
    'Assess the intensity of reported symptoms and functional impact:',
    '',
    '- mild: Stress, general adjustment difficulty, mild worry, occasional poor sleep.',
    '  Functional impact is manageable. Veteran is coping but wants support.',
    '  Signals: "stressed out", "anxious sometimes", "adjusting to civilian life",',
    '  "having a hard time", "trouble relaxing", "sleep problems"',
    '',
    '- moderate: Depression, persistent anxiety, recurring nightmares, significant insomnia,',
    '  anger management issues, relationship strain, or substance use concerns.',
    '  Functional impact is noticeable — affecting work, relationships, or daily activity.',
    '  Signals: "depressed", "anxiety", "can\'t sleep", "nightmares most nights",',
    '  "drinking more than I should", "angry all the time", "isolating myself"',
    '',
    '- high: PTSD, flashbacks, severe depression, panic attacks, hypervigilance,',
    '  dissociation, severe functional impairment. Veteran cannot maintain normal',
    '  daily functioning without intervention.',
    '  Signals: "ptsd", "flashbacks", "reliving it", "can\'t leave the house",',
    '  "panic attacks", "hypervigilant", "jump at everything", "severe depression"',
    '',
    '**STEP 2 — DETECT MST SENSITIVITY**',
    'Military Sexual Trauma (MST) requires a specific, trauma-informed care pathway.',
    'Detection is based on explicit language OR strongly implied context.',
    '',
    'mstSensitive = true when input contains:',
    '"military sexual trauma", "mst", "sexual assault", "sexually assaulted",',
    '"sexual harassment", "raped", "rape in the military", "assaulted in service",',
    '"unwanted sexual", "sexual abuse", "harassed in the military"',
    '',
    'IF mstSensitive = true:',
    '- Route FIRST to Vet Center (every Vet Center has a dedicated MST specialist)',
    '- VA medical centers also have MST Coordinators — provide both options',
    '- Never route MST to general mental health without first mentioning the MST coordinator',
    '- VA provides free MST-related mental health care regardless of discharge status',
    '  (including OTH/BCD — one of the few VA services without discharge restrictions)',
    '',
    '**STEP 3 — DETECT SLEEP ISSUE**',
    'Sleep disorders and nightmares are highly prevalent in veterans and require',
    'targeted, evidence-based treatment (not generic advice).',
    '',
    'sleepIssue = true when input contains:',
    '"insomnia", "can\'t sleep", "not sleeping", "trouble sleeping",',
    '"sleep problem", "sleep issues", "sleep disorder", "nightmares",',
    '"waking up", "wake up screaming", "sleep disturbance", "no sleep",',
    '"up all night", "can\'t fall asleep", "can\'t stay asleep"',
    '',
    'IF sleepIssue = true:',
    '- Address sleep as a standalone treatment target, not just a symptom',
    '- CBT-I (Cognitive Behavioral Therapy for Insomnia) is the gold standard — available at VA',
    '- For nightmare disorder: Prazosin and Image Rehearsal Therapy (IRT) are evidence-based',
    '- VA\'s mobile app "CBT-i Coach" is a free, evidence-based sleep tool',
    '',
    '**STEP 4 — DETERMINE CARE TYPE**',
    'Route to the most appropriate care entry based on signals:',
    '',
    '- va-mental-health: Primary route for PTSD, flashbacks, nightmares, high-severity symptoms.',
    '  VA mental health services are available to all enrolled veterans at every VAMC.',
    '  Same-day mental health services available — no appointment needed for initial access.',
    '  PTSD programs: PTSD clinical teams, Cognitive Processing Therapy (CPT),',
    '  Prolonged Exposure (PE), EMDR, and residential PTSD programs.',
    '',
    '- vet-center: Route when veteran explicitly mentions Vet Center, wants counseling or',
    '  "someone to talk to", has readjustment or reintegration concerns, is an MST survivor,',
    '  or is dealing with bereavement / moral injury. Vet Centers are SEPARATE from VA Medical',
    '  Centers. They offer readjustment counseling, marriage and family counseling, and MST',
    '  services. No VA enrollment required. Free. Confidential. 300+ locations nationwide.',
    '  Eligible: combat veterans, MST survivors, bereaved family, drone/intelligence crews.',
    '',
    '- community-mental-health: Route when VA access is limited (distance, wait times),',
    '  veteran has a non-service-connected condition, or veteran is not yet enrolled in VA',
    '  healthcare. Community care under MISSION Act: 30-minute drive time / 20-day wait',
    '  time standards. Veteran can request community care referral from VA primary care.',
    '',
    '- needs-intake: Insufficient signals to determine care type. Veteran has indicated a',
    '  mental health need but specifics are unclear. Conduct light intake before routing.',
    '',
    '### ROUTING PRIORITY ORDER',
    '1. MST sensitivity → vet-center (with MST coordinator mention) FIRST',
    '2. PTSD / flashbacks / high severity → va-mental-health',
    '3. Counseling / "talk to someone" / vet center explicit → vet-center',
    '4. Mild symptoms / adjustment / stress → vet-center or community-mental-health',
    '5. Unknown / ambiguous → needs-intake',
    '',
    '### REQUIRED OUTPUT STRUCTURE',
    'Every response MUST open with:',
    '',
    '**MENTAL HEALTH ASSESSMENT**',
    '- Care type: [va-mental-health / vet-center / community-mental-health / needs-intake]',
    '- Severity level: [mild / moderate / high]',
    '- MST sensitive: [true / false]',
    '- Sleep issue: [true / false]',
    '',
    '**WHY THIS APPLIES**',
    '[1-2 sentences connecting the veteran\'s input to the care type and severity determination]',
    '',
    '**YOUR EXACT NEXT STEPS**',
    '1. [Specific action with program name, URL, or phone]',
    '2. [Specific action]',
    '3. [Specific action]',
    '',
    '### KEY REFERENCES — VA MENTAL HEALTH',
    '- Same-day mental health: Available at every VA Medical Center. Walk in and ask for',
    '  the Mental Health Walk-In Clinic — no appointment needed for first access.',
    '- VA Mental Health Services: va.gov/health-care/health-needs-conditions/mental-health/',
    '- PTSD Treatment Programs: va.gov/health-care/health-needs-conditions/mental-health/ptsd/',
    '  (Cognitive Processing Therapy, Prolonged Exposure, EMDR, residential programs)',
    '- National Center for PTSD: ptsd.va.gov — provider locator, self-assessment tools,',
    '  PTSD Coach app (free), and evidence-based treatment finder',
    '- PTSD Coach (mobile app): free, evidence-based symptom management tool',
    '- Make the Connection: maketheconnection.net — veteran mental health stories and resources',
    '',
    '### KEY REFERENCES — VET CENTERS',
    '- Vet Center locator: va.gov/find-locations/?facilityType=vet_center',
    '- Vet Center Call Center: 1-877-927-8387 (call to find nearest center or get immediate support)',
    '- Vet Centers: free, confidential, no VA enrollment required',
    '  Offer: individual/group counseling, couples/family counseling, MST counseling,',
    '  substance abuse referrals, bereavement counseling, readjustment support',
    '  Eligible: combat veterans, MST survivors, bereaved family, drone crews',
    '',
    '### KEY REFERENCES — MST',
    '- Every VA Medical Center has an MST Coordinator — free to contact, no claim required',
    '  Find yours: va.gov/health-care/health-needs-conditions/military-sexual-trauma/',
    '- MST care is FREE at VA regardless of discharge status (including OTH/BCD)',
    '- MST Coordinator at VA: ask for them by name at any VAMC or call 1-800-827-1000',
    '- Safe Helpline (RAINN — DoD): safehelpline.org or 1-877-995-5247 (24/7)',
    '- Vet Center MST specialists: every Vet Center has one — no enrollment required',
    '',
    '### KEY REFERENCES — SLEEP',
    '- CBT-I (Cognitive Behavioral Therapy for Insomnia): gold standard treatment.',
    '  Available at VA — ask your provider for a CBT-I referral. More effective than medication.',
    '- CBT-i Coach (free app): ptsd.va.gov/appvid/mobile/cbtIcoach_app.asp',
    '  Structured sleep diary, sleep education, and CBT-I exercises',
    '- Image Rehearsal Therapy (IRT): evidence-based treatment for chronic nightmares.',
    '  Available through VA PTSD clinics and Vet Centers.',
    '- Prazosin: FDA-approved medication for PTSD-related nightmares — ask your VA provider',
    '- National Sleep Foundation guidance: sleepfoundation.org/veterans',
    '',
    '### KEY REFERENCES — COMMUNITY CARE',
    '- MISSION Act Community Care: va.gov/communitycare',
    '  Eligibility: 30-min drive / 20-day wait time standard not met, or VA doesn\'t offer service',
    '- Request community care referral: Contact VA primary care provider or call 1-877-881-7618',
    '- Veterans\' mental health under MISSION Act includes therapy, psychiatry, and counseling',
    '',
    '### RULES',
    '- NEVER say "you may qualify" or "consider looking into." State what applies and why.',
    '- NEVER omit the MENTAL HEALTH ASSESSMENT block — required in every response.',
    '- NEVER attempt to address suicidal ideation — redirect to Veterans Crisis Line: 988, Press 1.',
    '- IF mstSensitive = true: ALWAYS mention both MST Coordinator (VAMC) and Vet Center.',
    '  Never make the veteran choose just one without explaining the distinction.',
    '- Vet Centers are SEPARATE from VA Medical Centers — never conflate them.',
    '- Sleep issues require specific treatment referrals (CBT-I, IRT) — not generic sleep tips.',
    '- Mental health care at VA does NOT require a service connection or a disability rating.',
    '  Any enrolled veteran can access VA mental health services.',
    '- OTH/BCD discharge veterans CAN access VA mental health care in many cases.',
    '  MST-related care is available regardless of discharge status — always state this.',
    '- End every response with: Veterans Crisis Line — 988, Press 1.',
    '',
    '[OPTIONS: PTSD treatment | I\'m having nightmares | I need someone to talk to | Vet Center near me | Sleep problems | Military sexual trauma | Anxiety and depression | Adjust to civilian life]'
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
     _detectMstSensitive
     Returns boolean. True when MST-related language is present.
     Routes immediately to vet-center with MST coordinator.
     MST care is available regardless of discharge status.
     ──────────────────────────────────────────────────────── */
  function _detectMstSensitive(corpus) {
    return _hasKeyword(corpus, [
      'military sexual trauma', 'mst',
      'sexual assault', 'sexually assaulted',
      'sexual harassment', 'sexually harassed',
      'raped', 'rape in the military', 'rape while serving',
      'assaulted in service', 'assaulted in the military',
      'unwanted sexual', 'sexual abuse', 'sexual violence',
      'harassed in the military', 'harassed while serving',
      'touched without consent', 'forced in the military'
    ]);
  }


  /* ────────────────────────────────────────────────────────
     _detectSleepIssue
     Returns boolean. True when sleep-related language is present.
     Triggers CBT-I and IRT guidance in next actions.
     ──────────────────────────────────────────────────────── */
  function _detectSleepIssue(corpus) {
    return _hasKeyword(corpus, [
      'insomnia', 'can\'t sleep', 'cannot sleep',
      'not sleeping', 'trouble sleeping', 'having trouble sleeping',
      'sleep problem', 'sleep problems', 'sleep issues',
      'sleep disorder', 'sleep disturbance', 'disturbed sleep',
      'nightmares', 'nightmare', 'wake up screaming',
      'waking up at night', 'wake up at night',
      'can\'t fall asleep', 'cannot fall asleep',
      'can\'t stay asleep', 'cannot stay asleep',
      'up all night', 'no sleep', 'barely sleeping',
      'restless', 'restless nights', 'night sweats'
    ]);
  }


  /* ────────────────────────────────────────────────────────
     _determineSeverityLevel
     Returns: mild | moderate | high
     Severity governs urgency of referral and treatment framing.
     ──────────────────────────────────────────────────────── */
  function _determineSeverityLevel(profile, userInput) {
    var corpus = _buildCorpus(profile, userInput);

    // ── High severity — PTSD, flashbacks, severe impairment ──
    if (_hasKeyword(corpus, [
      'ptsd', 'post-traumatic stress', 'post traumatic stress',
      'flashbacks', 'flashback', 'reliving it', 'reliving the event',
      'reliving the trauma', 'intrusive thoughts', 'intrusive memories',
      'hypervigilant', 'hypervigilance', 'can\'t leave the house',
      'can\'t function', 'cannot function', 'completely shut down',
      'panic attacks', 'panic attack', 'severe anxiety',
      'severe depression', 'severely depressed',
      'dissociation', 'dissociating', 'feel detached',
      'numbing out', 'emotionally numb',
      'combat trauma', 'combat stress', 'moral injury',
      'jump at every sound', 'jump at everything',
      'guard is always up', 'always on edge',
      'can\'t be around people', 'avoiding everything'
    ])) { return 'high'; }

    // ── Moderate severity — persistent symptoms, functional impact ──
    if (_hasKeyword(corpus, [
      'depressed', 'depression', 'feeling depressed',
      'anxiety', 'anxious', 'anxious a lot', 'constant anxiety',
      'angry all the time', 'rage', 'anger issues', 'anger problem',
      'irritable', 'irritability', 'mood swings',
      'nightmares', 'recurring nightmares', 'nightmare every night',
      'isolating', 'isolating myself', 'withdrawing', 'withdrawn',
      'drinking too much', 'drinking problem', 'alcohol problem',
      'using drugs', 'drug problem', 'self-medicating',
      'can\'t concentrate', 'can\'t focus', 'brain fog',
      'no motivation', 'lost interest', 'nothing feels good',
      'relationship problems', 'marriage problems', 'family stress',
      'having a hard time', 'struggling mentally', 'mental health issues'
    ])) { return 'moderate'; }

    // ── Mild severity — stress, adjustment, general help-seeking ──
    if (_hasKeyword(corpus, [
      'stressed', 'stress', 'overwhelmed',
      'adjusting', 'adjustment', 'civilian life', 'transition',
      'readjusting', 'readjustment', 'hard to adjust',
      'anxious sometimes', 'occasional anxiety', 'a little anxious',
      'not sleeping great', 'some sleep issues', 'tired all the time',
      'could use support', 'want to talk to someone',
      'counseling', 'therapy', 'therapist', 'talk therapy',
      'need help', 'want help', 'looking for help',
      'mental health', 'mental wellness', 'emotional support',
      'feeling off', 'not feeling like myself'
    ])) { return 'mild'; }

    // Default — return mild if corpus suggests any help-seeking
    return 'mild';
  }


  /* ────────────────────────────────────────────────────────
     _determineCareType
     Returns: va-mental-health | vet-center | community-mental-health
              | needs-intake
     MST sensitivity and explicit Vet Center language take priority.
     PTSD / high severity → va-mental-health.
     ──────────────────────────────────────────────────────── */
  function _determineCareType(profile, userInput, severityLevel, mstSensitive) {
    var corpus = _buildCorpus(profile, userInput);

    // ── MST sensitivity — vet-center first, always ──
    if (mstSensitive) {
      return 'vet-center';
    }

    // ── Explicit Vet Center request or readjustment counseling ──
    if (_hasKeyword(corpus, [
      'vet center', 'vet centers',
      'readjustment counseling', 'readjustment',
      'reintegration', 're-integration',
      'talk to someone', 'want to talk to someone',
      'need to talk', 'someone to talk to',
      'counseling', 'talk therapy', 'therapist',
      'bereavement', 'grief counseling', 'grieving',
      'moral injury'
    ])) {
      return 'vet-center';
    }

    // ── PTSD and high-severity trauma symptoms → VA mental health ──
    if (_hasKeyword(corpus, [
      'ptsd', 'post-traumatic stress', 'post traumatic stress',
      'flashbacks', 'flashback', 'reliving it', 'reliving the trauma',
      'intrusive thoughts', 'intrusive memories',
      'hypervigilant', 'hypervigilance',
      'panic attacks', 'panic attack',
      'dissociation', 'dissociating',
      'combat trauma', 'combat stress'
    ])) {
      return 'va-mental-health';
    }

    // ── High severity without explicit PTSD label → VA mental health ──
    if (severityLevel === 'high') {
      return 'va-mental-health';
    }

    // ── Moderate severity — VA mental health as primary ──
    if (severityLevel === 'moderate') {
      // Check for community care preference signals
      if (_hasKeyword(corpus, [
        'community care', 'outside provider', 'private therapist',
        'not enrolled in va', 'not in the va system',
        'va wait time', 'long wait', 'can\'t get in',
        'too far from va', 'no va near me'
      ])) {
        return 'community-mental-health';
      }
      return 'va-mental-health';
    }

    // ── Mild — vet center for adjustment / counseling needs ──
    if (severityLevel === 'mild') {
      if (_hasKeyword(corpus, [
        'adjusting', 'adjustment', 'civilian life', 'transition',
        'readjusting', 'reintegration', 'family counseling',
        'marriage counseling', 'couples counseling'
      ])) {
        return 'vet-center';
      }
      // Mild mental health — vet center or community
      if (_hasKeyword(corpus, [
        'community care', 'outside provider', 'private therapist',
        'not enrolled in va', 'not in the va system'
      ])) {
        return 'community-mental-health';
      }
      return 'vet-center';
    }

    // ── Insufficient signal ──
    return 'needs-intake';
  }


  /* ────────────────────────────────────────────────────────
     _buildReasoning
     Returns 1-3 sentences connecting profile and input
     signals to the care type and severity determination.
     ──────────────────────────────────────────────────────── */
  function _buildReasoning(careType, severityLevel, mstSensitive, sleepIssue, profile) {
    var parts = [];
    var rating = _getRating(profile);
    var era    = (profile.serviceEra || '').toLowerCase();

    // MST reasoning — always first if applicable
    if (mstSensitive) {
      parts.push(
        'Military Sexual Trauma (MST) language detected. ' +
        'VA provides free MST-related mental health care regardless of discharge status. ' +
        'Routing to Vet Center MST specialist and VA MST Coordinator — both options provided.'
      );
    }

    // Severity reasoning
    if (severityLevel === 'high') {
      parts.push(
        'High-severity symptoms detected (PTSD, flashbacks, panic attacks, or severe functional impairment). ' +
        'VA mental health — including PTSD-specific clinical teams and evidence-based treatment programs ' +
        '(CPT, PE, EMDR) — is the appropriate level of care.'
      );
    } else if (severityLevel === 'moderate') {
      parts.push(
        'Moderate-severity symptoms detected (depression, anxiety, recurring nightmares, or significant ' +
        'functional impact). VA mental health services provide same-day access and specialty care.'
      );
    } else {
      parts.push(
        'Mild symptoms or general help-seeking detected. ' +
        'Vet Center readjustment counseling provides confidential support without VA enrollment requirements.'
      );
    }

    // Sleep reasoning
    if (sleepIssue) {
      parts.push(
        'Sleep disturbance identified as a separate treatment target. ' +
        'CBT-I (Cognitive Behavioral Therapy for Insomnia) is the evidence-based first-line treatment — ' +
        'more effective than sleep medication and available at VA.'
      );
    }

    // Care type routing explanation (only if not already explained by severity/MST)
    if (careType === 'vet-center' && !mstSensitive && severityLevel !== 'high') {
      parts.push(
        'Vet Center is the correct first entry point — no VA enrollment required, ' +
        'free, confidential, and staffed with readjustment counseling specialists.'
      );
    }

    if (careType === 'community-mental-health') {
      parts.push(
        'Community mental health referral indicated — VA MISSION Act eligibility applies ' +
        'if drive time or wait time standards are not met.'
      );
    }

    // Rating context
    if (rating >= 50 && careType === 'va-mental-health') {
      parts.push(
        'At ' + rating + '% VA rating, veteran has Priority Group 1 or 2 access — ' +
        'copays are waived and specialty mental health referrals are prioritized.'
      );
    }

    return parts.join(' ');
  }


  /* ────────────────────────────────────────────────────────
     _buildNextActions
     Returns ordered, exact-action strings.
     MST and high-severity paths lead with immediate resources.
     ──────────────────────────────────────────────────────── */
  function _buildNextActions(careType, severityLevel, mstSensitive, sleepIssue, profile) {
    var actions = [];
    var rating  = _getRating(profile);

    // ════════════════════════════════════════════════════
    //  MST PATH — always first when mstSensitive = true
    // ════════════════════════════════════════════════════

    if (mstSensitive) {
      actions.push(
        'STEP 1 — Contact your VA MST Coordinator: Every VA Medical Center has a dedicated MST ' +
        'Coordinator who provides free, confidential support and connects you with MST-specialized ' +
        'care. No claim is required. No discharge restriction — OTH/BCD veterans are eligible. ' +
        'Find yours: va.gov/health-care/health-needs-conditions/military-sexual-trauma/ ' +
        'or call your nearest VAMC and ask for the MST Coordinator directly.'
      );
      actions.push(
        'STEP 2 — Vet Center MST Specialist (alternative or supplement to VA): ' +
        'Every Vet Center has a dedicated MST counselor. No VA enrollment required. Free. Confidential. ' +
        'Located separately from VA Medical Centers — often more accessible. ' +
        'Find your nearest Vet Center: va.gov/find-locations/?facilityType=vet_center ' +
        'or call 1-877-927-8387.'
      );
      actions.push(
        'STEP 3 — Safe Helpline (24/7 immediate support): ' +
        'Operated by RAINN under DoD. Safe Helpline provides confidential support specifically ' +
        'for MST survivors. Available any time: 1-877-995-5247 or safehelpline.org. ' +
        'Chat and phone options available. You do not have to be in crisis to call.'
      );
      if (sleepIssue) {
        actions.push(
          'SLEEP: Nightmares and insomnia frequently co-occur with MST. When you meet with your ' +
          'MST Coordinator or Vet Center counselor, specifically request a referral for ' +
          'Image Rehearsal Therapy (IRT) for nightmares and CBT-I for insomnia. ' +
          'Download the free VA CBT-i Coach app: ptsd.va.gov/appvid/mobile/cbtIcoach_app.asp'
        );
      }
      return actions;
    }

    // ════════════════════════════════════════════════════
    //  VA MENTAL HEALTH PATH
    // ════════════════════════════════════════════════════

    if (careType === 'va-mental-health') {

      actions.push(
        'STEP 1 — Walk into the Mental Health Walk-In Clinic at your nearest VA Medical Center: ' +
        'Same-day mental health services are available at every VAMC — no appointment needed for ' +
        'initial access. Tell them you are there for mental health support. They will complete an ' +
        'intake and get you connected with the right provider the same day. ' +
        'Find your nearest VAMC: va.gov/find-locations/'
      );

      if (severityLevel === 'high') {
        actions.push(
          'STEP 2 — Request a PTSD Clinical Team (PCT) referral: ' +
          'VA PTCs provide evidence-based trauma treatment including Cognitive Processing Therapy (CPT), ' +
          'Prolonged Exposure (PE), and EMDR. These are the most effective treatments for PTSD — ' +
          'not general counseling. Tell your intake provider specifically that you want a PCT referral. ' +
          'PTSD treatment programs: va.gov/health-care/health-needs-conditions/mental-health/ptsd/'
        );
        actions.push(
          'STEP 3 — Use the PTSD Coach app (free, evidence-based): ' +
          'Available between appointments for symptom management, coping tools, and tracking. ' +
          'Download: ptsd.va.gov — search "PTSD Coach" in app stores. ' +
          'Also visit maketheconnection.net for veteran-specific mental health stories and tools.'
        );
      } else {
        actions.push(
          'STEP 2 — Request a mental health intake appointment: ' +
          'If you are already enrolled in VA healthcare, contact your VA primary care provider ' +
          'or call your VAMC mental health clinic directly to schedule an intake. ' +
          'You do not need a service-connected condition to access VA mental health services — ' +
          'enrollment in VA healthcare is sufficient. ' +
          'VA Mental Health services: va.gov/health-care/health-needs-conditions/mental-health/'
        );
        actions.push(
          'STEP 3 — Secure messaging via My HealtheVet: ' +
          'Once connected with a VA provider, use myhealth.va.gov to message your care team, ' +
          'request medication refills, and track your appointments — available 24/7 between visits.'
        );
      }

      if (sleepIssue) {
        actions.push(
          'SLEEP REFERRAL — Request CBT-I: ' +
          'Tell your VA provider you specifically want a referral for Cognitive Behavioral Therapy ' +
          'for Insomnia (CBT-I) — not sleep medication. CBT-I is more effective than medication ' +
          'for chronic insomnia and is available at VA. ' +
          'For nightmares: ask for Image Rehearsal Therapy (IRT) or Prazosin discussion. ' +
          'Free app between sessions: CBT-i Coach — ptsd.va.gov/appvid/mobile/cbtIcoach_app.asp'
        );
      }

      if (rating >= 50) {
        actions.push(
          'PRIORITY ACCESS: At your ' + rating + '% VA rating, you are in Priority Group 1 or 2. ' +
          'Mental health copays are waived. Specialty referrals (psychiatry, PTSD clinical teams) ' +
          'are prioritized. Reference your rating when scheduling to confirm priority access.'
        );
      }

      return actions;
    }

    // ════════════════════════════════════════════════════
    //  VET CENTER PATH
    // ════════════════════════════════════════════════════

    if (careType === 'vet-center') {

      actions.push(
        'STEP 1 — Find your nearest Vet Center: ' +
        'va.gov/find-locations/?facilityType=vet_center or call 1-877-927-8387. ' +
        'Vet Centers are separate from VA Medical Centers. No VA enrollment required. ' +
        'Free. Confidential. Walk-ins accepted at most locations. ' +
        'Services include individual counseling, group therapy, couples and family counseling, ' +
        'readjustment support, and MST counseling.'
      );
      actions.push(
        'STEP 2 — Call the Vet Center Call Center for immediate connection: ' +
        '1-877-927-8387. They will connect you with your nearest Vet Center and can provide ' +
        'phone support while you wait for your first in-person appointment. ' +
        'If you are a combat veteran or MST survivor, you are eligible — no need to verify ' +
        'eligibility before calling.'
      );
      actions.push(
        'STEP 3 — If you also want VA healthcare enrollment (for broader care access): ' +
        'Vet Center counseling is separate from VA healthcare. If you want access to VA medical ' +
        'care, medications, or specialty services, you can enroll simultaneously via VA Form 10-10EZ: ' +
        'va.gov/health-care/apply or call 1-877-222-8387. Enrollment does not affect Vet Center access.'
      );

      if (sleepIssue) {
        actions.push(
          'SLEEP: Mention sleep difficulties at your Vet Center intake — counselors can provide ' +
          'CBT-I psychoeducation and refer to a VA medical provider for CBT-I therapy or ' +
          'nightmare-specific treatment (IRT, Prazosin). ' +
          'Free app: CBT-i Coach — ptsd.va.gov/appvid/mobile/cbtIcoach_app.asp'
        );
      }

      return actions;
    }

    // ════════════════════════════════════════════════════
    //  COMMUNITY MENTAL HEALTH PATH
    // ════════════════════════════════════════════════════

    if (careType === 'community-mental-health') {

      actions.push(
        'STEP 1 — Request a Community Care referral from VA: ' +
        'Under the MISSION Act, VA can authorize care with an outside provider if VA cannot ' +
        'meet the 30-minute drive time or 20-day wait time standard for mental health appointments. ' +
        'Contact your VA primary care provider or call 1-877-881-7618 to request a referral. ' +
        'More: va.gov/communitycare/'
      );
      actions.push(
        'STEP 2 — If not yet enrolled in VA healthcare: ' +
        'Enroll via VA Form 10-10EZ at va.gov/health-care/apply or call 1-877-222-8387. ' +
        'Once enrolled, you can access community care referrals for mental health. ' +
        'Enrollment is free. Most veterans with a period of active duty are eligible.'
      );
      actions.push(
        'STEP 3 — Vet Center as an immediate no-enrollment alternative: ' +
        'While waiting for community care referral processing, Vet Centers provide free, ' +
        'confidential counseling with no enrollment required. Find one at: ' +
        'va.gov/find-locations/?facilityType=vet_center or call 1-877-927-8387.'
      );

      if (sleepIssue) {
        actions.push(
          'SLEEP: Request that your community care referral specifically includes a CBT-I provider. ' +
          'CBT-I is the evidence-based first-line treatment for insomnia — more effective than ' +
          'medication. Free app bridge: CBT-i Coach — ptsd.va.gov/appvid/mobile/cbtIcoach_app.asp'
        );
      }

      return actions;
    }

    // ════════════════════════════════════════════════════
    //  NEEDS INTAKE
    // ════════════════════════════════════════════════════

    actions.push(
      'To connect you with the right mental health care, a bit more context helps. ' +
      'Are you experiencing: (1) PTSD or trauma symptoms (flashbacks, nightmares, hypervigilance), ' +
      '(2) depression or anxiety affecting daily life, or (3) stress or adjustment challenges ' +
      'you want to talk through? Each has a specific care path.'
    );
    actions.push(
      'While you determine your next step: Vet Centers provide free, confidential counseling ' +
      'with no VA enrollment required — a low-barrier starting point for any veteran seeking support. ' +
      'Find yours: va.gov/find-locations/?facilityType=vet_center or call 1-877-927-8387.'
    );

    if (sleepIssue) {
      actions.push(
        'SLEEP: Regardless of care path, download the free VA CBT-i Coach app now: ' +
        'ptsd.va.gov/appvid/mobile/cbtIcoach_app.asp. ' +
        'It provides structured sleep improvement tools you can use immediately ' +
        'while connecting with a provider.'
      );
    }

    return actions;
  }


  /* ────────────────────────────────────────────────────────
     _buildContextBlock
     Injects computed mental health assessment into the prompt.
     ──────────────────────────────────────────────────────── */
  function _buildContextBlock(result, profile) {
    var lines = [
      '## MENTAL HEALTH ASSESSMENT (system-computed — use these values verbatim in your response)'
    ];

    lines.push('Care type:       ' + result.careType);
    lines.push('Severity level:  ' + result.severityLevel);
    lines.push('MST sensitive:   ' + result.mstSensitive);
    lines.push('Sleep issue:     ' + result.sleepIssue);
    lines.push('Reasoning:       ' + result.reasoning);

    if (profile.serviceEra)      { lines.push('Service era:     ' + profile.serviceEra); }
    if (profile.dischargeStatus) { lines.push('Discharge:       ' + profile.dischargeStatus); }
    if (profile.vaRating !== null && profile.vaRating !== undefined) {
      lines.push('VA rating:       ' + profile.vaRating + '%');
    }
    if (profile.conditions && profile.conditions.length) {
      lines.push('Conditions:      ' + profile.conditions.join(', '));
    }

    lines.push('');
    lines.push('INSTRUCTION: Open your response with the MENTAL HEALTH ASSESSMENT block using');
    lines.push('the values above exactly as computed. Then explain WHY. Then list exact next steps.');
    lines.push('CRITICAL: If mstSensitive = true, lead with MST Coordinator and Vet Center.');
    lines.push('CRITICAL: Do NOT attempt to address suicidal ideation — redirect to 988, Press 1.');
    lines.push('End every response with: Veterans Crisis Line — 988, Press 1.');

    return lines.join('\n');
  }


  /* ────────────────────────────────────────────────────────
     Skill module
     ──────────────────────────────────────────────────────── */
  var MentalHealth = {

    id: 'mental-health',
    name: 'Mental Health (Non-Crisis)',
    description: 'Decision engine for veteran non-crisis mental health care. Determines care type (VA mental health, Vet Center, community care), severity level, MST sensitivity, and sleep issues. Routes PTSD to VA PTSD clinical teams, MST to Vet Center MST specialists, adjustment to Vet Centers. Does not handle suicidal ideation — that is handled by the crisis-support skill.',

    triggers: [
      // PTSD and trauma
      'ptsd', 'post-traumatic stress', 'post traumatic stress',
      'flashbacks', 'reliving it', 'combat stress', 'combat trauma',
      'intrusive thoughts', 'hypervigilant', 'hypervigilance',
      // Mood disorders
      'depression', 'depressed', 'anxiety', 'anxious',
      'panic attacks', 'panic attack', 'mood', 'mental health',
      // Sleep
      'nightmares', 'insomnia', 'can\'t sleep', 'not sleeping',
      'sleep problems', 'sleep issues',
      // MST
      'military sexual trauma', 'mst', 'sexual assault', 'sexual harassment',
      // Care-seeking
      'counseling', 'therapy', 'therapist', 'mental health care',
      'vet center', 'talk to someone', 'need to talk',
      'mental health services', 'mental health support',
      // Adjustment
      'adjusting to civilian life', 'readjustment', 'reintegration',
      'hard time adjusting', 'stressed out', 'overwhelmed'
    ],

    prompt: SKILL_PROMPT,

    phases: [
      { id: 'severity',  name: 'Assess severity level'           },
      { id: 'mst',       name: 'Detect MST sensitivity'          },
      { id: 'sleep',     name: 'Detect sleep issue'              },
      { id: 'care-type', name: 'Determine care type'             },
      { id: 'action',    name: 'Execute next steps'              }
    ],

    requiredFields: [],

    contextFields: ['dischargeStatus', 'serviceEra', 'vaRating', 'conditions'],

    /**
     * Execute the skill against the current context.
     * Runs full mental health pipeline and returns a
     * structured result injected into the system prompt.
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

      var corpus = [
        userInput || '',
        (profile.conditions || []).join(' ')
      ].join(' ').toLowerCase();

      // ── Step 1: Detect MST sensitivity ────────────────
      var mstSensitive = _detectMstSensitive(corpus);

      // ── Step 2: Detect sleep issue ─────────────────────
      var sleepIssue = _detectSleepIssue(corpus);

      // ── Step 3: Determine severity level ──────────────
      var severityLevel = _determineSeverityLevel(profile, userInput);

      // ── Step 4: Determine care type ────────────────────
      var careType = _determineCareType(profile, userInput, severityLevel, mstSensitive);

      // Phase R6.8: skip intake if session already has MH symptoms — override needs-intake
      if (careType === 'needs-intake') {
        for (var _mhi = 0; _mhi < _ctxSession.symptoms.length; _mhi++) {
          if (_ctxSession.symptoms[_mhi].category === 'mental-health') {
            careType = 'va-mental-health';
            console.log('[AIOS][SKILL][MENTAL_HEALTH] Context override: needs-intake → va-mental-health' +
              ' | session symptom: ' + _ctxSession.symptoms[_mhi].token);
            break;
          }
        }
      }

      // ── Step 5: Build reasoning ───────────────────────
      var reasoning = _buildReasoning(careType, severityLevel, mstSensitive, sleepIssue, profile);

      // ── Step 6: Build next actions ────────────────────
      var nextActions = _buildNextActions(careType, severityLevel, mstSensitive, sleepIssue, profile);

      // ── Assemble structured result ────────────────────
      var mentalHealthResult = {
        careType:      careType,
        severityLevel: severityLevel,
        mstSensitive:  mstSensitive,
        sleepIssue:    sleepIssue,
        reasoning:     reasoning,
        nextActions:   nextActions
      };

      // ── Flag unknown context fields ───────────────────
      var unknown = [];
      if (!profile.dischargeStatus) { unknown.push('dischargeStatus'); }
      if (!profile.serviceEra)      { unknown.push('serviceEra'); }
      if (profile.vaRating === null || profile.vaRating === undefined) { unknown.push('vaRating'); }

      // ── Build data payload ────────────────────────────
      var data = {
        canRespond:         true,
        mentalHealthResult: mentalHealthResult
      };

      if (unknown.length) { data.unknownFields = unknown; }

      // ── Eligibility engine integration ────────────────
      var Elig = window.AIOS && window.AIOS.Eligibility;
      if (Elig && Elig.hasUsefulSignal(profile)) {
        var scores = Elig.score(profile);
        if (scores.MENTAL_HEALTH !== undefined) { data.mentalHealthScore = scores.MENTAL_HEALTH; }
      }

      // ── Chain to next-action-planner after depth ──────
      if (historyLen >= 3) {
        data.chain = {
          nextSkill:     'next-action-planner',
          label:         'Build your complete mental health action plan',
          sendText:      'Build me a complete mental health action plan',
          missionType:   'mental_health',
          missionUpdate: {
            currentStep: 'Identify care type and immediate access point',
            nextStep:    'Execute care connection and ongoing support plan'
          }
        };
      }

      // ── Combine context block into full prompt ────────
      var contextBlock = _buildContextBlock(mentalHealthResult, profile);
      var fullPrompt   = SKILL_PROMPT + '\n\n' + contextBlock;

      return { prompt: fullPrompt, data: data };
    }
  };

  window.AIOS = window.AIOS || {};
  window.AIOS.Skills = window.AIOS.Skills || {};
  window.AIOS.Skills['mental-health'] = MentalHealth;

})();
