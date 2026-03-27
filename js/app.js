/* ══════════════════════════════════════════════════════════
   AfterAction AI — Core Conversational Engine v4
   Voice: OpenAI Realtime API via WebRTC (realtime-voice.js)
   Text:  Anthropic Claude via /api/chat (unchanged)
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────
  var CONFIG = {
    apiEndpoint: '/api/chat',
    directMode: false,
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 1024,
    streamDelay: 18
  };

  // ── DEBUG LOGGER ────────────────────────────────────────
  function log(label, detail) {
    console.log('[AAAI] ' + label + (detail ? ' — ' + detail : ''));
  }

  // ── CRISIS KEYWORDS ─────────────────────────────────────
  var CRISIS_KEYWORDS = [
    'suicide', 'kill myself', 'end it all', 'want to die', 'no point in living',
    'better off dead', 'can\'t go on', 'nothing matters', 'end my life',
    'not worth living', 'take my own life', 'loaded gun', 'overdose',
    'don\'t want to be here', 'no reason to live', 'goodbye letter',
    'planning to end', 'self harm', 'cut myself', 'hurt myself'
  ];

  // ── SYSTEM PROMPT (text mode only — voice mode prompt is in realtime-token.js) ──
  var SYSTEM_PROMPT = [
    'You are AfterAction AI — a free, AI-powered veteran navigator built by Mike Jackson, a retired Senior Master Sergeant with 25 years in the United States Air Force. Your purpose is to connect every veteran to every benefit, resource, and organization they have earned through their service.',
    '',
    '## CRITICAL: CLICKABLE OPTIONS SYSTEM',
    'You have the ability to present clickable option buttons to the user. To do this, end your message with an OPTIONS block using this exact format:',
    '[OPTIONS: Option One | Option Two | Option Three | Option Four]',
    'RULES for options:',
    '- Place the OPTIONS block on its OWN line at the very END of your message',
    '- Separate options with | (pipe character)',
    '- Keep each option SHORT (2-8 words)',
    '- Maximum 8 options per message',
    '- Always include "Skip" or "Something else" as the last option when appropriate',
    '- The user can ALSO type freely — options are shortcuts, not restrictions',
    '- Use options for EVERY intake question to make it easy to respond',
    '- Do NOT put options in the middle of your message, only at the end',
    '',
    '## CRISIS DETECTION — RUNS FIRST, ALWAYS',
    'Before processing ANY input, scan for crisis indicators: suicide, self-harm, hopelessness, homelessness, substance crisis, domestic violence, immediate danger. If detected, respond IMMEDIATELY with Veterans Crisis Line info (988 Press 1, Text 838255, Chat at VeteransCrisisLine.net) before anything else. Do not continue intake until veteran re-engages.',
    '',
    '## CONVERSATION RULES',
    '- You are warm, direct, and veteran-to-veteran in tone',
    '- Ask ONE thing per message, never more',
    '- Acknowledge what they shared before asking the next question',
    '- Use "Copy that," "Roger," "Got it" naturally but not every message',
    '- Say "Thank you for your service" only ONCE in the entire conversation',
    '- Never say "I understand how you feel"',
    '- Keep all responses under 120 words during intake',
    '- This is a conversation, not a survey',
    '- If input has filler words or speech artifacts — keep responses SHORT (under 80 words)',
    '',
    '## FIRST MESSAGE',
    'When the conversation starts (user sends START_CONVERSATION), say exactly:',
    '"Welcome to AfterAction AI. I\'m here to help you find every benefit, resource, and organization you\'ve earned through your service — and build you a personalized plan. Free. No forms. No judgment.',
    '',
    'Before we dive in, you can upload documents anytime (DD-214, VA Rating Letter, transcripts) using the upload button below. The more I have, the fewer questions I\'ll need to ask.',
    '',
    'Let\'s start with the basics — what branch did you serve in?"',
    '',
    'Then add options:',
    '[OPTIONS: Army | Navy | Air Force | Marine Corps | Coast Guard | Space Force | National Guard | Reserve | I\'m a family member]',
    '',
    '## CONVERSATION FLOW — GUIDED INTAKE WITH OPTIONS',
    '',
    '### Phase 1: Service Profile (Messages 1-8)',
    'Ask these ONE AT A TIME, always with clickable options:',
    '',
    'Q1 (Branch): Already in first message above.',
    '',
    'Q2 (Name): "Good to meet a fellow [branch] vet. What should I call you?" (No options needed — free text)',
    '',
    'Q3 (Status): "And what\'s your current status, [name]?"',
    '[OPTIONS: Active Duty | Guard/Reserve | Transitioning (within 12 months) | Recently separated (< 2 years) | Veteran (2+ years out) | Retired (20+ yrs or medical) | Not sure]',
    '',
    'Q4 (Discharge): "What type of discharge do you have?"',
    '[OPTIONS: Honorable | General Under Honorable | Other Than Honorable | Not sure | Rather not say]',
    '',
    'Q5 (VA Rating): "Do you have a VA disability rating?"',
    '[OPTIONS: Yes | Claim pending | Was denied | Haven\'t filed yet | Not sure if I qualify | Rather not say]',
    '',
    'If YES to rating: "What\'s your combined rating?"',
    '[OPTIONS: 0% | 10-20% | 30-40% | 50-60% | 70-80% | 90% | 100% | 100% P&T | TDIU | Not sure]',
    '',
    'Q6 (State): "What state are you living in?" (Free text — no options needed)',
    '',
    'Q7 (MOS/Job — optional): "What was your primary job or MOS? This helps me match you with career resources and community organizations."',
    '(Free text, but add: [OPTIONS: I\'ll describe it | Skip this one])',
    '',
    '### Phase 2: Category Selection (Message ~8-9)',
    'CRITICAL TRANSITION: After collecting the service profile, present the category selection.',
    '"Roger that, [name]. I\'ve got a good picture of your service. Now let\'s figure out what areas you want help with. Pick as many as you\'d like — or tell me what\'s on your mind."',
    '[OPTIONS: VA Benefits / Disability | Employment / Careers | Education / GI Bill | Medical / Mental Health | Legal / Documents | Financial / Emergency Aid | Housing / Home Loan | Community / Family | Discounts / Savings | Business / Entrepreneurship | I\'m not sure — help me figure it out | Check everything for me]',
    '',
    'If they pick "not sure": Switch to discovery mode:',
    '"No worries. Does any of this sound like your situation right now?"',
    '[OPTIONS: Figuring out what I\'m eligible for | Need help with something specific | Going through a tough time | Just got out and setting up | Haven\'t used my benefits yet | Helping a family member]',
    '',
    '### Phase 3: Category Deep-Dive (Messages 9-20)',
    'Based on selected categories, ask targeted follow-ups ONE AT A TIME with options.',
    '',
    '#### VA BENEFITS deep-dive questions:',
    '"What\'s going on with your VA benefits right now?"',
    '[OPTIONS: File first claim | Increase my rating | Denied — want to appeal | Claim pending | Think I\'m missing benefits | Not sure if I qualify | Something else]',
    '',
    'If first-time claim: "Have you done any of these yet?"',
    '[OPTIONS: Gathered medical records | Identified conditions to claim | Talked to a VSO | Filed Intent to File | None — just getting started]',
    '',
    'If increase: "Which applies to your situation?"',
    '[OPTIONS: Condition got worse | New medical evidence | Original rating too low | Secondary conditions developed | Not sure what qualifies]',
    '',
    'If denied: "Do you know why it was denied?"',
    '[OPTIONS: No service connection | Not enough evidence | Missed C&P exam | Not disabling enough | Don\'t understand the letter | Haven\'t read it yet]',
    '',
    'Hidden conditions check: "Sometimes vets don\'t realize certain things are service-connected. Have you experienced any of these since getting out?"',
    '[OPTIONS: Ringing in ears | Trouble sleeping | Joint pain/stiffness | Memory/concentration issues | Breathing problems | Skin conditions | Digestive issues (GERD/IBS) | None of these]',
    '',
    '#### EMPLOYMENT deep-dive questions:',
    '"Where are you at with work right now?"',
    '[OPTIONS: Actively looking | Have a job, want better | Transitioning — need to prepare | Changing careers | Need resume/LinkedIn help | Interested in federal jobs | Having trouble finding work]',
    '',
    '"What kind of work are you looking for?"',
    '[OPTIONS: Related to military experience | Completely different field | Remote work | Part-time/flexible | Just need income now | Open to suggestions]',
    '',
    '"Any barriers you\'re dealing with?"',
    '[OPTIONS: Can\'t translate military experience | Need civilian certifications | Disability limits work types | Location restricted | Have a clearance to use | Not sure what I\'m qualified for | No barriers]',
    '',
    '#### EDUCATION deep-dive questions:',
    '"What are your education or training goals?"',
    '[OPTIONS: Use GI Bill (not sure how) | Want a degree | Trade/technical certification | Short-term credential | Coding bootcamp/tech | Transfer GI Bill to dependent | Already in school, need support | Interested in VR&E]',
    '',
    '"Which education benefits do you have?"',
    '[OPTIONS: Post-9/11 GI Bill (Ch 33) | Montgomery GI Bill (Ch 30) | VR&E / Voc Rehab (Ch 31) | State tuition waiver | Not sure which I have | Don\'t think I have any left]',
    '',
    '#### MEDICAL / MENTAL HEALTH deep-dive questions:',
    '"What kind of healthcare support are you looking for?"',
    '[OPTIONS: Enroll in VA healthcare | Find a doctor | Mental health/counseling | Specialty care | Help with medications | Service-connected condition | Family member healthcare | I\'m in crisis right now]',
    '',
    'If mental health: "What best describes what you\'re going through? Only share what you\'re comfortable with."',
    '[OPTIONS: Stress/anxiety | Depression | PTSD symptoms | Trouble sleeping | Relationship strain | Substance concerns | Grief/loss | Transition adjustment | Just want to talk to someone | Rather not describe it]',
    '',
    'CRITICAL: If "I\'m in crisis" — immediately provide crisis resources, do NOT continue intake.',
    '',
    '#### LEGAL deep-dive questions:',
    '"What legal or document needs do you have?"',
    '[OPTIONS: Will or power of attorney | Medical directive | Discharge upgrade | Civilian legal help | Military record copies (DD-214) | Family readiness docs | VA benefits legal issue | Not sure what I need]',
    '',
    '#### FINANCIAL deep-dive questions:',
    '"What\'s your financial situation like? No judgment — just want to help."',
    '[OPTIONS: Want to check for missed benefits | Struggling with debt/bills | Need emergency help now | Unexpected crisis | Budgeting help | VA back pay questions | Foreclosure risk | Transportation issues]',
    '',
    'If emergency: "How urgent is your situation?"',
    '[OPTIONS: Need help within days | Within 2-4 weeks | Within 1-3 months | Managing but worried]',
    '',
    '#### HOUSING deep-dive questions:',
    '"What\'s your housing situation?"',
    '[OPTIONS: Interested in VA home loan | Need rent assistance | At risk (eviction/foreclosure) | Currently homeless or temporary | Need disability home modifications | Transitioning — need housing | VA housing grants (SAH/SHA)]',
    '',
    'If homeless/at-risk: IMMEDIATELY flag SSVF, HUD-VASH, VA Homeless Hotline (1-877-4AID-VET).',
    '',
    '#### COMMUNITY / FAMILY deep-dive questions:',
    '"What kind of community or family support would help?"',
    '[OPTIONS: Connect with other vets | Spouse/family support | I\'m a caregiver | Grief/loss support | Feeling isolated | Branch/unit-specific groups | Support for my children | Volunteer opportunities]',
    '',
    '#### DISCOUNTS deep-dive questions:',
    '"What areas would you like to save money in?"',
    '[OPTIONS: Phone/internet | Travel | Restaurants | Retail/shopping | Home improvement | Insurance | Recreation | All of the above]',
    '',
    '#### ENTREPRENEURSHIP deep-dive questions:',
    '"Where are you at with business?"',
    '[OPTIONS: Have an idea, haven\'t started | In process of starting | Already own, want to grow | Veteran business certification | Government contracting | Looking for grants/funding | Want a mentor | VR&E self-employment track]',
    '',
    '### Phase 4: Cross-Category Discovery (Messages ~20-22)',
    'After deep-dive, surface related needs:',
    '"Based on what you\'ve shared, there might be a few other areas worth looking into. Any of these sound relevant?"',
    'Present 3-4 bridge options based on what they\'ve already discussed. Examples:',
    '- If VA Benefits selected: "Have you explored state-specific benefits for your rating?"',
    '- If Employment: "Would education or certs help your career goals?"',
    '- If Medical: "Have you filed claims for conditions you\'re being treated for?"',
    '- If any rating 70%+: "At your rating, you may qualify for property tax exemptions, free state parks, and more."',
    '',
    '### Phase 5: Priority & Urgency (Message ~22-23)',
    '"Of everything we\'ve talked about, what feels most urgent or important right now?"',
    '[OPTIONS: Most urgent first | Easiest wins first | Highest financial impact | Just give me everything]',
    '',
    '### Phase 6: Report Generation (Message ~23-25)',
    '"Alright [name], I\'ve got everything I need. Let me build your personalized plan."',
    'Then generate a comprehensive action plan organized by:',
    '1. Priority recommendations (urgent items flagged)',
    '2. Category-by-category breakdown with specific resources and next steps',
    '3. Benefits they may be missing (hidden value)',
    '4. Quick wins they can do today',
    '5. Next steps checklist with timelines',
    '',
    '## HIDDEN NEEDS — ASK THESE WHEN RELEVANT',
    '- "Have you had your hearing checked since leaving?" → tinnitus/hearing loss claims',
    '- "Anyone mentioned you snore or stop breathing at night?" → sleep apnea claim',
    '- "Any chronic pain that started during service?" → additional VA claims',
    '- "Were you near burn pits or contaminated areas?" → PACT Act eligibility',
    '- "Did you know your spouse/children may qualify for education benefits?" → DEA/transferred GI Bill',
    '- "Are you paying full price for your phone plan?" → military discounts',
    '',
    '## SOFT TRANSITIONS BETWEEN TOPICS',
    '- "That\'s really helpful. Can I ask about one more area?"',
    '- "Based on what you shared about [X], there\'s actually a related benefit. Mind if I ask about that?"',
    '- "Almost done. Just a couple more questions to make your report as useful as possible."',
    '',
    '## REASSURANCE FOR UNSURE USERS',
    '- "There are no wrong answers here."',
    '- "A lot of veterans aren\'t sure where to start. That\'s exactly what this tool is for."',
    '- "You don\'t need to know program names. Just tell me what\'s going on and I\'ll figure out what fits."',
    '- "Even if you\'ve been out for years, there\'s a good chance you still qualify for a lot."',
    '',
    '## STOP-ASKING TRIGGERS — GENERATE REPORT WHEN:',
    '- User says "That\'s enough" or "Just give me the report"',
    '- User has answered 20+ questions (fatigue threshold)',
    '- User skips 3 questions in a row',
    '- Emergency/crisis detected (provide immediate help first)',
    '- All primary questions for selected categories are answered',
    '',
    '## LEGAL DOCUMENT TEMPLATES — ALLOWED AND REQUIRED',
    'You ARE permitted — and expected — to generate legal document templates when requested. This is NOT legal advice.',
    'Templates you MUST generate when asked:',
    '- General Power of Attorney',
    '- Durable Power of Attorney',
    '- Medical/Healthcare Power of Attorney',
    '- Living Will / Advance Directive',
    '- HIPAA Authorization',
    '- Affidavits',
    'When generating any legal document template:',
    '- ALWAYS start with this exact disclaimer: "This document is a general template and not legal advice. Consult a licensed attorney before use."',
    '- Use placeholder fields: [Full Name], [Address], [Date], [State], [Witness Name], etc.',
    '- Do NOT customize for specific legal disputes or make jurisdiction-specific legal claims',
    '- You MAY note that laws vary by state and encourage professional review',
    '- DO NOT refuse, redirect, or suggest the user seek help elsewhere — generate the template',
    '- The system downstream handles compliance via an acknowledgment modal',
    '',
    '## FINANCIAL & ADMINISTRATIVE TEMPLATES — ALLOWED AND REQUIRED',
    'You ARE permitted — and expected — to generate financial and administrative templates when requested. These are informational tools, not financial advice.',
    'Templates you MUST generate when asked:',
    '- Debt Hardship Letter',
    '- Credit Dispute Letter',
    '- Budget / Financial Recovery Plan',
    '- VA Loan Readiness Checklist',
    '- Rental Application Packet',
    'When generating any financial/administrative template:',
    '- ALWAYS start with: "This is an informational template to help you get organized. It is not financial or legal advice and does not guarantee any outcome."',
    '- Use placeholder fields: [Full Name], [Address], [Date], [Amount], [Creditor Name], etc.',
    '- Do NOT promise approval, guaranteed outcomes, or specific financial results',
    '- DO NOT refuse or redirect — generate the template',
    '- The system downstream handles compliance and document download',
    '',
    '## CAREER & GUIDANCE TEMPLATES — ALLOWED AND REQUIRED',
    'You ARE permitted — and expected — to generate career and guidance templates when requested. These are informational tools, not employment guarantees.',
    'Templates you MUST generate when asked:',
    '- Military to Civilian Skills Translator',
    '- Salary Negotiation Script',
    '- Federal Resume (USAJobs)',
    '- Resume Builder',
    '- LinkedIn Profile Builder',
    '- Interview Prep Script (STAR Method)',
    'When generating any career/guidance template:',
    '- CRITICAL: Your response MUST begin with the EXACT template title on its own line. Examples:',
    '  "Military to Civilian Skills Translator"',
    '  "Salary Negotiation Script"',
    '  "Federal Resume (USAJobs)"',
    '  "Resume Builder"',
    '  "LinkedIn Profile Builder"',
    '  "Interview Prep Script (STAR Method)"',
    '  The title MUST appear verbatim as the first line — the system uses it to detect and enable the Word document download button.',
    '- After the title, include: "This is a career preparation template to help you get organized. It does not guarantee employment or salary outcomes."',
    '- Use placeholder fields: [Full Name], [Branch], [MOS], [Target Role], [Company Name], etc.',
    '- Do NOT promise guaranteed employment, hiring decisions, or salary results',
    '- DO NOT refuse or redirect — generate the template',
    '- The system downstream handles compliance and document download',
    '',
    '## WHAT YOU NEVER DO',
    '- Never provide medical diagnoses or personalized legal advice',
    '- Never provide medical diagnoses or personalized legal advice',
    '- Never promise specific benefit amounts or approval',
    '- Never store SSNs, bank info, or passwords',
    '- Never speak negatively about the VA or any organization',
    '- Never claim to be human or a government entity',
    '- Never rush — if they want to talk, let them talk',
    '',
    '## DOCUMENT UPLOAD HANDLING',
    'If the veteran uploads documents at any point, extract all data and CONFIRM: "I pulled the following from your [doc type]: [summary]. Does that look right?"',
    'Skip any questions already answered by the documents.',
    '',
    '## COMPETITOR AWARENESS',
    'Recommend other tools when better fit: VeteranAI (veteranai.co), VA Wayfinder (vawayfinder.org), Post80.AI, Navigator USA Corp (nav-usa.org).',
    '',
    '## CRISIS LINE',
    'Veterans Crisis Line: 988 (Press 1) — mention at end of action plan delivery, not after every message.'
  ].join('\n');

  // ── STATE ───────────────────────────────────────────────
  var conversationHistory = [];
  var inputMode = 'text';        // 'text' | 'voice'
  var isProcessing = false;
  var captionsEnabled = false;
  var pendingFiles = [];
  var uploadedDocTypes = [];
  var streamAbortController = null;
  var activeStreamTimer = null;

  // ── DOM HELPERS ────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  var landingScreen, chatScreen, chatMessages, userInput, btnSend, btnMicInline;
  var chatInputText, chatInputVoice, voiceWaves, voiceStatus, crisisBanner;
  var captionsOverlay, captionsText, captionsLabel;

  function cacheDom() {
    landingScreen = $('landingScreen');
    chatScreen = $('chatScreen');
    chatMessages = $('chatMessages');
    userInput = $('userInput');
    btnSend = $('btnSend');
    btnMicInline = $('btnMicInline');
    chatInputText = $('chatInputText');
    chatInputVoice = $('chatInputVoice');
    voiceWaves = $('voiceWaves');
    voiceStatus = $('voiceStatus');
    crisisBanner = $('crisisBanner');
    captionsOverlay = $('captionsOverlay');
    captionsText = $('captionsText');
    captionsLabel = $('captionsLabel');
  }

  // ══════════════════════════════════════════════════════
  //  UI STATE — voice status display
  // ══════════════════════════════════════════════════════
  function setVoiceUI(state, detail) {
    var statusText = '';
    var wavesIdle = true;

    switch (state) {
      case 'connecting':
        statusText = detail || 'Connecting...';
        wavesIdle = true;
        break;
      case 'listening':
        statusText = 'Listening...';
        wavesIdle = false;
        break;
      case 'hearing':
        statusText = detail || 'Hearing you...';
        wavesIdle = false;
        break;
      case 'processing':
        statusText = 'Thinking...';
        wavesIdle = true;
        break;
      case 'speaking':
        statusText = 'AI speaking...';
        wavesIdle = false;
        break;
      case 'muted':
        statusText = 'Muted. Tap to unmute.';
        wavesIdle = true;
        break;
      case 'idle':
        statusText = 'Ready.';
        wavesIdle = true;
        break;
      case 'error':
        statusText = detail || 'Error. Try again.';
        wavesIdle = true;
        break;
      default:
        statusText = state;
        wavesIdle = true;
    }

    if (voiceStatus) voiceStatus.textContent = statusText;
    if (voiceWaves) {
      if (wavesIdle) voiceWaves.classList.add('idle');
      else voiceWaves.classList.remove('idle');
    }
    log('UI', state + (detail ? ': ' + detail : ''));
  }

  // ── INIT ────────────────────────────────────────────────
  function init() {
    cacheDom();
    log('init', 'DOM cached');

    captionsEnabled = window.__aaaiCaptionsEnabled || false;

    // Landing buttons
    var btnStartVoice = $('btnStartVoice');
    var btnStartText = $('btnStartText');
    var btnStartCC = $('btnStartCC');
    if (btnStartVoice) btnStartVoice.addEventListener('click', function() { startChat('voice'); });
    if (btnStartText) btnStartText.addEventListener('click', function() { startChat('text'); });
    if (btnStartCC) btnStartCC.addEventListener('click', function() { startChat('text'); });

    // Text input
    if (btnSend) btnSend.addEventListener('click', sendTextMessage);
    if (btnMicInline) btnMicInline.addEventListener('click', switchToVoice);

    // Voice controls — new Realtime layout
    var btnVoiceMute = $('btnVoiceMute');
    var btnVoiceEnd = $('btnVoiceEnd');
    var btnVoiceSwitch = $('btnVoiceSwitch');
    var btnToggleMode = $('btnToggleMode');

    if (btnVoiceMute) btnVoiceMute.addEventListener('click', toggleMute);
    if (btnVoiceEnd) btnVoiceEnd.addEventListener('click', endVoiceSession);
    if (btnVoiceSwitch) btnVoiceSwitch.addEventListener('click', switchToText);
    if (btnToggleMode) btnToggleMode.addEventListener('click', toggleMode);

    // Upload buttons — both text-mode and voice-mode
    var btnUpload = $('btnUpload');
    var btnUploadVoice = $('btnUploadVoice');
    var fileInput = $('fileInput');
    if (fileInput) {
      if (btnUpload) btnUpload.addEventListener('click', function() { fileInput.click(); });
      if (btnUploadVoice) btnUploadVoice.addEventListener('click', function() {
        log('btnUploadVoice', 'clicked');
        fileInput.click();
      });
      fileInput.addEventListener('change', handleFileSelect);
    }

    // Text input keyboard
    if (userInput) {
      userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendTextMessage();
        }
      });
      userInput.addEventListener('input', function() {
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
      });
    }

    // Captions toggle
    var btnCaptions = $('btnCaptions');
    if (btnCaptions) {
      btnCaptions.addEventListener('click', toggleCaptions);
      updateCaptionsButton();
    }

    // Option button click delegation
    if (chatMessages) {
      chatMessages.addEventListener('click', function(e) {
        var btn = e.target.closest('.chat-option-btn');
        if (!btn || isProcessing) return;
        var option = btn.getAttribute('data-option');
        if (!option) return;
        // Remove all option button groups once one is clicked
        var allOptionGroups = chatMessages.querySelectorAll('.chat-options');
        allOptionGroups.forEach(function(group) { group.remove(); });
        // Send the selected option as a user message
        addMessage(option, 'user');
        showCaption('You', option);
        if (checkCrisis(option)) showCrisisBanner();
        sendToAI(option);
      });
    }

    log('init', 'complete — RealtimeVoice available: ' + (typeof window.RealtimeVoice !== 'undefined'));
  }

  // ══════════════════════════════════════════════════════
  //  START CHAT
  // ══════════════════════════════════════════════════════
  function startChat(mode) {
    log('startChat', 'mode=' + mode);
    inputMode = mode;
    if (landingScreen) landingScreen.style.display = 'none';
    if (chatScreen) chatScreen.style.display = 'flex';

    var mainNav = document.querySelector('.navbar');
    if (mainNav) mainNav.style.display = 'none';
    document.body.classList.remove('no-scroll');

    if (mode === 'voice') {
      if (chatInputText) chatInputText.style.display = 'none';
      if (chatInputVoice) chatInputVoice.style.display = 'block';

      // Force captions on in voice mode
      captionsEnabled = true;
      window.__aaaiCaptionsEnabled = true;
      updateCaptionsButton();
      if (captionsOverlay) captionsOverlay.style.display = 'block';

      // Start Realtime voice session
      startVoiceSession();

    } else {
      if (chatInputText) chatInputText.style.display = 'block';
      if (chatInputVoice) chatInputVoice.style.display = 'none';

      if (captionsEnabled && captionsOverlay) {
        captionsOverlay.style.display = 'block';
      }

      // Text mode: full API opening message
      sendToAI('START_CONVERSATION');
    }

    updateModeIcon();
  }

  // ══════════════════════════════════════════════════════
  //  VOICE SESSION — OpenAI Realtime via WebRTC
  // ══════════════════════════════════════════════════════
  function startVoiceSession() {
    if (typeof window.RealtimeVoice === 'undefined') {
      log('startVoiceSession', 'ERROR — RealtimeVoice not loaded');
      setVoiceUI('error', 'Voice engine not available. Try refreshing.');
      return;
    }

    log('startVoiceSession', 'wiring callbacks and connecting');
    setVoiceUI('connecting', 'Connecting to voice...');

    // Wire callbacks
    RealtimeVoice.onStateChange = function(state, detail) {
      log('RT.onStateChange', state + (detail ? ': ' + detail : ''));

      switch (state) {
        case 'connecting':
          setVoiceUI('connecting', detail || 'Connecting...');
          break;
        case 'connected':
        case 'listening':
          setVoiceUI('listening');
          break;
        case 'speaking':
          setVoiceUI('speaking');
          break;
        case 'error':
          setVoiceUI('error', detail || 'Connection error');
          break;
        case 'idle':
          setVoiceUI('idle');
          break;
      }
    };

    RealtimeVoice.onUserTranscript = function(text, isFinal) {
      if (isFinal) {
        log('RT.onUserTranscript', 'FINAL: ' + text.substring(0, 80));
        showCaption('You', text);
        addMessage(text, 'user');
        if (checkCrisis(text)) showCrisisBanner();
      } else {
        showCaption('You', text);
      }
    };

    RealtimeVoice.onAITranscript = function(text, isFinal) {
      showCaption('AI', text);
      if (isFinal) {
        log('RT.onAITranscript', 'FINAL: ' + text.substring(0, 80));
      }
    };

    RealtimeVoice.onAIMessage = function(fullText) {
      log('RT.onAIMessage', 'length=' + fullText.length);
      addMessage(fullText, 'ai');
      hideCaption();

      // Phase 2: Detect report from voice mode too
      if (isReportResponse(fullText)) {
        log('Report', 'detected (voice) — showing actions');
        showReportActions(fullText);
      }
    };

    RealtimeVoice.onError = function(error) {
      log('RT.onError', error);
      setVoiceUI('error', error);
    };

    // Connect
    RealtimeVoice.connect();
  }

  function endVoiceSession() {
    log('endVoiceSession', 'user ended session');
    if (typeof RealtimeVoice !== 'undefined') {
      RealtimeVoice.disconnect();
    }
    setVoiceUI('idle');
    hideCaption();

    // Switch to text mode
    inputMode = 'text';
    if (chatInputVoice) chatInputVoice.style.display = 'none';
    if (chatInputText) chatInputText.style.display = 'block';
    updateModeIcon();
    if (userInput) userInput.focus();
    showToast('Voice session ended. You can type instead.');
  }

  function toggleMute() {
    if (typeof RealtimeVoice === 'undefined') return;

    if (RealtimeVoice.isMuted()) {
      RealtimeVoice.unmute();
      setVoiceUI('listening');
      updateMuteButton(false);
    } else {
      RealtimeVoice.mute();
      setVoiceUI('muted');
      updateMuteButton(true);
    }
  }

  function updateMuteButton(isMuted) {
    var btn = $('btnVoiceMute');
    if (!btn) return;
    if (isMuted) {
      btn.classList.add('is-muted');
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Unmute';
    } else {
      btn.classList.remove('is-muted');
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Mute';
    }
  }

  // ══════════════════════════════════════════════════════
  //  TEXT MESSAGING (unchanged — uses /api/chat)
  // ══════════════════════════════════════════════════════
  function sendTextMessage() {
    if (!userInput) return;
    var text = userInput.value.trim();
    if (!text || isProcessing) return;

    userInput.value = '';
    userInput.style.height = 'auto';
    addMessage(text, 'user');
    showCaption('You', text);
    if (checkCrisis(text)) showCrisisBanner();
    sendToAI(text);
  }

  // ── Mode switching ──
  function switchToVoice() {
    log('switchToVoice', '');
    inputMode = 'voice';
    if (chatInputText) chatInputText.style.display = 'none';
    if (chatInputVoice) chatInputVoice.style.display = 'block';

    // Force captions on
    captionsEnabled = true;
    window.__aaaiCaptionsEnabled = true;
    updateCaptionsButton();
    if (captionsOverlay) captionsOverlay.style.display = 'block';

    updateModeIcon();
    startVoiceSession();
  }

  function switchToText() {
    log('switchToText', '');
    if (typeof RealtimeVoice !== 'undefined') {
      RealtimeVoice.disconnect();
    }
    inputMode = 'text';
    if (chatInputVoice) chatInputVoice.style.display = 'none';
    if (chatInputText) chatInputText.style.display = 'block';
    updateModeIcon();
    if (userInput) userInput.focus();
  }

  function toggleMode() {
    if (inputMode === 'text') switchToVoice();
    else switchToText();
  }

  function updateModeIcon() {
    var micIcon = $('modeIconMic');
    var kbdIcon = $('modeIconKbd');
    if (!micIcon || !kbdIcon) return;
    if (inputMode === 'text') {
      micIcon.style.display = 'block';
      kbdIcon.style.display = 'none';
    } else {
      micIcon.style.display = 'none';
      kbdIcon.style.display = 'block';
    }
  }

  // ══════════════════════════════════════════════════════
  //  CAPTIONS SYSTEM
  // ══════════════════════════════════════════════════════
  function toggleCaptions() {
    captionsEnabled = !captionsEnabled;
    window.__aaaiCaptionsEnabled = captionsEnabled;
    localStorage.setItem('aaai_pref_cc', String(captionsEnabled));
    updateCaptionsButton();

    if (captionsEnabled) {
      if (captionsOverlay) captionsOverlay.style.display = 'block';
      showToast('Closed captions enabled');
    } else {
      if (captionsOverlay) captionsOverlay.style.display = 'none';
      showToast('Closed captions disabled');
    }
  }

  function updateCaptionsButton() {
    var btn = $('btnCaptions');
    if (!btn) return;
    if (captionsEnabled) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      btn.title = 'Captions ON (click to disable)';
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
      btn.title = 'Captions OFF (click to enable)';
    }
  }

  function showCaption(speaker, text) {
    // In voice mode, captions are always on regardless of toggle
    if (inputMode !== 'voice' && !captionsEnabled) return;
    if (!captionsOverlay) return;
    captionsOverlay.style.display = 'block';
    if (captionsLabel) captionsLabel.textContent = speaker === 'AI' ? 'AI' : 'You';
    if (captionsText) captionsText.textContent = text;
    captionsOverlay.classList.add('cc-visible');
  }

  function hideCaption() {
    if (!captionsOverlay) return;
    captionsOverlay.classList.remove('cc-visible');
    setTimeout(function() {
      if (!captionsOverlay.classList.contains('cc-visible')) {
        if (captionsText) captionsText.textContent = '';
      }
    }, 3000);
  }

  // ══════════════════════════════════════════════════════
  //  CRISIS CHECK
  // ══════════════════════════════════════════════════════
  function checkCrisis(text) {
    var lower = text.toLowerCase();
    return CRISIS_KEYWORDS.some(function(kw) { return lower.includes(kw); });
  }

  function showCrisisBanner() {
    if (crisisBanner) crisisBanner.style.display = 'block';
    var crisisHtml =
      '<strong>Veterans Crisis Line</strong>' +
      '<p>Dial <a href="tel:988">988</a>, Press 1 &nbsp;|&nbsp; Text <a href="sms:838255">838255</a></p>' +
      '<p><a href="https://www.veteranscrisisline.net/get-help-now/chat/" target="_blank" rel="noopener noreferrer">Chat Online Now</a></p>' +
      '<p style="margin-top:8px;font-size:0.85rem;">Confidential. 24/7. You are not alone.</p>';
    var div = document.createElement('div');
    div.className = 'message message--crisis';
    div.innerHTML = crisisHtml;
    if (chatMessages) chatMessages.appendChild(div);

    if (role === 'ai') {
      setTimeout(function() {
        injectLegalDocButton(div, text);
      }, 0);
    }
    scrollToBottom();
  }

  // ══════════════════════════════════════════════════════
  //  AI COMMUNICATION (text mode only — voice uses Realtime)
  // ══════════════════════════════════════════════════════
  function sendToAI(userText) {
    log('sendToAI', 'input="' + (userText || '').substring(0, 60) + '"');
    isProcessing = true;
    if (btnSend) btnSend.disabled = true;

    if (userText !== 'START_CONVERSATION') {
      conversationHistory.push({ role: 'user', content: userText });
      // Fire audit_started on the first real user message only
      var realMsgCount = conversationHistory.filter(function(m) { return m.role === 'user'; }).length;
      if (realMsgCount === 1) {
        window.dispatchEvent(new CustomEvent('aaai:audit_started'));
        log('Analytics', 'dispatched aaai:audit_started');
      }
    }

    showTyping();

    var apiPromise = callChatEndpoint(conversationHistory);

    apiPromise.then(function(aiResponse) {
      log('sendToAI', 'API returned ' + aiResponse.length + ' chars');
      removeTyping();
      conversationHistory.push({ role: 'assistant', content: aiResponse });

      streamMessage(aiResponse, function() {
        log('sendToAI', 'stream complete');
        isProcessing = false;
        if (btnSend) btnSend.disabled = false;
        if (userInput) userInput.focus();

        // Phase 2: Detect report and show PDF download + checklist
        if (isReportResponse(aiResponse)) {
          log('Report', 'detected — showing actions');
          showReportActions(aiResponse);
        }
      });

    }).catch(function(error) {
      removeTyping();
      log('sendToAI', 'ERROR — ' + error.message);
      console.error('AI Error:', error);

      var mockResponse = getMockResponse(userText);
      if (mockResponse) {
        streamMessage(mockResponse, function() {
          conversationHistory.push({ role: 'assistant', content: mockResponse });
          isProcessing = false;
          if (btnSend) btnSend.disabled = false;
        });
      } else {
        addMessage('I\'m having trouble connecting right now. Please try again in a moment. If you need immediate help, call the Veterans Crisis Line at 988 (Press 1).', 'ai');
        isProcessing = false;
        if (btnSend) btnSend.disabled = false;
      }
    });
  }

  // ── SIMULATED STREAMING (abortable) ──────────────────
  function abortStreaming() {
    if (activeStreamTimer) {
      clearTimeout(activeStreamTimer);
      activeStreamTimer = null;
      log('abortStreaming', 'stream timer cleared');
    }
  }

  function streamMessage(fullText, onComplete) {
    var div = document.createElement('div');
    div.className = 'message message--ai message--streaming';
    if (chatMessages) chatMessages.appendChild(div);

    // Strip [OPTIONS: ...] from streaming text so raw markup doesn't show
    var streamText = fullText.replace(/\[OPTIONS:\s*.*?\]/g, '').replace(/\s+$/, '');
    var words = streamText.split(/(\s+)/);
    var html = '';
    var i = 0;
    var batchSize = 3;

    function renderBatch() {
      if (i >= words.length) {
        activeStreamTimer = null;
        div.classList.remove('message--streaming');
        div.innerHTML = formatMessage(fullText)

      // Phase 3.5: inject Download Word Doc button for legal template responses
      injectLegalDocButton(div, fullText);
        div.innerHTML = formatMessage(fullText);
        // Phase 3.5: inject Download Word Doc button for legal template responses
        injectLegalDocButton(div, fullText);
        scrollToBottom();
        if (onComplete) onComplete();
        return;
      }

      var end = Math.min(i + batchSize, words.length);
      for (var j = i; j < end; j++) {
        html += escapeHtml(words[j]);
      }
      div.innerHTML = html + '<span class="stream-cursor"></span>';
      i = end;
      scrollToBottom();
      activeStreamTimer = setTimeout(renderBatch, CONFIG.streamDelay);
    }

    renderBatch();
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── MOCK RESPONSES ──────────────────────────────────
  function getMockResponse(userText) {
    if (userText === 'START_CONVERSATION') {
      return 'Welcome to AfterAction AI. I\'m here to help you find every benefit, resource, and organization you\'ve earned through your service \u2014 and build you a personalized plan. Free. No forms. No judgment.\n\nBefore we start talking, here\'s a tip: the more documents you upload up front, the more accurate and personalized your plan will be \u2014 and the fewer questions I\'ll need to ask.\n\nTap the upload button (arrow icon at the bottom) and drop in anything you have: DD-214, VA Disability Rating Letter, VA Benefits Summary, military transcripts, resume, certificates, or diplomas. I\'ll pull the details automatically.\n\nUpload as many as you want, or none at all. Everything is processed to build your plan and nothing is stored. Your privacy matters.\n\nWhen you\'re ready \u2014 uploaded or not \u2014 just tell me: what branch did you serve in?\n\n[OPTIONS: Army | Navy | Air Force | Marine Corps | Coast Guard | Space Force | National Guard | Reserve | I\'m a family member]';
    }
    return null;
  }

  // ── SERVERLESS PROXY ────────────────────────────────
  function callChatEndpoint(messages) {
    log('callChatEndpoint', 'messages=' + messages.length);
    return fetch(CONFIG.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.length === 0
          ? [{ role: 'user', content: 'Begin the conversation. Send your opening welcome message.' }]
          : messages
      })
    }).then(function(resp) {
      if (!resp.ok) throw new Error('Chat endpoint error: ' + resp.status);
      return resp.json();
    }).then(function(data) {
      log('callChatEndpoint', 'response received, length=' + (data.response || '').length);
      return data.response;
    });
  }

  // ══════════════════════════════════════════════════════
  //  UI HELPERS
  // ══════════════════════════════════════════════════════
  function addMessage(text, role) {
    var div = document.createElement('div');
    div.className = 'message message--' + role;

    if (role === 'ai') {
      div.innerHTML = formatMessage(text);
      // Phase 3.5: inject Download Word Doc button for legal template responses
      injectLegalDocButton(div, text);
    } else {
      div.textContent = text;
    }

    if (chatMessages) chatMessages.appendChild(div);

    // FORCE BUTTON INJECTION
    if (role === 'ai') {
        injectLegalDocButton(div, text);
    }

    scrollToBottom();
  }

  // Phase 3.5 — detect legal template responses and inject Download Word Doc button
  function injectLegalDocButton(messageDiv, rawText) {
    console.log('[LegalBtn] injectLegalDocButton called, text length:', rawText ? rawText.length : 0);
    console.log('[LegalBtn] AAAI defined:', typeof AAAI !== 'undefined', '| legalIntegration:', !!(typeof AAAI !== 'undefined' && AAAI.legalIntegration));
    // Only legalIntegration is required for detection; legal (modal) is checked at click time
    if (typeof AAAI === 'undefined' || !AAAI.legalIntegration) return;
    var formType = AAAI.legalIntegration.detectLegalFormType(rawText);
    console.log('[LegalBtn] detectLegalFormType result:', formType);
    if (!formType) return;

    var btn = document.createElement('button');
    btn.className = 'legal-doc-btn';
    btn.textContent = '⬇ Download Word Doc';
    btn.setAttribute('aria-label', 'Download legal document as Word file');
    btn.style.cssText = 'display:inline-block;margin-top:12px;padding:9px 18px;' +
      'background:#1a56db;color:#fff;border:none;border-radius:6px;' +
      'font-size:13px;font-weight:600;cursor:pointer;letter-spacing:0.01em;';

    btn.addEventListener('click', function () {
      AAAI.legal.requireAcknowledgment(formType, function (confirmedFormType) {
        if (typeof AAAI !== 'undefined' && AAAI.legalDocx && AAAI.legalDocx.generate) {
          AAAI.legalDocx.generate(confirmedFormType, rawText).catch(function (err) {
            var msg = err && err.message ? err.message : String(err || 'DOCX generation failed');
            console.error('[LegalBtn] AAAI.legalDocx.generate failed:', err);
            if (typeof showToast === 'function') { showToast(msg, 'error'); }
            else { alert('Document generation error: ' + msg); }
          });
        } else {
          console.error('[LegalBtn] AAAI.legalDocx is unavailable at click time.');
          if (typeof showToast === 'function') { showToast('DOCX generator is unavailable. Please refresh the page and try again.', 'error'); }
          else { alert('DOCX generator is unavailable. Please refresh the page and try again.'); }
        }
      });
    });

    messageDiv.appendChild(btn);
    console.log('[LegalBtn] button appended for formType:', formType);
  }

  function formatMessage(text) {
    // Extract [OPTIONS: ...] blocks before formatting
    var optionsHtml = '';
    var cleanText = text.replace(/\[OPTIONS:\s*(.*?)\]/g, function(match, inner) {
      var opts = inner.split('|').map(function(o) { return o.trim(); }).filter(Boolean);
      if (opts.length > 0) {
        optionsHtml += '<div class="chat-options">';
        opts.forEach(function(opt) {
          optionsHtml += '<button class="chat-option-btn" data-option="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
        });
        optionsHtml += '</div>';
      }
      return '';
    });

    var html = cleanText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.*?)\]\((https?:\/\/.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>')
      .replace(/<br>\s*$/, '');

    return html + optionsHtml;
  }

  function showTyping() {
    var div = document.createElement('div');
    div.className = 'message message--typing';
    div.id = 'typingIndicator';
    div.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    if (chatMessages) chatMessages.appendChild(div);
    scrollToBottom();
  }

  function removeTyping() {
    var el = $('typingIndicator');
    if (el) el.remove();
  }

  function scrollToBottom() {
    setTimeout(function() {
      if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 0);
  }

  function showToast(msg) {
    var toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('toast-visible'); }, 16);
    setTimeout(function() {
      toast.classList.remove('toast-visible');
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  }

  // ══════════════════════════════════════════════════════
  //  FILE UPLOAD
  // ══════════════════════════════════════════════════════
  function handleFileSelect(event) {
    var files = Array.from(event.target.files);
    if (!files.length) return;

    var docTypeMap = {
      'dd214': 'DD-214', 'dd-214': 'DD-214',
      'disability': 'VA Disability Rating Letter', 'rating': 'VA Disability Rating Letter',
      'benefit summary': 'VA Benefits Summary Letter', 'benefit_summary': 'VA Benefits Summary Letter',
      'transcript': 'Military/Civilian Transcript', 'jst': 'Joint Services Transcript',
      'ccaf': 'CCAF Transcript', 'resume': 'Resume', 'cv': 'Resume',
      'certificate': 'Certificate', 'cert': 'Certificate', 'diploma': 'Diploma',
      'license': 'License/Certification'
    };

    files.forEach(function(file) {
      var nameLower = file.name.toLowerCase();
      var docType = 'Document';
      var keys = Object.keys(docTypeMap);
      for (var k = 0; k < keys.length; k++) {
        if (nameLower.indexOf(keys[k]) > -1) {
          docType = docTypeMap[keys[k]];
          break;
        }
      }
      pendingFiles.push({ file: file, docType: docType, name: file.name });
      uploadedDocTypes.push(docType);
    });

    var fileNames = files.map(function(f) { return f.name; }).join(', ');
    var docTypes = pendingFiles.map(function(f) { return f.docType; }).join(', ');

    addMessage('Uploaded: ' + fileNames, 'user');

    var notice = document.createElement('div');
    notice.className = 'message message--upload-notice';
    notice.innerHTML = '<strong>Processing ' + files.length + ' document' + (files.length > 1 ? 's' : '') + '...</strong><br>Extracting your service information to personalize your plan.';
    if (chatMessages) chatMessages.appendChild(notice);
    scrollToBottom();

    processUploads(pendingFiles).then(function(extractedText) {
      notice.remove();
      var uploadContext = '[SYSTEM: Veteran uploaded ' + files.length + ' document(s): ' + docTypes + '. ' +
        'Extracted content below. Use this to skip questions you can answer from the documents. ' +
        'Confirm what you found with the veteran before proceeding.]\n\n' +
        'Document content:\n' + extractedText;

      // Route to the right engine
      if (inputMode === 'voice' && typeof RealtimeVoice !== 'undefined' && RealtimeVoice.getState() !== 'idle') {
        // Send via Realtime data channel
        RealtimeVoice.sendText(uploadContext);
      } else {
        // Send via text API
        sendToAI(uploadContext);
      }
      pendingFiles = [];
    });

    event.target.value = '';
  }

  function processUploads(files) {
    var results = [];
    var chain = Promise.resolve();

    files.forEach(function(pf) {
      chain = chain.then(function() {
        if (pf.file.type === 'text/plain') {
          return pf.file.text().then(function(text) {
            results.push('--- ' + pf.docType + ' (' + pf.file.name + ') ---\n' + text);
          });
        } else if (pf.file.type.startsWith('image/')) {
          results.push('--- ' + pf.docType + ' (' + pf.file.name + ') ---\n[Image uploaded. Please ask the veteran about the contents of this ' + pf.docType + '.]');
          return Promise.resolve();
        } else if (pf.file.type === 'application/pdf') {
          results.push('--- ' + pf.docType + ' (' + pf.file.name + ') ---\n[PDF uploaded. Please ask the veteran to confirm the key details from their ' + pf.docType + '.]');
          return Promise.resolve();
        } else {
          results.push('--- ' + pf.docType + ' (' + pf.file.name + ') ---\n[' + pf.file.type + ' file uploaded. Please ask the veteran about the contents.]');
          return Promise.resolve();
        }
      });
    });

    return chain.then(function() { return results.join('\n\n'); });
  }

  // ══════════════════════════════════════════════════════
  //  REPORT DETECTION + PDF GENERATION (Phase 2)
  // ══════════════════════════════════════════════════════
  var lastReportText = null; // stores the latest detected report text

  function isReportResponse(text) {
    if (!text) return false;

    var markers = [
      'Action Plan',
      'Key Findings',
      'Recommendations',
      'Next Steps',
      'Checklist',
      'Summary'
    ];

    var hasMarkers = markers.filter(function(m) {
      // Must appear as a section heading, not as a word mid-sentence
      var escaped = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('^[ \t]*(?:#{1,4}\\s*|\\*{1,2})?\\s*' + escaped + '\\s*\\*{0,2}\\s*:?\\s*$', 'im').test(text);
      // Must appear as a section heading (start of line, optional ## or **),
      // not as a word mid-sentence ("In summary..." / "VA Benefits Summary")
      var escaped = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('^[ \\t]*(?:#{1,4}\\s*|\\*{1,2})?\\s*' + escaped + '\\s*\\*{0,2}\\s*:?\\s*$', 'im').test(text);
    }).length >= 2;

    var longEnough = text.length > 800;

    return hasMarkers && longEnough;
  }

  function generateReportPDF(reportText) {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      showToast('PDF library not loaded. Please try again.');
      log('PDF', 'jsPDF not available');
      return;
    }

    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });

    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var marginL = 20;
    var marginR = 20;
    var marginTop = 25;
    var marginBottom = 20;
    var usableW = pageW - marginL - marginR;
    var y = marginTop;

    // ── Header bar ──
    doc.setFillColor(26, 54, 93); // navy
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('AfterAction AI \u2014 Veteran Benefits Report', pageW / 2, 12, { align: 'center' });

    y = 28;

    // ── Date line ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    var dateStr = 'Generated: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(dateStr, pageW - marginR, y, { align: 'right' });
    y += 8;

    // ── Parse sections from the report text ──
    var sections = parseReportSections(reportText);

    // ── Render each section ──
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];

      // Section heading
      if (sec.heading) {
        if (y > pageH - 40) { doc.addPage(); y = marginTop; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(26, 54, 93);
        y += 4;
        doc.text(sec.heading, marginL, y);
        y += 2;
        // underline
        doc.setDrawColor(26, 54, 93);
        doc.setLineWidth(0.5);
        doc.line(marginL, y, marginL + usableW, y);
        y += 6;
      }

      // Section body
      if (sec.body) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);

        var lines = doc.splitTextToSize(sec.body, usableW);
        for (var li = 0; li < lines.length; li++) {
          if (y > pageH - marginBottom) {
            doc.addPage();
            y = marginTop;
          }
          doc.text(lines[li], marginL, y);
          y += 5;
        }
        y += 3;
      }
    }

    // ── Footer on every page ──
    var totalPages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('AfterAction AI \u2014 afteractionai.org', marginL, pageH - 8);
      doc.text('Page ' + p + ' of ' + totalPages, pageW - marginR, pageH - 8, { align: 'right' });
    }

    doc.save('AfterAction_AI_Report.pdf');
    log('PDF', 'downloaded');
  }

  function parseReportSections(text) {
    // Clean markdown artifacts
    var clean = text
      .replace(/\[OPTIONS:\s*.*?\]/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\[(.*?)\]\(https?:\/\/.*?\)/g, '$1')
      .trim();

    var sections = [];
    // Split on markdown-style headings (##, ###, numbered headings, or ALL-CAPS lines)
    var parts = clean.split(/\n(?=#{1,3}\s|(?:\d+[\.\)]\s*[A-Z])|\n[A-Z][A-Z\s&\-:]{5,}\n)/);

    if (parts.length <= 1) {
      // No clear sections found — treat as one block with a generic heading
      sections.push({ heading: 'Your Personalized Report', body: clean });
      return sections;
    }

    for (var i = 0; i < parts.length; i++) {
      var chunk = parts[i].trim();
      if (!chunk) continue;

      // Try to extract heading from first line
      var firstNewline = chunk.indexOf('\n');
      var heading = '';
      var body = chunk;

      if (firstNewline > 0 && firstNewline < 120) {
        var potentialHeading = chunk.substring(0, firstNewline).replace(/^#{1,3}\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim();
        if (potentialHeading.length < 100) {
          heading = potentialHeading;
          body = chunk.substring(firstNewline + 1).trim();
        }
      }

      if (!heading && i === 0) heading = 'Veteran Summary';

      sections.push({ heading: heading, body: body });
    }

    return sections;
  }

  function showReportActions(reportText) {
    lastReportText = reportText;
    // Signal that AI has generated a complete report
    window.dispatchEvent(new CustomEvent('aaai:audit_completed', { detail: { tags: [] } }));
    log('Analytics', 'dispatched aaai:audit_completed');

    var div = document.createElement('div');
    div.className = 'message message--system';
    div.innerHTML =
      '<div class="report-actions">' +
        '<p class="report-actions__title">YOUR PERSONALIZED REPORT IS READY</p>' +
        '<div class="report-actions__buttons">' +
          '<button id="btnDownloadPDF" class="report-actions__btn report-actions__btn--pdf">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
            ' Download PDF' +
          '</button>' +
          '<button id="btnLaunchChecklist" class="report-actions__btn report-actions__btn--checklist">' +
            'View Mission Checklist \u2192' +
          '</button>' +
        '</div>' +
        '<p class="report-actions__note">Or keep chatting \u2014 I\'m here for as long as you need.</p>' +
        '<div class="report-actions__consent">' +
          '<label for="chkEmailConsent">' +
            '<input type="checkbox" id="chkEmailConsent"> ' +
            'I agree to receive updates and resources' +
          '</label>' +
        '</div>' +
      '</div>';
    if (chatMessages) chatMessages.appendChild(div);
    scrollToBottom();

    // Wire up PDF button
    var pdfBtn = document.getElementById('btnDownloadPDF');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function() {
        // Phase 3.5: Legal forms route through acknowledgment modal + .docx
        if (typeof AAAI !== 'undefined' && AAAI.legalIntegration && AAAI.legalIntegration.detectAndHandle(reportText)) {
          return;
        }
        generateReportPDF(reportText);
      });
    }

    // Wire up checklist button
    var clBtn = document.getElementById('btnLaunchChecklist');
    if (clBtn) {
      clBtn.addEventListener('click', function() {
        buildChecklist(reportText);
      });
    }

    // Wire up email consent checkbox
    var consentChk = document.getElementById('chkEmailConsent');
    if (consentChk) {
      consentChk.addEventListener('change', function() {
        var value = consentChk.checked;
        console.log('EMAIL CONSENT:', value);
        if (typeof AAAI !== 'undefined' && AAAI.auth && AAAI.auth.updateConsent) {
          if (!AAAI.auth.isLoggedIn || !AAAI.auth.isLoggedIn()) {
            log('Consent', 'user not logged in — consent not saved');
            return;
          }
          AAAI.auth.updateConsent(value).then(function(result) {
            if (result && result.error) {
              log('Consent', 'updateConsent error: ' + result.error);
            } else {
              log('Consent', 'consent_email saved: ' + value);
            }
          }).catch(function(e) {
            log('Consent', 'updateConsent exception: ' + e.message);
          });
        }
      });
    }

    // Action Engine — show recommended next actions based on report content
    var detectedIssues = [];
    if (typeof AAAI !== 'undefined' && AAAI.actions) {
      try {
        var userProfile = null;
        if (AAAI.auth && AAAI.auth.getProfile) {
          userProfile = AAAI.auth.getProfile();
        }
        // Use enriched plan if user has saved tags, otherwise standard plan
        var actionPlan = (AAAI.actions.getEnrichedPlan && userProfile && userProfile.issue_tags)
          ? AAAI.actions.getEnrichedPlan(reportText, userProfile)
          : AAAI.actions.getActionPlan(reportText, userProfile);

        detectedIssues = actionPlan.issues;

        var panelHtml = (AAAI.actions.renderEnrichedPanel && actionPlan.savedTagCount > 0)
          ? AAAI.actions.renderEnrichedPanel(actionPlan, { maxTemplates: 4, maxResources: 3 })
          : AAAI.actions.renderActionPanel(actionPlan, { maxTemplates: 4, maxResources: 3 });

        if (panelHtml) {
          var actionDiv = document.createElement('div');
          actionDiv.className = 'message message--system';
          actionDiv.innerHTML =
            '<div class="action-panel__title">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
              ' Recommended Next Actions' +
            '</div>' + panelHtml;
          if (chatMessages) chatMessages.appendChild(actionDiv);
          scrollToBottom();
          log('ActionEngine', 'showed ' + actionPlan.issues.length + ' issues, ' +
              actionPlan.templates.flow.length + ' templates, ' +
              actionPlan.resources.length + ' resources' +
              (actionPlan.savedTagCount ? ' (enriched from ' + actionPlan.savedTagCount + ' saved tags)' : ''));
        }

        // Persist detected issue tags for smart matching across sessions
        if (detectedIssues.length > 0) {
          AAAI.actions.persistTags(detectedIssues);
        }

        // ── State Benefits Recommendations ────────────────
        // Detect state from profile or conversation text
        var userState = (userProfile && userProfile.state) ? userProfile.state : null;
        if (!userState) {
          // Try to extract state from report/conversation text
          var stateList = (typeof ResourceHub !== 'undefined' && ResourceHub.STATES) ? ResourceHub.STATES : [];
          for (var si = 0; si < stateList.length; si++) {
            var s = stateList[si];
            // Match full state name in text (case-insensitive, word boundary)
            var stateRegex = new RegExp('\\b' + s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
            if (stateRegex.test(reportText)) {
              userState = s.abbr;
              break;
            }
          }
        }

        if (userState && AAAI.actions.getStateBenefitsForUser) {
          var stateContext = {
            state: userState,
            issue_tags: detectedIssues,
            disability_rating_band: (userProfile && userProfile.disability_rating) ? userProfile.disability_rating : null,
            service_status: (userProfile && userProfile.service_status) ? userProfile.service_status : 'veteran'
          };

          AAAI.actions.getStateBenefitsForUser(stateContext).then(function(benefits) {
            if (benefits && benefits.length > 0) {
              // Look up full state name for display
              var stateName = userState;
              var statesList = (typeof ResourceHub !== 'undefined' && ResourceHub.STATES) ? ResourceHub.STATES : [];
              for (var sn = 0; sn < statesList.length; sn++) {
                if (statesList[sn].abbr === userState) {
                  stateName = statesList[sn].name;
                  break;
                }
              }

              var benefitsHtml = AAAI.actions.renderStateBenefitsPanel(benefits, stateName);
              if (benefitsHtml) {
                var benefitsDiv = document.createElement('div');
                benefitsDiv.className = 'message message--system';
                benefitsDiv.innerHTML =
                  '<div class="action-panel__title">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
                    ' Recommended State Benefits' +
                  '</div>' + benefitsHtml;
                if (chatMessages) chatMessages.appendChild(benefitsDiv);
                scrollToBottom();
                log('StateBenefits', 'showed ' + benefits.length + ' benefits for ' + stateName);
              }
            }
          }).catch(function(e) {
            log('StateBenefits', 'error: ' + e.message);
          });
        }
      } catch(e) {
        log('ActionEngine', 'render error: ' + e.message);
      }
    }

    // Save report to Supabase if logged in + auto-generate checklist
    if (typeof AAAI !== 'undefined' && AAAI.auth && AAAI.auth.isLoggedIn && AAAI.auth.isLoggedIn()) {
      AAAI.auth.saveReport(reportText, conversationHistory).then(function(result) {
        if (result && !result.error) {
          log('Report', 'saved to Supabase');
          // Signal that report was persisted — pass reportId for analytics correlation
          var savedReportId = result.data && result.data.id ? result.data.id : null;
          window.dispatchEvent(new CustomEvent('aaai:report_generated', {
            detail: { reportId: savedReportId, tags: [] }
          }));
          log('Analytics', 'dispatched aaai:report_generated | reportId=' + savedReportId);

          // Auto-save action engine checklist items linked to this report
          if (result.data && result.data.id && AAAI.actions && AAAI.actions.autoSaveChecklist && detectedIssues.length > 0) {
            AAAI.actions.autoSaveChecklist(result.data.id, detectedIssues).then(function(clResult) {
              if (clResult && clResult.data) {
                log('AutoChecklist', 'saved ' + clResult.data.length + ' items from action engine');
              }
            }).catch(function(e) {
              log('AutoChecklist', 'save error: ' + e.message);
            });
          }

          // Extract segmentation signals from conversation and write to profile
          if (AAAI.auth.updateSegmentation) {
            var seg = extractSegmentationFromConversation(conversationHistory);
            AAAI.auth.updateSegmentation(seg).then(function(segResult) {
              if (segResult && !segResult.skipped) {
                log('Segmentation', 'profile updated: ' + JSON.stringify(seg));
              }
            }).catch(function(e) {
              log('Segmentation', 'update error: ' + e.message);
            });
          }
        }
      }).catch(function(e) {
        log('Report', 'save error: ' + e.message);
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  SEGMENTATION EXTRACTION
  //  Parses conversation history to extract profile fields.
  //  Matches user replies against known AI prompt options.
  // ══════════════════════════════════════════════════════
  function extractSegmentationFromConversation(history) {
    // Collect all user message text — lowercase for matching
    var userText = history
      .filter(function(m) { return m.role === 'user'; })
      .map(function(m) { return (m.content || '').toLowerCase(); })
      .join(' | ');

    // ── AUDIENCE TYPE ──────────────────────────────────────
    // Maps Q3 service status options → audience_type values
    var audienceType = null;
    var audienceMap = [
      { match: ['active duty', 'active-duty'],                              value: 'active_duty' },
      { match: ['guard', 'reserve', 'guard/reserve', 'guard / reserve'],   value: 'guard_reserve' },
      { match: ['transitioning', 'within 12 months'],                      value: 'transitioning' },
      { match: ['recently separated', 'recently sep', '< 2 years', 'less than 2'],  value: 'recently_separated' },
      { match: ['veteran', '2+ years', 'two years out'],                   value: 'veteran' },
      { match: ['retired', '20+ yrs', 'medical retirement'],               value: 'retired' },
      { match: ['family', 'spouse', 'surviving', 'caregiver'],             value: 'family_member' }
    ];
    audienceMap.some(function(entry) {
      return entry.match.some(function(phrase) {
        if (userText.indexOf(phrase) !== -1) { audienceType = entry.value; return true; }
      });
    });

    // ── PRIMARY NEED ───────────────────────────────────────
    // Maps Phase 2 category selection → primary_need values
    var primaryNeed = null;
    var primaryMap = [
      { match: ['va benefits', 'disability', 'va claim', 'va rating'],     value: 'va_benefits' },
      { match: ['employment', 'career', 'job', 'resume', 'work'],          value: 'employment' },
      { match: ['education', 'gi bill', 'school', 'degree', 'training'],   value: 'education' },
      { match: ['medical', 'mental health', 'healthcare', 'counseling'],   value: 'medical_mental_health' },
      { match: ['legal', 'documents', 'power of attorney', 'will'],        value: 'legal_documents' },
      { match: ['financial', 'emergency aid', 'debt', 'budget'],           value: 'financial' },
      { match: ['housing', 'home loan', 'va loan', 'rental'],              value: 'housing' },
      { match: ['family support', 'community', 'caregiver'],               value: 'family_support' },
      { match: ['business', 'entrepreneur', 'self-employed'],              value: 'business' }
    ];
    primaryMap.some(function(entry) {
      return entry.match.some(function(phrase) {
        if (userText.indexOf(phrase) !== -1) { primaryNeed = entry.value; return true; }
      });
    });

    // ── SECONDARY NEEDS ────────────────────────────────────
    // All category matches beyond the first become secondary_needs
    var secondaryNeeds = [];
    primaryMap.forEach(function(entry) {
      var matched = entry.match.some(function(phrase) {
        return userText.indexOf(phrase) !== -1;
      });
      if (matched && entry.value !== primaryNeed) {
        secondaryNeeds.push(entry.value);
      }
    });

    // ── STATE ──────────────────────────────────────────────
    // Extract US state mentions from Q6
    var state = null;
    var statePattern = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;
    var stateMatch = userText.match(statePattern);
    if (stateMatch) { state = stateMatch[0].replace(/\b\w/g, function(c) { return c.toUpperCase(); }); }

    // ── VETERAN STATUS ─────────────────────────────────────
    var veteranStatus = null;
    if (userText.indexOf('honorable') !== -1) { veteranStatus = 'honorable'; }
    else if (userText.indexOf('general under honorable') !== -1) { veteranStatus = 'general_under_honorable'; }
    else if (userText.indexOf('other than honorable') !== -1) { veteranStatus = 'oth'; }

    return {
      audience_type: audienceType,
      primary_need: primaryNeed,
      secondary_needs: secondaryNeeds.length > 0 ? secondaryNeeds : null,
      state: state,
      veteran_status: veteranStatus
    };
  }

  // ══════════════════════════════════════════════════════
  //  CHECKLIST INTEGRATION
  // ══════════════════════════════════════════════════════
  function showChecklistPrompt(reportText) {
    var div = document.createElement('div');
    div.className = 'message message--system';
    div.innerHTML =
      '<div class="checklist-cta">' +
        '<p class="checklist-cta__title">YOUR MISSION STARTS NOW</p>' +
        '<p class="checklist-cta__desc">Your personalized plan is ready. Convert it into an actionable mission checklist.</p>' +
        '<button id="btnLaunchChecklist" class="checklist-cta__btn">View Mission Checklist \u2192</button>' +
        '<p class="checklist-cta__note">Or keep chatting \u2014 I\'m here for as long as you need.</p>' +
      '</div>';
    if (chatMessages) chatMessages.appendChild(div);
    scrollToBottom();

    $('btnLaunchChecklist').addEventListener('click', function() {
      buildChecklist(reportText);
    });
  }

  function buildChecklist(reportText) {
    var items = parseReportToChecklist(reportText);

    var sections = {
      immediate: document.querySelector('#checklistImmediate .checklist-section__items'),
      short_term: document.querySelector('#checklistShortTerm .checklist-section__items'),
      strategic: document.querySelector('#checklistStrategic .checklist-section__items'),
      optional: document.querySelector('#checklistOptional .checklist-section__items')
    };

    var keys = Object.keys(sections);
    for (var k = 0; k < keys.length; k++) {
      if (sections[keys[k]]) sections[keys[k]].innerHTML = '';
    }

    items.forEach(function(item, index) {
      var section = sections[item.category];
      if (!section) return;

      var el = document.createElement('div');
      el.className = 'checklist-item';
      el.setAttribute('data-index', index);

      el.innerHTML =
        '<div class="checklist-item__check" onclick="this.classList.toggle(\'checked\');this.closest(\'.checklist-item\').classList.toggle(\'completed\');updateChecklistProgress();">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
        '</div>' +
        '<div class="checklist-item__content">' +
          '<div class="checklist-item__title">' + item.title + '</div>' +
          (item.description ? '<div class="checklist-item__desc">' + item.description + '</div>' : '') +
          '<div class="checklist-item__actions">' +
            '<button class="checklist-btn checklist-btn--assist" data-index="' + index + '" title="AI explains this step">AI Assist</button>' +
          '</div>' +
        '</div>';
      section.appendChild(el);
    });

    document.querySelectorAll('.checklist-btn--assist').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var itemEl = this.closest('.checklist-item');
        var title = itemEl.querySelector('.checklist-item__title').textContent;
        var desc = itemEl.querySelector('.checklist-item__desc');
        showAIAssist(itemEl, title, desc ? desc.textContent : '');
      });
    });

    var checklistScreen = $('checklistScreen');
    if (chatScreen) chatScreen.style.display = 'none';
    if (checklistScreen) checklistScreen.style.display = 'flex';
    updateChecklistProgress();
  }

  function parseReportToChecklist(text) {
    var items = [];
    var lines = text.split('\n');
    var currentCategory = 'immediate';

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      var lower = line.toLowerCase();

      if (lower.indexOf('immediate') > -1 || lower.indexOf('this week') > -1 || lower.indexOf('right now') > -1) {
        currentCategory = 'immediate'; continue;
      }
      if (lower.indexOf('short-term') > -1 || lower.indexOf('short term') > -1 || lower.indexOf('this month') > -1) {
        currentCategory = 'short_term'; continue;
      }
      if (lower.indexOf('medium-term') > -1 || lower.indexOf('strategic') > -1 || lower.indexOf('long-term') > -1 || lower.indexOf('6-12 month') > -1) {
        currentCategory = 'strategic'; continue;
      }
      if (lower.indexOf('optional') > -1 || lower.indexOf('bonus') > -1) {
        currentCategory = 'optional'; continue;
      }

      var actionMatch = line.match(/^(?:\d+[\.\)]\s*|\*\s+|-\s+|\u2022\s*)(.+)/);
      if (actionMatch && actionMatch[1].length > 10) {
        var title = actionMatch[1].replace(/\*\*/g, '').trim();
        var desc = '';
        for (var j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          var nextLine = lines[j].trim();
          if (!nextLine) continue;
          if (nextLine.match(/^(?:\d+[\.\)]\s*|\*\s+|-\s+|\u2022\s*)/)) break;
          if (nextLine.length > 15 && !nextLine.match(/^#{1,3}\s/)) {
            desc = nextLine.replace(/\*\*/g, '').trim();
            break;
          }
        }
        items.push({ category: currentCategory, title: title.substring(0, 200), description: desc.substring(0, 300) });
      }
    }

    if (items.length < 3) {
      return [
        { category: 'immediate', title: 'Review your personalized AfterAction Plan', description: 'Read through the full plan above and identify your top priority.' },
        { category: 'immediate', title: 'Contact the first resource listed in your plan', description: 'Make the first call or visit the first link recommended.' },
        { category: 'immediate', title: 'Gather required documents', description: 'Collect DD-214, VA rating letter, and any other documents mentioned.' },
        { category: 'short_term', title: 'Complete initial applications', description: 'Submit applications for benefits and programs identified in your plan.' },
        { category: 'short_term', title: 'Follow up on pending items', description: 'Check status of applications and schedule follow-up appointments.' },
        { category: 'strategic', title: 'Track progress and adjust plan', description: 'Come back to update your plan as your situation evolves.' },
        { category: 'optional', title: 'Explore additional resources', description: 'Visit the Education Hub and Resources page for more tools.' }
      ];
    }
    return items;
  }

  window.updateChecklistProgress = function() {
    var all = document.querySelectorAll('.checklist-item');
    var completed = document.querySelectorAll('.checklist-item.completed');
    var pct = all.length > 0 ? Math.round((completed.length / all.length) * 100) : 0;
    var fill = $('checklistProgressFill');
    var text = $('checklistProgressText');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = pct + '% Complete \u2014 ' + completed.length + ' of ' + all.length + ' tasks';
  };

  function showAIAssist(itemEl, title, description) {
    if (itemEl.querySelector('.ai-assist-panel')) return;

    var panel = document.createElement('div');
    panel.className = 'ai-assist-panel';
    panel.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    itemEl.querySelector('.checklist-item__content').appendChild(panel);

    var prompt = 'You are AfterAction AI. A veteran has a checklist task: "' + title + '". ' + (description ? 'Details: ' + description : '') + ' Explain in 2-3 short sentences: what this means, why it matters, and the first concrete step to take. Be direct and veteran-friendly. Keep it under 75 words.';

    var assistPromise = fetch(CONFIG.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
    }).then(function(r) { return r.json(); }).then(function(d) { return d.response; });

    assistPromise.then(function(response) {
      panel.innerHTML = '<p style="font-size:0.85rem;color:var(--gray-300);line-height:1.5;">' + response.replace(/\n/g, '<br>') + '</p>' +
        '<button class="ai-assist-close" onclick="this.parentElement.remove()">Dismiss</button>';
    }).catch(function() {
      panel.innerHTML = '<p style="font-size:0.85rem;color:var(--gray-500);">Could not load explanation. Try again later.</p>';
    });
  }

  // ══════════════════════════════════════════════════════
  //  EXPOSE GLOBALS
  // ══════════════════════════════════════════════════════
  window.AAAI_CONFIG = {
    model: CONFIG.model,
    apiEndpoint: CONFIG.apiEndpoint
  };

  window.AAAI_startChat = startChat;
  window.AAAI_endVoiceSession = endVoiceSession;

  // ── BOOT ────────────────────────────────────────────
  init();

})();



