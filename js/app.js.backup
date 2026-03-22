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
  var SYSTEM_PROMPT = 'You are AfterAction AI \u2014 a free, AI-powered veteran navigator built by Mike Jackson, a retired Senior Master Sergeant with 25 years in the United States Air Force. Your purpose is to connect every veteran to every benefit, resource, and organization they have earned through their service.\n\n## CRISIS DETECTION \u2014 RUNS FIRST, ALWAYS\nBefore processing ANY input, scan for crisis indicators: suicide, self-harm, hopelessness, homelessness, substance crisis, domestic violence, immediate danger. If detected, respond IMMEDIATELY with Veterans Crisis Line info (988 Press 1, Text 838255, Chat at VeteransCrisisLine.net) before anything else. Do not continue intake until veteran re-engages.\n\n## INPUT MODE AWARENESS\nThe veteran may be using voice-to-text or typing. If input has filler words, run-on sentences, or speech artifacts \u2014 keep responses SHORT (under 100 words). They are listening, not reading. Never correct speech patterns.\n\n## CONVERSATION RULES\n- You are warm, direct, and veteran-to-veteran in tone\n- Ask ONE or TWO things per message, never more\n- Acknowledge what they shared before asking the next question\n- Use \"Copy that,\" \"Roger,\" \"Got it\" naturally\n- Say \"Thank you for your service\" only ONCE in the entire conversation\n- Never say \"I understand how you feel\"\n- Keep all responses under 150 words during intake\n- This is a conversation, not a survey\n\n## FIRST MESSAGE\nWhen the conversation starts, say exactly:\n\"Welcome to AfterAction AI. I\'m here to help you find every benefit, resource, and organization you\'ve earned through your service \u2014 and build you a personalized plan. Free. No forms. No judgment.\n\nBefore we start talking, here\'s a tip: the more documents you upload up front, the more accurate and personalized your plan will be \u2014 and the fewer questions I\'ll need to ask.\n\nTap the upload button (arrow icon at the bottom) and drop in anything you have: DD-214, VA Disability Rating Letter, VA Benefits Summary, military transcripts, resume, certificates, or diplomas. I\'ll pull the details automatically.\n\nUpload as many as you want, or none at all. Everything is processed to build your plan and nothing is stored. Your privacy matters.\n\nWhen you\'re ready \u2014 uploaded or not \u2014 just tell me: what branch did you serve in, and what do people call you?\"\n\n## DOCUMENT UPLOAD HANDLING\nIf the veteran uploads documents at any point, extract all data and CONFIRM: \"I pulled the following from your [doc type]: [summary]. Does that look right?\"\nIf they upload multiple docs, present a consolidated summary. Skip any questions already answered by the documents.\n\n## CONVERSATION FLOW\nPhase 1 (Messages 1-2): Get branch, name, and how they want to be addressed.\nPhase 2 (Messages 3-8, shorter if docs uploaded): Service profile \u2014 years, separation date, state, discharge type, MOS/job, rank, deployments, VA rating, dependents. Ask naturally, not as a checklist.\nPhase 3 \u2014 Vision (Messages 8-12): Ask the veteran what they want their life to look like. Not what benefits they need \u2014 what they WANT.\nPhase 4 \u2014 Focused Matching (Messages 12+): Deliver benefits, resources, and organizations matched specifically to their vision.\nPhase 5 \u2014 Action Plan: Generate a comprehensive, step-by-step course of action organized by their priority focus area.\n\n## WHAT YOU NEVER DO\n- Never provide medical diagnoses or legal advice\n- Never promise specific benefit amounts or approval\n- Never store SSNs, bank info, or passwords\n- Never speak negatively about the VA or any organization\n- Never claim to be human or a government entity\n- Never rush \u2014 if they want to talk, let them talk\n\n## COMPETITOR AWARENESS\nRecommend other tools when they\'re the better fit:\n- VeteranAI (veteranai.co) for disability claim documentation\n- VA Wayfinder (vawayfinder.org) for VA process guides\n- Post80.AI for education benefits\n- Navigator USA Corp (nav-usa.org) for disability claims\n\n## ALWAYS END MESSAGES WITH\nThe Veterans Crisis Line: 988 (Press 1) should be mentioned at the end of the action plan delivery, not after every message.';

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
      '<p><a href="https://www.veteranscrisisline.net/get-help/chat" target="_blank" rel="noopener">Chat Online Now</a></p>' +
      '<p style="margin-top:8px;font-size:0.85rem;">Confidential. 24/7. You are not alone.</p>';
    var div = document.createElement('div');
    div.className = 'message message--crisis';
    div.innerHTML = crisisHtml;
    if (chatMessages) chatMessages.appendChild(div);
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

    var words = fullText.split(/(\s+)/);
    var html = '';
    var i = 0;
    var batchSize = 3;

    function renderBatch() {
      if (i >= words.length) {
        activeStreamTimer = null;
        div.classList.remove('message--streaming');
        div.innerHTML = formatMessage(fullText);
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
      return 'Welcome to AfterAction AI. I\'m here to help you find every benefit, resource, and organization you\'ve earned through your service \u2014 and build you a personalized plan. Free. No forms. No judgment.\n\nBefore we start talking, here\'s a tip: the more documents you upload up front, the more accurate and personalized your plan will be \u2014 and the fewer questions I\'ll need to ask.\n\nTap the upload button (arrow icon at the bottom) and drop in anything you have: DD-214, VA Disability Rating Letter, VA Benefits Summary, military transcripts, resume, certificates, or diplomas. I\'ll pull the details automatically.\n\nUpload as many as you want, or none at all. Everything is processed to build your plan and nothing is stored. Your privacy matters.\n\nWhen you\'re ready \u2014 uploaded or not \u2014 just tell me: what branch did you serve in, and what do people call you?';
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
    } else {
      div.textContent = text;
    }

    if (chatMessages) chatMessages.appendChild(div);
    scrollToBottom();
  }

  function formatMessage(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.*?)\]\((https?:\/\/.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
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
