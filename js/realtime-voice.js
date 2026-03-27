/* ══════════════════════════════════════════════════════════
   AfterAction AI — Realtime Voice Engine
   OpenAI Realtime API via WebRTC

   Public API:
     RealtimeVoice.connect()        → get token, establish WebRTC, start session
     RealtimeVoice.disconnect()     → clean shutdown
     RealtimeVoice.mute()           → mute mic (keeps session alive)
     RealtimeVoice.unmute()         → unmute mic
     RealtimeVoice.isMuted()        → boolean
     RealtimeVoice.getState()       → 'idle'|'connecting'|'connected'|'speaking'|'listening'|'error'
     RealtimeVoice.sendText(text)   → inject text into realtime conversation

   Callbacks (set before calling connect):
     RealtimeVoice.onStateChange    = function(state, detail) {}
     RealtimeVoice.onUserTranscript = function(text, isFinal) {}
     RealtimeVoice.onAITranscript   = function(text, isFinal) {}
     RealtimeVoice.onError          = function(error) {}
     RealtimeVoice.onAIMessage      = function(fullText) {}  // final complete AI response
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var TOKEN_ENDPOINT = '/api/realtime-token';
  var REALTIME_BASE  = 'https://api.openai.com/v1/realtime/calls';
  var DATA_CHANNEL   = 'oai-events';

  // ── State ──
  var pc = null;            // RTCPeerConnection
  var dc = null;            // RTCDataChannel
  var localStream = null;   // MediaStream from getUserMedia
  var audioEl = null;       // <audio> element for AI playback
  var state = 'idle';       // idle | connecting | connected | speaking | listening | error
  var muted = false;
  var currentAITranscript = '';
  var currentResponseId = null;

  // ── Debug logger ──
  function log(label, detail) {
    console.log('[AAAI-RT] ' + label + (detail ? ' — ' + detail : ''));
  }

  // ── State machine ──
  function setState(newState, detail) {
    if (state === newState) return;
    state = newState;
    log('state', newState + (detail ? ': ' + detail : ''));
    if (RealtimeVoice.onStateChange) {
      try { RealtimeVoice.onStateChange(newState, detail); } catch(e) {}
    }
  }

  function emitError(msg) {
    log('ERROR', msg);
    setState('error', msg);
    if (RealtimeVoice.onError) {
      try { RealtimeVoice.onError(msg); } catch(e) {}
    }
  }

  // ══════════════════════════════════════════════════════
  //  CONNECT — full lifecycle
  // ══════════════════════════════════════════════════════
  async function connect() {
    if (state === 'connecting' || state === 'connected' || state === 'listening' || state === 'speaking') {
      log('connect', 'already active, state=' + state);
      return;
    }

    setState('connecting', 'requesting token...');

    try {
      // ── Step 1: Get ephemeral token from our server ──
      log('connect', 'fetching ephemeral token from ' + TOKEN_ENDPOINT);
      var tokenResp = await fetch(TOKEN_ENDPOINT);
      if (!tokenResp.ok) {
        var errBody = await tokenResp.text();
        throw new Error('Token endpoint returned ' + tokenResp.status + ': ' + errBody);
      }
      var tokenData = await tokenResp.json();
      var ephemeralKey = tokenData.client_secret;
      if (!ephemeralKey) throw new Error('No client_secret in token response');
      log('connect', 'ephemeral token received (ek_...)');

      // ── Step 2: Get microphone ──
      setState('connecting', 'requesting microphone...');
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      log('connect', 'microphone access granted');

      // ── Step 3: Create RTCPeerConnection ──
      pc = new RTCPeerConnection({
        iceServers: [] // OpenAI handles TURN/relay
      });

      // Add mic track
      var micTrack = localStream.getAudioTracks()[0];
      pc.addTrack(micTrack, localStream);

      // Apply mute state
      micTrack.enabled = !muted;

      // ── Step 4: Handle remote audio (AI voice) ──
      pc.ontrack = function(event) {
        log('ontrack', 'received remote audio track');
        audioEl = document.getElementById('realtimeAudio');
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.id = 'realtimeAudio';
          audioEl.autoplay = true;
          document.body.appendChild(audioEl);
        }
        audioEl.srcObject = event.streams[0];
      };

      // ── Step 5: Create data channel for events ──
      dc = pc.createDataChannel(DATA_CHANNEL);
      dc.onopen = function() {
        log('dataChannel', 'open');
        setState('listening');
      };
      dc.onclose = function() {
        log('dataChannel', 'closed');
      };
      dc.onmessage = handleDataChannelMessage;

      // ── Step 6: Monitor connection state ──
      pc.oniceconnectionstatechange = function() {
        log('ice', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          emitError('WebRTC connection ' + pc.iceConnectionState);
        }
      };

      // ── Step 7: Create SDP offer ──
      var offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      log('connect', 'SDP offer created');

      // ── Step 8: Send offer to OpenAI Realtime API ──
      setState('connecting', 'establishing WebRTC...');
      var sdpResp = await fetch(REALTIME_BASE, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + ephemeralKey,
          'Content-Type': 'application/sdp'
        },
        body: offer.sdp
      });

      if (!sdpResp.ok) {
        var sdpErr = await sdpResp.text();
        throw new Error('Realtime calls endpoint returned ' + sdpResp.status + ': ' + sdpErr);
      }

      // ── Step 9: Set remote description (SDP answer) ──
      var answerSdp = await sdpResp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      log('connect', 'WebRTC connected, session active');
      setState('connected');

    } catch(err) {
      emitError(err.message || String(err));
      cleanup();
    }
  }

  // ══════════════════════════════════════════════════════
  //  DATA CHANNEL — handle server events
  // ══════════════════════════════════════════════════════
  function handleDataChannelMessage(event) {
    var msg;
    try {
      msg = JSON.parse(event.data);
    } catch(e) {
      log('dc-parse-error', event.data);
      return;
    }

    var type = msg.type;

    switch(type) {

      // ── Session lifecycle ──
      case 'session.created':
        log('event', 'session.created');
        setState('listening');
        break;

      case 'session.updated':
        log('event', 'session.updated');
        break;

      // ── User speech detection ──
      case 'input_audio_buffer.speech_started':
        log('event', 'user started speaking');
        setState('listening', 'hearing you...');
        break;

      case 'input_audio_buffer.speech_stopped':
        log('event', 'user stopped speaking');
        break;

      case 'input_audio_buffer.committed':
        log('event', 'audio buffer committed');
        setState('connected', 'processing...');
        break;

      // ── User transcript (input audio transcription) ──
      case 'conversation.item.input_audio_transcription.delta':
        if (msg.delta && RealtimeVoice.onUserTranscript) {
          RealtimeVoice.onUserTranscript(msg.delta, false);
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        log('event', 'user transcript complete: ' + (msg.transcript || '').substring(0, 80));
        if (msg.transcript && RealtimeVoice.onUserTranscript) {
          RealtimeVoice.onUserTranscript(msg.transcript, true);
        }
        break;

      case 'conversation.item.input_audio_transcription.failed':
        log('event', 'user transcription failed');
        break;

      // ── AI response lifecycle ──
      case 'response.created':
        currentAITranscript = '';
        currentResponseId = msg.response?.id || null;
        log('event', 'response.created id=' + currentResponseId);
        setState('speaking');
        break;

      case 'response.output_item.added':
        log('event', 'response output item added');
        break;

      // ── AI audio transcript (what AI is saying) ──
      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta':
        if (msg.delta) {
          currentAITranscript += msg.delta;
          if (RealtimeVoice.onAITranscript) {
            RealtimeVoice.onAITranscript(currentAITranscript, false);
          }
        }
        break;

      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done':
        log('event', 'AI transcript done: ' + currentAITranscript.substring(0, 80));
        if (RealtimeVoice.onAITranscript) {
          RealtimeVoice.onAITranscript(currentAITranscript, true);
        }
        if (RealtimeVoice.onAIMessage) {
          RealtimeVoice.onAIMessage(currentAITranscript);
        }
        break;

      // ── AI response complete ──
      case 'response.done':
        log('event', 'response.done');
        setState('listening');
        currentResponseId = null;
        break;

      // ── AI audio output ──
      case 'output_audio_buffer.started':
        log('event', 'AI audio playback started');
        setState('speaking');
        break;

      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        log('event', 'AI audio playback ended');
        break;

      // ── Error ──
      case 'error':
        log('event', 'server error: ' + JSON.stringify(msg.error || msg));
        emitError(msg.error?.message || 'Server error');
        break;

      default:
        // Log unhandled events at debug level
        log('event-unhandled', type);
    }
  }

  // ══════════════════════════════════════════════════════
  //  SEND — inject text or client events via data channel
  // ══════════════════════════════════════════════════════
  function sendEvent(eventObj) {
    if (!dc || dc.readyState !== 'open') {
      log('sendEvent', 'data channel not open');
      return false;
    }
    dc.send(JSON.stringify(eventObj));
    return true;
  }

  function sendText(text) {
    log('sendText', text.substring(0, 60));
    return sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: text }]
      }
    }) && sendEvent({ type: 'response.create' });
  }

  // ══════════════════════════════════════════════════════
  //  MUTE / UNMUTE
  // ══════════════════════════════════════════════════════
  function setMuted(val) {
    muted = val;
    if (localStream) {
      localStream.getAudioTracks().forEach(function(t) { t.enabled = !muted; });
    }
    log('mute', muted ? 'muted' : 'unmuted');
  }

  // ══════════════════════════════════════════════════════
  //  DISCONNECT — clean shutdown
  // ══════════════════════════════════════════════════════
  function disconnect() {
    log('disconnect', 'shutting down');
    cleanup();
    setState('idle');
  }

  function cleanup() {
    if (dc) {
      try { dc.close(); } catch(e) {}
      dc = null;
    }
    if (pc) {
      try { pc.close(); } catch(e) {}
      pc = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(function(t) { t.stop(); });
      localStream = null;
    }
    if (audioEl) {
      audioEl.srcObject = null;
    }
    currentAITranscript = '';
    currentResponseId = null;
  }

  // ══════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════
  window.RealtimeVoice = {
    connect:     connect,
    disconnect:  disconnect,
    mute:        function() { setMuted(true); },
    unmute:      function() { setMuted(false); },
    isMuted:     function() { return muted; },
    getState:    function() { return state; },
    sendText:    sendText,
    sendEvent:   sendEvent,

    // Callbacks — set these before calling connect()
    onStateChange:    null,
    onUserTranscript: null,
    onAITranscript:   null,
    onAIMessage:      null,
    onError:          null
  };

})();
