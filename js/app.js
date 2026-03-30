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
    maxTokens: 4096,
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

  // ── AT_RISK KEYWORDS (Phase 22) ──────────────────────────
  // First-person distress signals only. Never overlaps with CRISIS_KEYWORDS.
  // Checked only AFTER crisis check fails — mutual exclusivity guaranteed.
  var AT_RISK_KEYWORDS = [
    'losing my home', 'losing my house', 'about to lose my home',
    'facing eviction', 'being evicted', 'got evicted', 'getting evicted',
    'foreclosure', "can't pay rent", "can't afford rent",
    'behind on rent', 'behind on my mortgage',
    'living in my car', 'sleeping in my car', 'sleeping outside',
    'no place to live', "i'm homeless", 'i am homeless',
    'became homeless', 'just lost my housing',
    "can't pay my bills", "can't afford food", "can't afford to eat",
    'behind on bills', 'about to lose everything', 'losing everything',
    'completely alone', 'no one to turn to',
    'no one to help me', 'nobody to help me', 'totally isolated',
    'drinking problem', 'alcohol problem', 'drug problem',
    "can't stop drinking", "i'm an addict",
    'being abused', 'domestic violence',
    'unsafe at home', 'afraid to go home'
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
    '## ABSOLUTE DATA INTEGRITY RULE',
    'NEVER fabricate, infer, assume, or invent ANY medical conditions, diagnoses, disability claims, personal details, service history, or legal circumstances that the veteran has not explicitly stated or provided in uploaded documents. If information is missing, say what is missing — do not fill in the blanks with guesses. This rule applies to every message, especially reports and action plans.',
    '',
    '## NO SENSORY ACCESS — YOU CANNOT SEE, HEAR, OR OBSERVE ANYTHING',
    'You are a TEXT-BASED AI. You do NOT have access to any camera, video feed, microphone input, screen view, or real-world observation of any kind.',
    'You can ONLY work with:',
    '- Text the user types or speaks (converted to text by the system)',
    '- Documents the user explicitly uploads through the upload button',
    'You MUST NOT:',
    '- Say "I can see," "I see," "I notice," "looking at," "on your camera," "in front of you," or any phrase implying visual awareness',
    '- Claim to observe the user\'s environment, screen, documents on a desk, or anything physical',
    '- Imply you received information you did not actually receive in text or uploaded files',
    'If you are unsure whether a user provided something, say: "I don\'t have that in front of me — could you describe it or upload it so I can help?"',
    'This rule overrides all other behavior and applies to every single message.',
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
    'Before we dive in, feel free to upload any documents that may help — VA letters, denial letters, DD-214, medical records, legal paperwork, or anything else relevant. Just use the upload button below. The more I have, the fewer questions I\'ll need to ask.',
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
    '## EARLY TOPIC SELECTION — OVERRIDES NORMAL PHASE ORDER',
    'If the user sends a message like "I\'d like help with: [topics]" at ANY point (including early in the conversation), treat those topics as their PRIMARY INTENT. This is the same as them completing Phase 2 category selection.',
    'When this happens:',
    '- Do NOT re-ask "what can I help you with" or present category options again',
    '- Do NOT restart generic intake questions they have already answered',
    '- Immediately acknowledge the selected topics and begin Phase 3 deep-dive for those specific areas',
    '- If you still need basic profile info (name, branch, state), weave those questions naturally into the topic-focused conversation instead of running full Phase 1 first',
    '- Break down multiple topics and address them one at a time with targeted follow-ups',
    'Example — user says "I\'d like help with: Legal Documents, Career Transition":',
    'GOOD: "Got it — let\'s work on both. For Legal Documents, are you looking to create something like a will, power of attorney, or medical directive? And for Career Transition, are we talking resumes, job placement, or certifications? Let\'s start with whichever feels most urgent."',
    'BAD: "What can I help you with today?" or "What are you dealing with?" or restarting Phase 1 questions',
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
    'REPORT DATA RULES:',
    '- ONLY include conditions, claims, diagnoses, and personal facts the veteran explicitly stated or that were extracted from uploaded documents',
    '- NEVER invent specific conditions (e.g., do NOT add "PTSD," "sleep apnea," "back pain," "tinnitus" unless the veteran said so)',
    '- If a section would be empty because the veteran did not provide that information, write: "Not discussed — ask your VSO about [topic] if relevant"',
    '- It is better to have a shorter, accurate report than a longer report filled with assumptions',
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
    '- Never promise specific benefit amounts or approval',
    '- Never store SSNs, bank info, or passwords',
    '- Never speak negatively about the VA or any organization',
    '- Never claim to be human or a government entity',
    '- Never rush — if they want to talk, let them talk',
    '- Never fabricate or assume medical conditions, disability claims, or personal facts the veteran did not explicitly share — this is critical for trust and accuracy',
    '',
    '## DOCUMENT UPLOAD HANDLING',
    'If the veteran uploads documents at any point, extract all data and CONFIRM: "I pulled the following from your [doc type]: [summary]. Does that look right?"',
    'Skip any questions already answered by the documents.',
    '',
    '## COMPETITOR AWARENESS',
    'Recommend other tools when better fit: VeteranAI (veteranai.co), VA Wayfinder (vawayfinder.org), Post80.AI, Navigator USA Corp (nav-usa.org).',
    '',
    '## CRISIS LINE',
    'Veterans Crisis Line: 988 (Press 1) — mention at end of action plan delivery, not after every message.',
    '',
    '## CONVERSATION CONTINUITY RULE',
    'NEVER end a response with a passive or closed statement.',
    'ALWAYS end with one of:',
    '- A direct, clear question to the user',
    '- A specific next step the user should take',
    '- A set of OPTIONS buttons when appropriate',
    'The conversation must always move forward.',
    'Do NOT say "let me know if you have questions," "feel free to ask," "we can continue," or any equivalent passive close.',
    'Replace passive endings with active engagement.',
    'Examples:',
    'BAD: "We can build from here."',
    'BAD: "Let me know how you\'d like to proceed."',
    'GOOD: "Do you want to start by identifying your top 3 target roles, or should we refine your resume first?"',
    'GOOD: "What\'s your current VA disability rating — do you have one on file, or is this your first time filing?"',
    '[OPTIONS: I have a rating | Claim is pending | Never filed | Not sure]'
  ].join('\n');

  // ── STATE ───────────────────────────────────────────────
  var conversationHistory = [];
  var inputMode = 'text';        // 'text' | 'voice'
  var isProcessing = false;
  var pendingUserSubmission = null; // Phase 33 queue: holds at most one non-typed submission
  var voiceGreetingSent = false; // true after first START_CONVERSATION per voice session
  var captionsEnabled = false;
  var pendingFiles = [];
  var uploadedDocTypes = [];
  var streamAbortController = null;
  var activeStreamTimer = null;
  var activeDocumentType = null;       // Phase 3.8: locked to first detected doc type per session
  var selectedTopics = [];             // Session-start topic selections
  var topicBubblesShown = false;       // true after topic bubbles rendered once
  var reportButtonVisible = false;     // true once Generate Report button is showing
  var reportGenerated = false;         // true after a real report is detected

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
        // Send the selected option as a user message (Phase 33: shared submit path)
        submitUserText(option);
      });
    }

    log('init', 'complete — RealtimeVoice available: ' + (typeof window.RealtimeVoice !== 'undefined'));
  }

  // ══════════════════════════════════════════════════════
  //  SESSION-START TOPIC BUBBLES
  // ══════════════════════════════════════════════════════
  var TOPIC_BUBBLES = [
    { id: 'va-benefits',    label: 'VA Benefits',         icon: '\u2B50' },
    { id: 'disability',     label: 'Disability Increase',  icon: '\uD83D\uDCC8' },
    { id: 'career',         label: 'Career Transition',    icon: '\uD83D\uDCBC' },
    { id: 'medical-claims', label: 'Medical / Claims',     icon: '\uD83C\uDFE5' },
    { id: 'legal-docs',     label: 'Legal Documents',      icon: '\uD83D\uDCC4' },
    { id: 'financial',      label: 'Financial / Housing',  icon: '\uD83C\uDFE0' }
  ];

  function renderTopicBubbles() {
    if (!chatMessages) return;

    var container = document.createElement('div');
    container.className = 'topic-bubbles';
    container.id = 'topicBubbles';

    var label = document.createElement('div');
    label.className = 'topic-bubbles__label';
    label.textContent = 'What can I help you with today?';
    container.appendChild(label);

    var row = document.createElement('div');
    row.className = 'topic-bubbles__row';

    TOPIC_BUBBLES.forEach(function(topic) {
      var btn = document.createElement('button');
      btn.className = 'topic-bubble';
      btn.setAttribute('data-topic-id', topic.id);
      btn.innerHTML = '<span class="topic-bubble__icon">' + topic.icon + '</span>' +
                      '<span class="topic-bubble__text">' + topic.label + '</span>';

      btn.addEventListener('click', function() {
        var idx = selectedTopics.indexOf(topic.id);
        if (idx === -1) {
          selectedTopics.push(topic.id);
          btn.classList.add('topic-bubble--selected');
        } else {
          selectedTopics.splice(idx, 1);
          btn.classList.remove('topic-bubble--selected');
        }
        log('topicBubble', topic.id + ' → ' + (idx === -1 ? 'selected' : 'deselected') +
            ' | selectedTopics=' + JSON.stringify(selectedTopics));

        // Show/hide the "Go" button
        var goBtn = document.getElementById('topicGoBtn');
        if (goBtn) goBtn.style.display = selectedTopics.length > 0 ? 'inline-flex' : 'none';
      });

      row.appendChild(btn);
    });

    container.appendChild(row);

    // "Go" button — hidden until at least one topic selected
    var goBtn = document.createElement('button');
    goBtn.className = 'topic-go-btn';
    goBtn.id = 'topicGoBtn';
    goBtn.textContent = 'Let\u2019s go \u2192';
    goBtn.style.display = 'none';
    goBtn.addEventListener('click', function() {
      if (selectedTopics.length === 0) return;
      var labels = selectedTopics.map(function(id) {
        var match = TOPIC_BUBBLES.filter(function(t) { return t.id === id; })[0];
        return match ? match.label : id;
      });
      // Store as hard system state — survives the entire session
      window.activeUserTopics = labels.slice();
      log('TopicBubbles', 'HARD STATE SET: window.activeUserTopics=' + JSON.stringify(window.activeUserTopics));

      var msg = 'I\u2019d like help with: ' + labels.join(', ');
      // Remove the bubble container
      container.remove();

      // If voice session is active, inject topics via session.update on the data channel.
      // session.update REPLACES instructions entirely, so we send the FULL client-side
      // SYSTEM_PROMPT (all rules: data integrity, sensory, options, phases, report rules)
      // plus the ACTIVE USER TOPICS block — nothing is lost.
      // CRITICAL: session.update must complete BEFORE triggering the AI response,
      // so we delay sendText by 200ms to guarantee the update is processed first.
      var voiceActive = typeof RealtimeVoice !== 'undefined' && RealtimeVoice.getState &&
          RealtimeVoice.getState() !== 'idle' && RealtimeVoice.getState() !== 'error' &&
          RealtimeVoice.sendEvent;

      if (voiceActive) {
        // Phase 33: render user bubble via shared path (voiceOnly — Realtime drives the response)
        submitUserText(msg, { voiceOnly: true, path: 'voice' });
        var topicDirective = '\n\n## ACTIVE USER TOPICS (HARD SYSTEM STATE)\n' +
          'The user selected these topics via the session-start interface: ' +
          labels.join(', ') + '\n' +
          'This is CONFIRMED user intent — not a guess, not optional text. These topics were selected by the user clicking buttons in the UI.\n' +
          'Rules:\n' +
          '- You MUST treat these as the user\'s confirmed areas of need\n' +
          '- Do NOT ask "what can I help you with" or "what do you need help with"\n' +
          '- Do NOT say you cannot see their selections or that you don\'t know what they picked\n' +
          '- Immediately proceed with guidance on these specific topics\n' +
          '- If you still need basic info (name, branch, state), weave it naturally into the topic discussion';
        RealtimeVoice.sendEvent({
          type: 'session.update',
          session: {
            instructions: SYSTEM_PROMPT.join('\n') + topicDirective
          }
        });
        log('TopicBubbles', 'VOICE session.update SENT — delaying sendText 500ms');
        // Phase FBP: delay extended from 200ms → 500ms to reduce race condition where
        // the AI responds before session.update is processed, causing "I can't see your selections"
        setTimeout(function() {
          log('TopicBubbles', 'VOICE sendText firing AFTER session.update delay');
          RealtimeVoice.sendText(msg);
          conversationHistory.push({ role: 'user', content: msg });
        }, 500);
      } else {
        // Text mode — Phase 33: render bubble + send via shared path
        submitUserText(msg);
      }
    });
    container.appendChild(goBtn);

    chatMessages.appendChild(container);
    scrollToBottom();
  }

  // ══════════════════════════════════════════════════════
  //  GENERATE REPORT BUTTON
  // ══════════════════════════════════════════════════════
  var REPORT_MIN_USER_MESSAGES = 4;  // minimum real user messages before showing button

  function maybeShowReportButton() {
    // Debug: log every evaluation so we can see why it does/doesn't trigger
    var alreadyVisible = reportButtonVisible;
    var topicsSubmitted = selectedTopics.length > 0;
    var userMsgCount = conversationHistory.filter(function(m) { return m.role === 'user'; }).length;
    if (chatMessages) {
      var domUserMsgs = chatMessages.querySelectorAll('.message--user').length;
      if (domUserMsgs > userMsgCount) userMsgCount = domUserMsgs;
    }
    var enoughTurns = userMsgCount >= REPORT_MIN_USER_MESSAGES;
    var chatInput = document.getElementById('chatInputText');
    var voiceInput = document.getElementById('chatInputVoice');
    var anchor = (inputMode === 'voice' && voiceInput) ? voiceInput : chatInput;

    log('maybeShowReport', 'alreadyVisible=' + alreadyVisible +
        ' | topicsSubmitted=' + topicsSubmitted +
        ' (selectedTopics.length=' + selectedTopics.length + ')' +
        ' | userMsgCount=' + userMsgCount +
        ' | enoughTurns=' + enoughTurns +
        ' | anchorExists=' + !!(anchor && anchor.parentNode) +
        ' | inputMode=' + inputMode);

    if (alreadyVisible) return;

    if (topicsSubmitted || enoughTurns) {
      showReportButton();
    }
  }

  function showReportButton() {
    if (reportButtonVisible) {
      log('showReportButton', 'SKIP — already visible');
      return;
    }
    reportButtonVisible = true;

    var existing = document.getElementById('generateReportBar');
    if (existing) {
      log('showReportButton', 'SKIP — DOM element already exists');
      return;
    }

    var bar = document.createElement('div');
    bar.className = 'generate-report-bar';
    bar.id = 'generateReportBar';

    var btn = document.createElement('button');
    btn.className = 'generate-report-btn';
    btn.innerHTML = '<span class="generate-report-btn__icon">\uD83D\uDCCB</span> Generate My Report';
    btn.addEventListener('click', function() {
      if (isProcessing) return;
      var msg = 'Just give me the report. Generate my personalized plan based on everything we\'ve discussed so far. If you still need anything critical, ask only the minimum remaining questions needed to complete it \u2014 then generate the report immediately after.';
      // Remove the bar
      bar.remove();
      // Send through normal pipeline
      addMessage(msg, 'user');
      if (inputMode === 'voice' && typeof RealtimeVoice !== 'undefined' && RealtimeVoice.sendText) {
        RealtimeVoice.sendText(msg);
      } else {
        sendToAI(msg);
      }
    });

    bar.appendChild(btn);

    // Insert above the input area — try both anchors for robustness
    var chatInput = document.getElementById('chatInputText');
    var voiceInput = document.getElementById('chatInputVoice');
    var anchor = (inputMode === 'voice' && voiceInput) ? voiceInput : chatInput;
    // Fallback: if primary anchor not found, try the other one
    if (!anchor || !anchor.parentNode) {
      anchor = chatInput || voiceInput;
    }
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(bar, anchor);
      log('showReportButton', 'INSERTED before ' + anchor.id);
    } else {
      // Last resort: append to chatScreen directly
      var screen = document.getElementById('chatScreen');
      if (screen) {
        screen.appendChild(bar);
        log('showReportButton', 'APPENDED to chatScreen (fallback)');
      } else {
        log('showReportButton', 'FAILED — no anchor found');
      }
    }
  }

  // ══════════════════════════════════════════════════════
  //  AIOS — ONBOARDING CARD  (Phase 21)
  //  Shows a brief welcome card for first-time users only.
  //  Dismissed automatically on first AI response or first user send.
  //  Skipped entirely if localStorage 'aaai_returning' === '1'.
  // ══════════════════════════════════════════════════════
  function _showOnboardingCard() {
    if (localStorage.getItem('aaai_returning') === '1') return;
    if (document.getElementById('aiosOnboardCard')) return;
    if (!chatMessages) return;

    var card = document.createElement('div');
    card.id = 'aiosOnboardCard';
    card.className = 'aios-onboard-card';
    card.innerHTML =
      '<p class="aios-onboard-card__headline">Your free veteran navigator is ready.</p>' +
      '<p class="aios-onboard-card__body">I can help you understand your VA benefits, start a disability claim, find state programs, and navigate the paperwork — step by step.</p>' +
      '<p class="aios-onboard-card__hint">Tap a quick start below, or just type your question.</p>' +
      '<button class="aios-onboard-card__skip" id="aiosOnboardSkip" aria-label="Skip intro">Skip</button>';

    if (chatMessages.firstChild) {
      chatMessages.insertBefore(card, chatMessages.firstChild);
    } else {
      chatMessages.appendChild(card);
    }

    var skipBtn = document.getElementById('aiosOnboardSkip');
    if (skipBtn) {
      skipBtn.addEventListener('click', function() { _dismissOnboardCard(); });
    }
  }

  function _dismissOnboardCard() {
    var card = document.getElementById('aiosOnboardCard');
    if (card) {
      card.classList.add('aios-onboard-card--dismissed');
    }
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

      // Phase 21: show onboarding card for first-time users
      _showOnboardingCard();
      // Text mode: full API opening message
      sendToAI('START_CONVERSATION');
    }

    updateModeIcon();
  }

  // ══════════════════════════════════════════════════════
  //  AIOS — VOICE INTELLIGENCE UPDATE  (Phase 19)
  //  Called after each accepted final voice transcript.
  //  Runs the same AIOS layer as the text path:
  //    1. Memory extraction  (extractMemoryFromInput)
  //    2. Mission detection  (detectMissionFromInput)
  //    3. Skill routing      (Router.routeAIOSIntent)
  //    4. session.update     (injects AIOS system prompt into live voice session)
  //  Steps 1-2 always run.  Steps 3-4 only run when a specific skill is routed
  //  (matches text-path behavior — GENERAL_QUESTION keeps existing session instructions).
  //  Fully wrapped in try/catch — voice transport is never affected by AIOS failures.
  // ══════════════════════════════════════════════════════
  function _aiosVoiceUpdate(transcript) {
    try {
      // ── Guards ──
      if (!window.AIOS || !window.AIOS.Router || !window.AIOS.RequestBuilder) return;
      if (!transcript || transcript.trim().length < 3) return;
      if (transcript === 'START_CONVERSATION') return;
      if (typeof RealtimeVoice === 'undefined' || !RealtimeVoice.sendEvent) return;
      var _vs = RealtimeVoice.getState ? RealtimeVoice.getState() : 'idle';
      if (_vs === 'idle' || _vs === 'error') return;

      // ── 1. Memory extraction ──────────────────────────
      if (window.AIOS.Memory &&
          typeof window.AIOS.Memory.extractMemoryFromInput === 'function') {
        var _extracted = window.AIOS.Memory.extractMemoryFromInput(transcript);
        if (Object.keys(_extracted).length > 0) {
          window.AIOS.Memory.profile = window.AIOS.Memory.mergeMemory(
            window.AIOS.Memory.profile, _extracted
          );
          log('AIOS:VOICE', 'memory: ' + JSON.stringify(_extracted));
          // Persist asynchronously for authenticated users (non-blocking)
          if (typeof window.AIOS.Memory.save === 'function') {
            window.AIOS.Memory.save();
          }
        }
      }

      // ── 2. Mission detection ──────────────────────────
      if (window.AIOS.Mission &&
          typeof window.AIOS.Mission.detectMissionFromInput === 'function' &&
          !window.AIOS.Mission.current) {
        var _mSeed = window.AIOS.Mission.detectMissionFromInput(transcript);
        if (_mSeed && typeof window.AIOS.Mission.createMission === 'function') {
          var _newMission = window.AIOS.Mission.createMission(_mSeed.type);
          if (_newMission) {
            window.AIOS.Mission.current = _newMission;
            log('AIOS:VOICE', 'mission: ' + _mSeed.type + ' matched="' + _mSeed.matched + '"');
          }
        }
      }

      // ── 3. Route intent ───────────────────────────────
      var _vRoute = window.AIOS.Router.routeAIOSIntent(transcript);
      log('AIOS:VOICE', 'intent=' + _vRoute.intent +
        ' | skill=' + (_vRoute.skill || 'none') +
        ' | confidence=' + _vRoute.confidence);

      // Only activate AIOS session.update when a specific skill is routed
      if (!_vRoute.skill || !window.AIOS.SkillLoader) return;

      var _vSkill = window.AIOS.SkillLoader.loadAIOSSkill(_vRoute.skill);
      if (!_vSkill || typeof _vSkill.run !== 'function') return;

      // ── 4. Build AIOS system prompt ───────────────────
      var _vProfile = window.AIOS.Memory ? window.AIOS.Memory.getProfile() : {};
      var _vSkillCfg = _vSkill.run({
        profile:   _vProfile,
        history:   conversationHistory,
        userInput: transcript
      });
      log('AIOS:VOICE', 'skill=' + _vSkill.name);

      // Phase 36: include activeUserTopics so voice AIOS prompt stays in sync with
      // any topic selections the user made via the sidebar or chip buttons.
      var _vPageCtx = (window.activeUserTopics && window.activeUserTopics.length > 0)
        ? { page: 'chat', topics: window.activeUserTopics, inputMode: 'voice' }
        : null;
      var _vReq = window.AIOS.RequestBuilder.buildAIOSRequest({
        userMessage:   transcript,
        routeResult:   _vRoute,
        skillConfig:   _vSkillCfg,
        memoryContext: window.AIOS.Memory ? window.AIOS.Memory.getProfile() : null,
        pageContext:   _vPageCtx
      });

      // ── 5. Inject via session.update ──────────────────
      // session.update replaces the live session instructions on OpenAI's side.
      // This affects the CURRENT response in flight (if not yet complete) and
      // all subsequent responses — same semantics as topic-bubble injection.
      if (_vReq && _vReq.system && _vReq.system.length > 0) {
        RealtimeVoice.sendEvent({
          type: 'session.update',
          session: { instructions: _vReq.system }
        });
        log('AIOS:VOICE', 'session.update SENT | systemLen=' + _vReq.system.length +
          ' | skill=' + _vReq.meta.skill +
          ' | hasMemory=' + _vReq.meta.hasMemory +
          ' | hasMission=' + _vReq.meta.hasMission);
      }

    } catch (_aiosVErr) {
      // AIOS failure is silent — voice transport continues unaffected
      log('AIOS:VOICE', 'FALLBACK — ' + (_aiosVErr.message || String(_aiosVErr)));
    }
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
    voiceGreetingSent = false;
    var _lastVoiceText = ''; // Phase FBP: per-session dedup guard — prevents duplicate user bubbles
    setVoiceUI('connecting', 'Connecting to voice...');

    // Wire callbacks
    RealtimeVoice.onStateChange = function(state, detail) {
      log('RT.onStateChange', state + (detail ? ': ' + detail : ''));

      switch (state) {
        case 'connecting':
          setVoiceUI('connecting', detail || 'Connecting...');
          break;
        case 'connected':
          setVoiceUI('listening');
          break;
        case 'listening':
          setVoiceUI('listening');
          if (!voiceGreetingSent) {
            voiceGreetingSent = true;
            RealtimeVoice.sendText('START_CONVERSATION');
          }
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
        // Quality gate: reject single-char, pure filler, or background-noise transcripts.
        // Phase 36: threshold lowered to 2 so valid short replies ("yes", "no", "ok",
        // "yep", "nope") are never silently dropped.  Pure-numeric strings (tones/beeps
        // transcribed as digits) and the tightest filler-only patterns are still blocked.
        var trimmed = (text || '').trim();
        if (trimmed.length < 2 ||
            /^\s*(uh+|um+|hmm+|ah+|oh+|huh|er+|mhm+)\s*\.?$/i.test(trimmed) ||
            /^[\d\s\.\,\!\?\-]+$/.test(trimmed)) {
          log('RT.onUserTranscript', 'REJECTED (filler/short/noise): "' + trimmed + '"');
          return;
        }
        // Phase FBP: dedup guard — OpenAI Realtime can fire isFinal=true more than once
        // for the same utterance; skip if identical to the last accepted transcript
        if (trimmed === _lastVoiceText) {
          log('RT.onUserTranscript', 'DEDUP (duplicate final): "' + trimmed.substring(0, 40) + '"');
          return;
        }
        _lastVoiceText = trimmed;
        // Phase 33: render bubble + escalation check via shared path (voiceOnly — Realtime drives response)
        submitUserText(trimmed, { voiceOnly: true, path: 'voice' });
        // Phase 36: use trimmed (consistent with bubble + memory extraction)
        conversationHistory.push({ role: 'user', content: trimmed });
        // Phase 32: Telemetry — voice transcript accepted
        if (window.AIOS && window.AIOS.Telemetry) { window.AIOS.Telemetry.record('voice_transcript_accepted', {}); }
        // Phase 19: AIOS voice intelligence — memory, mission, routing, session.update
        _aiosVoiceUpdate(text);
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
      // Phase 36: Add AI voice response to conversationHistory so the Claude text model
      // has continuity if the user switches from voice to text mid-session.
      // Compact to 800 chars max — preserves meaningful context without flooding the token window.
      var _vcAI = fullText.length > 800 ? fullText.substring(0, 797) + '…' : fullText;
      conversationHistory.push({ role: 'assistant', content: _vcAI });
      // Set reportGenerated before addMessage so injectLegalDocButton gate passes for report
      if (!reportGenerated && isReportResponse(fullText)) {
        reportGenerated = true;
      }
      addMessage(fullText, 'ai');
      hideCaption();

      // Show topic bubbles once after voice greeting
      if (!topicBubblesShown) {
        topicBubblesShown = true;
        renderTopicBubbles();
      }

      // Show Generate Report button when conditions met
      maybeShowReportButton();

      // Phase 2: Detect report from voice mode too
      if (isReportResponse(fullText)) {
        log('Report', 'detected (voice) — showing actions');
        reportGenerated = true;
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
    if (!text || text.length < 2 || isProcessing) return;

    userInput.value = '';
    userInput.style.height = 'auto';
    submitUserText(text);
  }

  // ══════════════════════════════════════════════════════
  //  SHARED USER-TEXT SUBMISSION (Phase 33)
  //  Single canonical path for all non-typed user inputs:
  //  chips, topic bubbles, option buttons, voice transcripts.
  //
  //  opts.voiceOnly  {boolean} — render bubble + escalation check,
  //                              but skip sendToAI (Realtime API handles response)
  //  opts.topicLabel {string}  — push label into window.activeUserTopics so
  //                              callChatEndpoint injects the ACTIVE USER TOPICS block
  //  opts.path       {string}  — 'voice' | 'text' (telemetry label; defaults 'text')
  // ══════════════════════════════════════════════════════
  function submitUserText(text, opts) {
    opts = opts || {};
    var trimmed = (text || '').trim();
    if (!trimmed || trimmed.length < 2) return;

    // Register optional topic label so AIOS callChatEndpoint injects the topic context block
    if (opts.topicLabel) {
      if (!Array.isArray(window.activeUserTopics)) { window.activeUserTopics = []; }
      if (window.activeUserTopics.indexOf(opts.topicLabel) === -1) {
        window.activeUserTopics.push(opts.topicLabel);
      }
    }

    // Always render the user bubble — never silently dropped
    addMessage(trimmed, 'user');
    showCaption('You', trimmed);

    // Escalation check — show safety banners and record telemetry
    var _erS = (window.AIOS && window.AIOS.Router) ? window.AIOS.Router.routeAIOSIntent(trimmed) : null;
    if (_erS && _erS.tier === 'CRISIS') {
      showCrisisBanner();
      if (window.AIOS && window.AIOS.Telemetry) { window.AIOS.Telemetry.record('escalation_triggered', { tier: 'CRISIS', path: opts.path || 'text' }); }
    } else if (_erS && _erS.tier === 'AT_RISK') {
      showAtRiskBanner();
      if (window.AIOS && window.AIOS.Telemetry) { window.AIOS.Telemetry.record('escalation_triggered', { tier: 'AT_RISK', path: opts.path || 'text' }); }
    }

    // Voice-only: bubble + escalation is sufficient; Realtime API drives the response
    if (opts.voiceOnly) { return; }

    // Text mode: send immediately, or queue for when the current response finishes
    if (!isProcessing) {
      sendToAI(trimmed);
    } else {
      // Newest submission wins — replace any earlier pending entry
      pendingUserSubmission = { text: trimmed, opts: opts || {} };
      log('[AAAI]', 'queued user submission while processing: "' + trimmed.substring(0, 40) + '"');
      // Failsafe: if isProcessing never clears (stuck stream, unhandled error), force-flush after 5s
      var _failsafeText = trimmed;
      setTimeout(function() {
        if (pendingUserSubmission && pendingUserSubmission.text === _failsafeText) {
          var _fallback = pendingUserSubmission;
          pendingUserSubmission = null;
          log('[AAAI]', 'FAILSAFE flush triggered: "' + _fallback.text.substring(0, 40) + '"');
          sendToAI(_fallback.text);
        }
      }, 5000);
    }
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

  // Phase 22 — AT_RISK detection (only call after checkCrisis() returns false)
  function checkAtRisk(text) {
    var lower = text.toLowerCase();
    return AT_RISK_KEYWORDS.some(function(kw) { return lower.includes(kw); });
  }

  // Phase 22 — AT_RISK in-chat message (softer than crisis — no fixed top bar)
  function showAtRiskBanner() {
    var div = document.createElement('div');
    div.className = 'message message--at-risk';
    div.innerHTML =
      '<strong>Veterans Support Resources</strong>' +
      '<p>VA Emergency Assistance: <a href="tel:18008271000">1-800-827-1000</a></p>' +
      '<p>Homeless Veterans Hotline: <a href="tel:18774243838">877-424-3838</a></p>' +
      '<p>Local Services (211): <a href="tel:211">Dial 211</a></p>' +
      '<p style="margin-top:8px;font-size:0.85rem;">You\'ve come to the right place. Let\'s find the right help together.</p>';
    if (chatMessages) chatMessages.appendChild(div);
    scrollToBottom();
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

    // ── Phase 35: Memory extraction on EVERY real user message ──────
    // Runs BEFORE routing and request building so memory/eligibility
    // context is available when callChatEndpoint assembles the prompt.
    if (userText !== 'START_CONVERSATION' && window.AIOS && window.AIOS.Memory) {
      try {
        var _extracted = window.AIOS.Memory.extractMemoryFromInput(userText);
        if (_extracted && Object.keys(_extracted).length > 0) {
          var _merged = window.AIOS.Memory.mergeMemory(window.AIOS.Memory.profile, _extracted);
          window.AIOS.Memory.profile = _merged;
          log('MEMORY', 'extracted: ' + Object.keys(_extracted).join(', '));
          // Persist to Supabase if authenticated (non-blocking)
          if (typeof window.AIOS.Memory.save === 'function') {
            window.AIOS.Memory.save().catch(function() {});
          }
        }
        // Phase 35: Auto-detect mission from user input if none active
        if (window.AIOS.Mission && !window.AIOS.Mission.isActive() &&
            typeof window.AIOS.Mission.detectMissionFromInput === 'function') {
          var _missionSeed = window.AIOS.Mission.detectMissionFromInput(userText);
          if (_missionSeed && _missionSeed.type) {
            var _newMission = window.AIOS.Mission.createMission(_missionSeed.type);
            if (_newMission) {
              window.AIOS.Mission.current = _newMission;
              log('MISSION', 'auto-created: ' + _newMission.name + ' (matched: ' + _missionSeed.matched + ')');
            }
          }
        }
      } catch (_memErr) {
        console.warn('[AIOS][MEMORY] extraction error:', _memErr.message || _memErr);
      }
    }

    if (userText !== 'START_CONVERSATION') {
      conversationHistory.push({ role: 'user', content: userText });
      // Fire audit_started on the first real user message only
      var realMsgCount = conversationHistory.filter(function(m) { return m.role === 'user'; }).length;
      if (realMsgCount === 1) {
        window.dispatchEvent(new CustomEvent('aaai:audit_started'));
        log('Analytics', 'dispatched aaai:audit_started');
        localStorage.setItem('aaai_returning', '1'); // Phase 21 — mark as returning
        _dismissOnboardCard(); // Phase 21 — immediate dismiss on first real send
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
        // Phase 33: flush any queued non-typed submission (chip/button clicked during AI response)
        if (pendingUserSubmission) {
          var _queued = pendingUserSubmission;
          pendingUserSubmission = null;
          log('[AAAI]', 'FORCE flush queued submission: "' + _queued.text.substring(0, 40) + '"');
          setTimeout(function() { sendToAI(_queued.text); }, 50);
        }

        // Show topic bubbles once after the opening greeting
        if (!topicBubblesShown && userText === 'START_CONVERSATION') {
          topicBubblesShown = true;
          renderTopicBubbles();
        }

        // Show Generate Report button when conditions met
        maybeShowReportButton();

        // Phase 2: Detect report and show PDF download + checklist
        if (isReportResponse(aiResponse)) {
          log('Report', 'detected — showing actions');
          reportGenerated = true;
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
          maybeShowReportButton();
          // Phase 33: flush queued submission (mock-response recovery path)
          if (pendingUserSubmission) {
            var _queued2 = pendingUserSubmission;
            pendingUserSubmission = null;
            log('[AAAI]', 'FORCE flush queued submission (mock path): "' + _queued2.text.substring(0, 40) + '"');
            setTimeout(function() { sendToAI(_queued2.text); }, 50);
          }
        });
      } else {
        addMessage('I\'m having trouble connecting right now. Please try again in a moment. If you need immediate help, call the Veterans Crisis Line at 988 (Press 1).', 'ai');
        isProcessing = false;
        if (btnSend) btnSend.disabled = false;
        maybeShowReportButton();
        // Phase 33: flush queued submission (hard-error recovery path)
        if (pendingUserSubmission) {
          var _queued3 = pendingUserSubmission;
          pendingUserSubmission = null;
          log('[AAAI]', 'FORCE flush queued submission (error path): "' + _queued3.text.substring(0, 40) + '"');
          setTimeout(function() { sendToAI(_queued3.text); }, 50);
        }
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
    _dismissOnboardCard(); // Phase 21
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
        div.innerHTML = formatMessage(fullText);
        // Set reportGenerated before injectLegalDocButton so the gate passes for the report message
        if (!reportGenerated && isReportResponse(fullText)) {
          reportGenerated = true;
        }
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
      return 'Welcome to AfterAction AI. I\'m here to help you find every benefit, resource, and organization you\'ve earned through your service \u2014 and build you a personalized plan. Free. No forms. No judgment.\n\nBefore we start talking, here\'s a tip: the more documents you upload up front, the more accurate and personalized your plan will be \u2014 and the fewer questions I\'ll need to ask.\n\nTap the upload button (arrow icon at the bottom) and drop in anything you have: DD-214, VA Disability Rating Letter, VA Benefits Summary, military transcripts, resume, certificates, or diplomas. I\'ll pull the details automatically.\n\nUpload as many as you want, or none at all. Your information is used only to help build your plan. Some data may be securely stored to improve your experience, but it is never sold or shared. Your privacy matters.\n\nWhen you\'re ready \u2014 uploaded or not \u2014 just tell me: what branch did you serve in?\n\n[OPTIONS: Army | Navy | Air Force | Marine Corps | Coast Guard | Space Force | National Guard | Reserve | I\'m a family member]';
    }
    return null;
  }

  // ── SERVERLESS PROXY ────────────────────────────────
  function callChatEndpoint(messages) {
    log('callChatEndpoint', 'messages=' + messages.length);

    // ── AIOS Integration (text path only) ─────────────────
    // If the AIOS layer is loaded, route through it to get a richer system prompt.
    // Falls back to the original SYSTEM_PROMPT if AIOS is unavailable or errors.
    var systemPrompt = SYSTEM_PROMPT;  // already a string (joined at definition)
    var aiosActive = false;

    try {
      if (window.AIOS && window.AIOS.Router && window.AIOS.RequestBuilder) {
        // Get the last user message for routing
        var lastUserMsg = '';
        for (var i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') { lastUserMsg = messages[i].content; break; }
        }

        if (lastUserMsg) {
          // 1. Route — classify intent and select skill
          var routeResult = window.AIOS.Router.routeAIOSIntent(lastUserMsg);
          console.log('[AIOS][ROUTER] intent=' + routeResult.intent + ' | skill=' + (routeResult.skill || 'none') + ' | confidence=' + routeResult.confidence + (routeResult.matched ? ' | matched="' + routeResult.matched + '"' : ''));

          // Phase 32: Telemetry — escalation tier (text path)
          if (routeResult.tier !== 'STANDARD' && window.AIOS && window.AIOS.Telemetry) {
            window.AIOS.Telemetry.record('escalation_triggered', { tier: routeResult.tier, path: 'text' });
          }

          // [AIOS][MEMORY] — log veteran profile summary (if any data collected)
          if (window.AIOS.Memory && typeof window.AIOS.Memory.buildMemorySummary === 'function') {
            var _memSum = window.AIOS.Memory.buildMemorySummary(window.AIOS.Memory.getProfile());
            console.log('[AIOS][MEMORY] ' + (_memSum || 'no profile data yet'));
          }

          // [AIOS][MISSION] — log active mission summary (if one is running)
          if (window.AIOS.Mission && typeof window.AIOS.Mission.buildMissionSummary === 'function') {
            var _misSum = window.AIOS.Mission.current
              ? window.AIOS.Mission.buildMissionSummary(window.AIOS.Mission.current)
              : null;
            console.log('[AIOS][MISSION] ' + (_misSum || 'no active mission'));
          }

          // 2. Only activate AIOS when a specific skill is routed.
          //    GENERAL_QUESTION (skill === null) uses the legacy SYSTEM_PROMPT
          //    so intake phases, OPTIONS, templates, and all existing rules are preserved.
          if (routeResult.skill && window.AIOS.SkillLoader) {
            var skill = window.AIOS.SkillLoader.loadAIOSSkill(routeResult.skill);
            if (skill && typeof skill.run === 'function') {
              var profile = (window.AIOS.Memory) ? window.AIOS.Memory.getProfile() : {};
              var skillConfig = skill.run({ profile: profile, history: messages, userInput: lastUserMsg, tier: routeResult.tier || 'STANDARD' }); // Phase 22
              console.log('[AIOS][SKILL] ' + skill.name + ' | intent=' + routeResult.intent);

              // Phase 25: Chain — if the skill returned a chain handoff, register it.
              // Chain.set() applies all safety gates (CRISIS/AT_RISK/cooldown) internally.
              // The suggestion engine will surface it as S0 after the response streams.
              if (skillConfig && skillConfig.data && skillConfig.data.chain && window.AIOS.Chain) {
                window.AIOS.Chain.set(skillConfig.data.chain, routeResult.tier || 'STANDARD');
                console.log('[AIOS][CHAIN] queued nextSkill=' + skillConfig.data.chain.nextSkill);
              }

              // 3. Build AIOS request — core prompt + skill + memory + page context
              var pageContext = null;
              if (window.activeUserTopics && window.activeUserTopics.length > 0) {
                pageContext = { page: 'chat', topics: window.activeUserTopics, inputMode: inputMode };
              }

              var aiosRequest = window.AIOS.RequestBuilder.buildAIOSRequest({
                userMessage: lastUserMsg,
                routeResult: routeResult,
                skillConfig: skillConfig,
                memoryContext: (window.AIOS.Memory) ? window.AIOS.Memory.getProfile() : null,
                pageContext: pageContext
              });

              if (aiosRequest && aiosRequest.system && aiosRequest.system.length > 0) {
                // Phase 34: AIOS AUGMENTS SYSTEM_PROMPT — never replaces it.
                // SYSTEM_PROMPT (conversation phases, OPTIONS format, intake flow, tone rules)
                // stays first. AIOS content (skill prompt, memory, eligibility, mission) is
                // appended after so the full operational ruleset is always present.
                systemPrompt = SYSTEM_PROMPT + '\n\n' + aiosRequest.system;
                aiosActive = true;
                console.log('[AIOS][REQUEST] systemLen=' + systemPrompt.length + ' (base=' + SYSTEM_PROMPT.length + ' + aios=' + aiosRequest.system.length + ') | intent=' + aiosRequest.meta.intent + ' | skill=' + aiosRequest.meta.skill + ' | hasMemory=' + aiosRequest.meta.hasMemory + ' | hasPageContext=' + aiosRequest.meta.hasPageContext);
              }
            }
          } else {
            // ── Phase 35: GENERAL_QUESTION still gets memory/eligibility/mission context ──
            // No skill prompt, but veteran profile, eligibility scores, active mission,
            // and page context are still injected so the AI has conversational memory.
            log('AIOS', 'no skill routed (intent=' + routeResult.intent + ') — injecting AIOS context without skill');
            try {
              var _gqPageCtx = null;
              if (window.activeUserTopics && window.activeUserTopics.length > 0) {
                _gqPageCtx = { page: 'chat', topics: window.activeUserTopics, inputMode: inputMode };
              }
              var _gqRequest = window.AIOS.RequestBuilder.buildAIOSRequest({
                userMessage: lastUserMsg,
                routeResult: routeResult,
                skillConfig: null,
                memoryContext: (window.AIOS.Memory) ? window.AIOS.Memory.getProfile() : null,
                pageContext: _gqPageCtx
              });
              if (_gqRequest && _gqRequest.system && _gqRequest.system.length > 0) {
                systemPrompt = SYSTEM_PROMPT + '\n\n' + _gqRequest.system;
                aiosActive = true;
                console.log('[AIOS][GENERAL] systemLen=' + systemPrompt.length + ' | hasMemory=' + _gqRequest.meta.hasMemory + ' | hasMission=' + _gqRequest.meta.hasMission + ' | confidence=' + _gqRequest.meta.confidenceLevel);
              }
            } catch (_gqErr) {
              log('AIOS', 'GENERAL_QUESTION context injection error: ' + _gqErr.message);
            }
          }
        }
      }
    } catch (aiosErr) {
      // AIOS failed — fall back silently to original SYSTEM_PROMPT
      log('AIOS', 'FALLBACK — error: ' + aiosErr.message);
      // Phase 32: Telemetry — record fallback event (error type only, no user text)
      try {
        if (window.AIOS && window.AIOS.Telemetry) {
          window.AIOS.Telemetry.record('aios_fallback', { err: aiosErr.message });
        }
      } catch (e) { /* never let telemetry break the fallback path */ }
      systemPrompt = SYSTEM_PROMPT;
      aiosActive = false;
    }

    // Build request payload
    var payload = {
      system: systemPrompt,
      messages: messages.length === 0
        ? [{ role: 'user', content: 'Begin the conversation. Send your opening welcome message.' }]
        : messages
    };

    // Inject active topics as hard system state (preserved for backward compatibility;
    // AIOS also handles topics via pageContext, but the server-side system_suffix
    // ensures the existing chat.js topic injection continues to work)
    if (window.activeUserTopics && window.activeUserTopics.length > 0) {
      var topicBlock = '\n\n## ACTIVE USER TOPICS (HARD SYSTEM STATE)\n' +
        'The user selected these topics via the session-start interface: ' +
        window.activeUserTopics.join(', ') + '\n' +
        'This is CONFIRMED user intent — not a guess, not optional text. These topics were selected by the user clicking buttons in the UI.\n' +
        'Rules:\n' +
        '- You MUST treat these as the user\'s confirmed areas of need\n' +
        '- Do NOT ask "what can I help you with" or "what do you need help with"\n' +
        '- Do NOT say you cannot see their selections or that you don\'t know what they picked\n' +
        '- Immediately proceed with guidance on these specific topics\n' +
        '- If you still need basic info (name, branch, state), weave it naturally into the topic discussion';
      payload.system_suffix = topicBlock;
      log('callChatEndpoint', 'injecting ACTIVE USER TOPICS: ' + window.activeUserTopics.join(', '));
    }

    log('callChatEndpoint', 'AIOS=' + (aiosActive ? 'active' : 'fallback') + ', systemLen=' + systemPrompt.length);

    return fetch(CONFIG.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
      _dismissOnboardCard(); // Phase 21
      div.innerHTML = formatMessage(text);
      // Phase 3.5: inject Download Word Doc button for legal template responses
      injectLegalDocButton(div, text);
    } else {
      div.textContent = text;
    }

    if (chatMessages) chatMessages.appendChild(div);

    scrollToBottom();
  }

  // ══════════════════════════════════════════════════════
  //  DOC READINESS GATE (Phase 3.7)
  //  Gates the Word Doc button behind info-collection checks.
  //  Readiness shape: { documentType, status, collected, missing }
  //  Statuses: NOT_READY | ALMOST_READY | READY
  // ══════════════════════════════════════════════════════
  var DocReadinessGate = (function () {

    var REQUIRED_FIELDS = {
      'living-will':                    ['fullName', 'state', 'healthcareAgent'],
      'last-will-and-testament':        ['fullName', 'state', 'executor'],
      'general-power-of-attorney':      ['fullName', 'state', 'agentName'],
      'durable-power-of-attorney':      ['fullName', 'state', 'agentName'],
      'medical-power-of-attorney':      ['fullName', 'state', 'agentName'],
      'hipaa-authorization-form':       ['fullName', 'state'],
      'nexus-letter':                   ['fullName', 'condition', 'serviceConnection'],
      'va-appeal-letter':               ['fullName', 'condition'],
      'va-claim-personal-statement':    ['fullName', 'condition'],
      'records-request-letter':         ['fullName'],
      'benefits-eligibility-summary':   ['fullName'],
      'debt-hardship-letter':           ['fullName', 'creditorName'],
      'credit-dispute-letter':          ['fullName'],
      'budget-financial-recovery-plan': ['fullName'],
      'va-loan-readiness-checklist':    ['fullName'],
      'rental-application-packet':      ['fullName'],
      'federal-resume-usajobs':         ['fullName', 'branch', 'yearsService'],
      'resume-builder':                 ['fullName', 'branch'],
      'military-skills-translator':     ['branch', 'mos'],
      'linkedin-profile-builder':       ['fullName', 'branch'],
      'salary-negotiation-script':      ['targetRole', 'branch'],
      'interview-prep-star':            ['targetRole', 'branch']
    };

    var FIELD_LABELS = {
      fullName:          'Full legal name',
      state:             'State of residence',
      agentName:         'Agent / attorney-in-fact name',
      healthcareAgent:   'Healthcare agent name',
      executor:          'Executor name',
      condition:         'Disability / condition',
      serviceConnection: 'Service connection details',
      branch:            'Military branch',
      mos:               'MOS / job specialty',
      yearsService:      'Years of service',
      targetRole:        'Target job or role',
      creditorName:      'Creditor or lender name'
    };

    var DOC_LABELS = {
      'living-will':                    'Living Will',
      'last-will-and-testament':        'Last Will & Testament',
      'general-power-of-attorney':      'General Power of Attorney',
      'durable-power-of-attorney':      'Durable Power of Attorney',
      'medical-power-of-attorney':      'Medical Power of Attorney',
      'hipaa-authorization-form':       'HIPAA Authorization',
      'nexus-letter':                   'Nexus Letter',
      'va-appeal-letter':               'VA Appeal Letter',
      'va-claim-personal-statement':    'VA Claim Personal Statement',
      'records-request-letter':         'Records Request Letter',
      'benefits-eligibility-summary':   'Benefits Eligibility Summary',
      'debt-hardship-letter':           'Debt Hardship Letter',
      'credit-dispute-letter':          'Credit Dispute Letter',
      'budget-financial-recovery-plan': 'Budget & Financial Recovery Plan',
      'va-loan-readiness-checklist':    'VA Loan Readiness Checklist',
      'rental-application-packet':      'Rental Application Packet',
      'federal-resume-usajobs':         'Federal Resume (USAJOBS)',
      'resume-builder':                 'Military Resume',
      'military-skills-translator':     'Military Skills Translator',
      'linkedin-profile-builder':       'LinkedIn Profile Builder',
      'salary-negotiation-script':      'Salary Negotiation Script',
      'interview-prep-star':            'Interview Prep (STAR Method)'
    };

    // Field detectors — scan combined conversation text for evidence of each field
    var FIELD_DETECTORS = {
      fullName: function (t) {
        return /(?:my name is|name\s*:|i am|i'm)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/i.test(t) ||
               /\b[A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?\b/.test(t);
      },
      state: function (t) {
        return /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i.test(t);
      },
      agentName: function (t) {
        // keyword → name  (original)
        return /(?:agent|attorney.in.fact|power of attorney for|i authorize|i name|i appoint)\s+(?:is\s+|named?\s+)?[A-Z][a-z]+/i.test(t) ||
        // name → keyword  (natural speech: "My agent is John Smith" / "John Smith as my agent")
               /\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\s+(?:is|will be|as)\s+(?:my\s+)?(?:agent|attorney[- ]in[- ]fact)\b/i.test(t) ||
               /(?:my\s+)?(?:agent|attorney[- ]in[- ]fact)\s+(?:is|will be)\s+\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\b/i.test(t);
      },
      healthcareAgent: function (t) {
        // keyword → name  (original)
        return /(?:health\s*care\s*(?:agent|proxy|representative)|medical\s*agent|healthcare\s*agent)\s*(?:is\s+|named?\s+|:\s*)?[A-Z][a-z]+/i.test(t) ||
               /(?:my agent|my proxy)\s+for\s+(?:health|medical)/i.test(t) ||
        // name → keyword  (natural speech: "John Smith is my healthcare agent")
               /\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\s+(?:is|will be|as)\s+(?:my\s+)?(?:health\s*care|medical|healthcare)\s*(?:agent|proxy|representative)\b/i.test(t) ||
               /(?:my\s+)?(?:health\s*care|medical|healthcare)\s*(?:agent|proxy|representative)\s+(?:is|will be)\s+\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\b/i.test(t);
      },
      executor: function (t) {
        // keyword → name  (original)
        return /(?:executor|personal representative)\s+(?:is\s+|named?\s+|:\s*)?[A-Z][a-z]+/i.test(t) ||
               /i name\s+[A-Z][a-z]+\s+(?:as|to be)\s+(?:my\s+)?executor/i.test(t) ||
        // name → keyword  (natural speech: "John Smith is my executor" / "John Smith as executor")
               /\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\s+(?:is|will be|as)\s+(?:my\s+)?(?:executor|personal representative)\b/i.test(t) ||
               /(?:my\s+)?(?:executor|personal representative)\s+(?:is|will be)\s+\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2}\b/i.test(t);
      },
      condition: function (t) {
        return /(?:condition|disability|diagnosis|rating for|claiming for|service.connected for|tinnitus|ptsd|tbi|traumatic brain|sleep apnea|hearing loss|back pain|knee|hip|shoulder|anxiety|depression)/i.test(t);
      },
      serviceConnection: function (t) {
        return /(?:in.service|during(?:\s+my)?\s+service|service.connected|nexus|caused by|aggravated by|incurred during|military service caused)/i.test(t);
      },
      branch: function (t) {
        return /\b(army|navy|air force|marine corps|marines|coast guard|space force|national guard|reserve)\b/i.test(t);
      },
      mos: function (t) {
        return /\b(?:\d{2}[A-Z]|[A-Z]\d[A-Z]{1,2})\b/.test(t) ||
               /\b(?:MOS|AFSC|NEC|military occupation|job specialty|job title)\b/i.test(t);
      },
      yearsService: function (t) {
        return /(?:\d+\s+years?(?:\s+of\s+service)?|served\s+(?:for\s+)?\d+|years?\s+in\s+(?:the\s+)?(?:military|service|army|navy|air force|marines))/i.test(t);
      },
      targetRole: function (t) {
        return /(?:target(?:ing)?\s+(?:role|position|job)|applying\s+(?:for|to)|want(?:ing)?\s+to\s+(?:be|work|get)|career\s+goal|looking\s+for\s+(?:a\s+)?(?:job|position|role))/i.test(t);
      },
      creditorName: function (t) {
        return /(?:creditor|owed?\s+to|debt\s+(?:to|with)|lender|bank|credit\s+card|loan\s+(?:from|with)|account\s+with)/i.test(t);
      }
    };

    // Returns true if the AI response is a completed document draft
    // (vs. an exploratory discussion of the document topic)
    function isDocumentDraft(text) {
      if (!text || text.length < 400) return false;
      var lineBreaks = (text.match(/\n/g) || []).length;
      if (lineBreaks < 3) return false;
      var structureTests = [
        /^#{1,4}\s+\S/m,
        /\*\*[A-Z][^*\n]{2,}\*\*/,
        /^[A-Z\s]{6,}$/m,
        /\[[^\]]{2,40}\]/,
        /\b(?:WHEREAS|HEREBY|WITNESSETH|THERETO|HERETOFORE)\b/i,
        /Section\s+\d+/i,
        /Article\s+[IVX\d]+/i,
        /THIS\s+\w+\s+(?:AGREEMENT|DOCUMENT|DECLARATION)\b/i
      ];
      var matches = structureTests.filter(function (re) { return re.test(text); }).length;
      return matches >= 1;
    }

    function assess(formType, responseText, history) {
      if (!formType) return null;

      // Scan ONLY user-submitted messages — prevents AI option text false-positives (Phase 3.8)
      var userTextOnly = (history || []).filter(function (m) {
        return m && m.role === 'user';
      }).map(function (m) {
        return m.content || '';
      }).join(' ');

      var requiredFields = REQUIRED_FIELDS[formType] || ['fullName'];
      var collected = [];
      var missing = [];

      requiredFields.forEach(function (field) {
        var detector = FIELD_DETECTORS[field];
        if (detector && detector(userTextOnly)) {
          collected.push(field);
        } else {
          missing.push(field);
        }
      });

      // READY only when ALL required fields are collected (Phase 3.8: isDraft path removed)
      var status;
      if (missing.length === 0) {
        status = 'READY';
      } else if (collected.length >= 1 && missing.length <= 1) {
        status = 'ALMOST_READY';
      } else {
        status = 'NOT_READY';
      }

      return { documentType: formType, status: status, collected: collected, missing: missing };
    }

    function injectStatusCard(messageDiv, readiness) {
      // Hard idempotency guard — scoped to this container only, not global document
      if (messageDiv.querySelector('.legal-doc-status-card')) return;
      var isAlmost = readiness.status === 'ALMOST_READY';
      var docTitle = DOC_LABELS[readiness.documentType] || readiness.documentType;
      var icon = isAlmost ? '🔶' : '📋';
      var statusLabel = isAlmost ? 'Almost Ready' : 'Details Needed';

      var html = '<div style="font-weight:600;margin-bottom:6px;">' + icon + ' ' + docTitle + ' \u2014 ' + statusLabel + '</div>';

      readiness.collected.forEach(function (f) {
        html += '<div style="color:#1a7a1a;font-size:12px;padding:2px 0;">\u2713 ' + (FIELD_LABELS[f] || f) + '</div>';
      });
      readiness.missing.forEach(function (f) {
        html += '<div style="color:#b03030;font-size:12px;padding:2px 0;">\u2717 ' + (FIELD_LABELS[f] || f) + ' needed</div>';
      });
      html += '<div style="margin-top:7px;font-size:12px;color:#555;font-style:italic;">I\'ll generate your Word Doc once we have all the details above.</div>';

      var card = document.createElement('div');
      card.className = 'legal-doc-status-card';
      card.style.cssText = 'margin-top:12px;padding:11px 14px;border-radius:8px;font-size:13px;line-height:1.6;' +
        'background:' + (isAlmost ? '#fff8e6' : '#f0f4ff') + ';' +
        'border:1px solid ' + (isAlmost ? '#f5c518' : '#c7d2f5') + ';';
      card.innerHTML = html;
      messageDiv.appendChild(card);
    }

    return { assess: assess, injectStatusCard: injectStatusCard };

  }());

  // Phase 3.5 — detect legal template responses and inject Download Word Doc button
  function injectLegalDocButton(messageDiv, rawText) {
    // Gate: only allow document UI after a real report has been generated
    if (!reportGenerated) return;
    console.log('[LegalBtn] injectLegalDocButton called, text length:', rawText ? rawText.length : 0);
    console.log('[LegalBtn] AAAI defined:', typeof AAAI !== 'undefined', '| legalIntegration:', !!(typeof AAAI !== 'undefined' && AAAI.legalIntegration));
    // Remove any prior status cards so only the newest one remains visible
    if (chatMessages) {
      var oldCards = chatMessages.querySelectorAll('.legal-doc-status-card');
      oldCards.forEach(function(card) { card.remove(); });
    }
    // Guard: never inject more than one card or button per message div (covers all duplicate-call paths)
    if (messageDiv.querySelector('.legal-doc-status-card') || messageDiv.querySelector('.legal-doc-btn')) return;
    // Only legalIntegration is required for detection; legal (modal) is checked at click time
    if (typeof AAAI === 'undefined' || !AAAI.legalIntegration) return;
    var detectedType = AAAI.legalIntegration.detectLegalFormType(rawText);
    console.log('[LegalBtn] detectLegalFormType result:', detectedType);
    // ── ACTIVE DOCUMENT LOCK (Phase 3.8) ─────────────────────
    // First detection in a session sets the lock. All subsequent detections are ignored.
    if (detectedType && activeDocumentType === null) {
      activeDocumentType = detectedType;
      console.log('[LegalBtn] activeDocumentType locked to:', activeDocumentType);
    }
    var formType = activeDocumentType;
    if (!formType) return;
    // ─────────────────────────────────────────────────────────

    // ── READINESS GATE (Phase 3.7) ───────────────────────────
    var readiness = DocReadinessGate.assess(formType, rawText, conversationHistory);
    console.log('[LegalBtn] readiness:', readiness && readiness.status,
      '| collected:', readiness && readiness.collected,
      '| missing:', readiness && readiness.missing);
    if (readiness && readiness.status !== 'READY') {
      DocReadinessGate.injectStatusCard(messageDiv, readiness);
      return;
    }
    // ────────────────────────────────────────────────────────

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
          AAAI.legalDocx.generate(confirmedFormType, rawText).then(function () {
            activeDocumentType = null;
            console.log('[DOC RESET] activeDocumentType cleared after generation');
          }).catch(function (err) {
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

    // Condition 1: at least 3 markdown headings (## style)
    var headings = (text.match(/^#{1,3}\s+\S/gm) || []).length;

    // Condition 2: long enough to be a full report
    var longEnough = text.length >= 800;

    // Condition 3: contains a personal data signal — a 4-digit year (DOB / service date)
    // or a "Last, First" name pattern — distinguishes a veteran-specific report
    // from a generic formatted explanation (e.g., "## General POA  ## Durable POA")
    var hasPersonalData =
      /\b\d{4}\b/.test(text) ||
      /\b[A-Z][a-z]+,\s+[A-Z][a-z]+\b/.test(text);

    return headings >= 3 && longEnough && hasPersonalData;
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

          // ── SUCCESS HANDOFF: show confirmation + View Dashboard action ──
          var handoff = document.createElement('div');
          handoff.className = 'message message--system';
          handoff.innerHTML =
            '<div class="save-success-bar">' +
              '<span class="save-success-bar__icon">\u2705</span> ' +
              '<span class="save-success-bar__text">Report saved to your dashboard.</span> ' +
              '<a href="/profile.html" class="save-success-bar__link">View Dashboard \u2192</a>' +
            '</div>';
          if (chatMessages) chatMessages.appendChild(handoff);
          scrollToBottom();

          // Auto-redirect in text mode only (voice users stay in conversation)
          if (inputMode !== 'voice') {
            setTimeout(function() {
              // Only redirect if user hasn't scrolled away or started typing
              if (document.activeElement !== userInput) {
                window.location.href = '/profile.html';
              }
            }, 5000);
          }

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
  window.AAAI_submitUserText = submitUserText; // Phase 33 — shared non-typed submission path

  // ── BOOT ────────────────────────────────────────────
  init();

})();



