// AfterAction AI — Voice Bridge Endpoint
// Deploys as Netlify Function at /.netlify/functions/voice-bridge
// Routed via netlify.toml: /api/voice-bridge → this function
//
// PURPOSE
//   Classifies each accepted veteran voice transcript through Claude for
//   structured metadata (missions, checklist_items, risk_flags, mode).
//   Called fire-and-forget from app.js _voiceBridgeProcess() after every
//   accepted voice transcript. Returns { structured, usage }.
//
// WHAT THIS DOES NOT DO
//   Generate a conversational response. Claude's only job is to call
//   record_structured_output. OpenAI Realtime handles the spoken response.
//
// COST
//   ~500 input tokens + ~150 output tokens ≈ $0.004/call (claude-sonnet-4-6).
//   100 voice turns/day ≈ $0.40/day.

'use strict';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL             = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// ── CORS — production domain + Netlify preview deploys only ────────────────
const ALLOWED_ORIGINS = [
  'https://afteractionai.org',
  'https://www.afteractionai.org'
];

function _getCorsHeaders(requestOrigin) {
  // Allow exact production origins OR any Netlify deploy-preview for this site
  const isAllowed = requestOrigin && (
    ALLOWED_ORIGINS.indexOf(requestOrigin) !== -1 ||
    /^https:\/\/[a-z0-9-]+--afteractionai\.netlify\.app$/.test(requestOrigin)
  );
  const origin = isAllowed ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type':                 'application/json',
    'Vary':                         'Origin'   // required when reflecting dynamic origin
  };
}

// ── Rate limiter — in-memory, 30 calls / 60s per case_id (or IP) ───────────
// NOTE: This counter resets on every Netlify cold start (new function instance).
// That is acceptable for Phase 1 — this is abuse prevention, not a billing audit.
// If persistent rate limiting is needed, replace _rlMap with a Supabase counter.
const _rlMap = new Map();
const RL_MAX    = 30;
const RL_WINDOW = 60 * 1000; // 60 seconds

function _rateLimit(key) {
  const now  = Date.now();
  const slot = _rlMap.get(key);
  if (!slot || (now - slot.windowStart) > RL_WINDOW) {
    _rlMap.set(key, { count: 1, windowStart: now });
    return { allowed: true, count: 1 };
  }
  if (slot.count >= RL_MAX) {
    return { allowed: false, count: slot.count };
  }
  slot.count++;
  return { allowed: true, count: slot.count };
}

// ── Extraction-focused system prompt ───────────────────────────────────────
// Deliberately short — Claude's only job is to call the tool.
const BRIDGE_SYSTEM = `You are the AfterAction AI AIOS intelligence engine.
A veteran just spoke a message during a voice session. Analyze it and call record_structured_output. Do NOT write any text response — the tool call is your entire output.

## CRISIS DETECTION — ALWAYS FIRST
If the message contains ANY of: suicide, self-harm, hopelessness, "end it all", "can't go on", "want to die", "no reason to live", domestic violence, immediate danger — set mode="crisis" and risk_flags=["crisis_response"].

## CLASSIFICATION RULES
- Sharing personal info (name, branch, state, rating, discharge) → mode="intake"
- Asking about any benefit, claim, eligibility, education, housing → mode="intake"
- Requesting a report or plan summary → mode="report"
- Requesting a document template (POA, affidavit, resume) → mode="template"
- General question or unclear → mode="conversation"

## MISSION SIGNALS — create when veteran expresses a clear goal
- Filing / checking a disability claim, C&P exam, nexus letter → type="disability_claim"
- GI Bill, school, vocational rehab, education → type="education_path"
- Housing, VA loan, HUD-VASH, rental help → type="housing_path"
- Job search, resume, civilian transition → type="employment_transition"
- Survivor/family benefits, DIC, caregiver → type="family_survivor"

## NAVIGATION HINTS — direct to internal pages when possible
AfterAction AI has dedicated internal pages. When the veteran asks about a topic we cover, set navigation_hint so the UI can offer a direct link.
- Power of attorney, will, directive, affidavit, legal doc, template → page="document-templates", filter="[specific template type]"
- State benefits, state programs, state-specific → page="state-benefits"
- Service dogs, companion animals, emotional support → page="service-dogs"
- Grants, scholarships, education funding → page="grants-scholarships"
- Hotlines, crisis lines, emergency contacts → page="hotlines-escalation"
- Family support, survivor benefits, caregiver → page="families-support"
- Wellness, mental health resources, counseling → page="wellness"
- Licensure, professional licenses, credentials → page="licensure"
- General resources, VSOs, organizations → page="resources"
- Checklist, my plan, my tasks, dashboard → page="checklist"
- Education, GI Bill, school → page="education"
- If no internal page is relevant → omit navigation_hint entirely
NEVER suggest external websites for topics covered by our internal pages.

## AGENTIC AWARENESS
The AfterAction AI system acts on your structured output. When you detect documents, templates, or action items:
- Document uploads → the system saves them to the veteran's dashboard automatically
- Mission signals → the system creates tracked missions with checklists
- Checklist items → the system adds them to the veteran's mission checklist
- Template requests → mode="template" triggers template generation and auto-save
Classify accordingly so the system can take action. Never output "I can't do that" for things the system handles.

## IDENTITY GUARD
If VETERAN CONTEXT is present, treat name and branch as UNCONFIRMED until the veteran explicitly states them in this session. Never include unconfirmed values in follow_up_question.

## OUTPUT
Call record_structured_output. Nothing else.`;

// ── Structured tool — identical schema to chat.js ──────────────────────────
const STRUCTURED_TOOL = {
  name: 'record_structured_output',
  description: 'Record structured metadata for veteran voice input classification. Call this tool — write no text response.',
  input_schema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['conversation', 'intake', 'report', 'template', 'skill_action', 'crisis'],
        description: 'Primary type of this voice message'
      },
      missions: {
        type: 'array',
        description: 'Mission signals detected in this voice message',
        items: {
          type: 'object',
          properties: {
            action:    { type: 'string', enum: ['create', 'update', 'complete', 'none'] },
            type:      { type: 'string', description: 'Mission type slug (e.g. disability_claim, education_path)' },
            next_step: { type: 'string', description: 'Next concrete step for this mission' },
            blockers:  { type: 'array', items: { type: 'string' } }
          },
          required: ['action']
        }
      },
      checklist_items: {
        type: 'array',
        description: 'Action items the veteran should complete, extracted from this message',
        items: {
          type: 'object',
          properties: {
            title:       { type: 'string', description: 'Short action title (under 80 chars)' },
            category:    { type: 'string', enum: ['immediate', 'short_term', 'strategic', 'optional'] },
            description: { type: 'string' }
          },
          required: ['title', 'category']
        }
      },
      actions: {
        type: 'array',
        description: 'Numbered action steps explicitly mentioned in this message',
        items: {
          type: 'object',
          properties: {
            step:      { type: 'integer' },
            text:      { type: 'string' },
            is_action: { type: 'boolean' }
          },
          required: ['step', 'text']
        }
      },
      options:            { type: 'array', items: { type: 'string' } },
      follow_up_question: {
        type: 'string',
        description: 'Primary question the AI should ask next — identity-guarded (no unconfirmed name/branch)'
      },
      risk_flags: {
        type: 'array',
        description: 'Risk signals: crisis_response, has_deadline, appeal_context, housing_instability',
        items: { type: 'string' }
      },
      report_ready: { type: 'boolean' },
      navigation_hint: {
        type: 'object',
        description: 'Suggest internal page navigation when veteran asks about a resource we host on-site. Omit if no internal page is relevant.',
        properties: {
          page:   { type: 'string', enum: ['document-templates', 'state-benefits', 'service-dogs', 'grants-scholarships', 'hotlines-escalation', 'families-support', 'wellness', 'licensure', 'resources', 'education', 'checklist'] },
          filter: { type: 'string', description: 'Pre-filter keyword (e.g. "power-of-attorney", "resume", "gi-bill")' }
        },
        required: ['page']
      },
      document_actions: {
        type: 'array',
        description: 'Actions for generated documents — system saves templates/reports to dashboard.',
        items: {
          type: 'object',
          properties: {
            action:        { type: 'string', enum: ['save_template', 'save_report', 'prefill_template'] },
            template_type: { type: 'string' },
            title:         { type: 'string' }
          },
          required: ['action', 'template_type', 'title']
        }
      },
      dashboard_hint: {
        type: 'string',
        enum: ['show_profile', 'show_checklist', 'show_reports'],
        description: 'Triggers a dashboard navigation button in the UI.'
      }
    },
    required: ['mode']
  }
};

// ── Graceful empty response — session always continues normally ─────────────
function _emptyOk(corsHeaders, extra) {
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(
      Object.assign({ structured: null, usage: { input_tokens: 0, output_tokens: 0 } }, extra || {})
    )
  };
}

// ── Handler ────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const corsHeaders = _getCorsHeaders(event.headers && (event.headers.origin || event.headers.Origin));

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── No API key — return graceful empty (session continues) ────────────────
  if (!ANTHROPIC_API_KEY) {
    console.warn('[voice-bridge] ANTHROPIC_API_KEY not set — skipping classification');
    return _emptyOk(corsHeaders, { mock: true });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const transcript = (body.transcript || '').trim();
  const history    = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const profile    = (typeof body.profile === 'object' && body.profile) ? body.profile : {};
  const caseId     = (typeof body.case_id === 'string' && body.case_id) ? body.case_id : null;

  if (transcript.length < 3) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'transcript too short' }) };
  }

  // ── Rate limit — keyed by case_id, fallback to client IP ──────────────────
  const rlKey    = caseId || (event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'])) || 'anonymous';
  const rlResult = _rateLimit(rlKey);
  if (!rlResult.allowed) {
    console.warn('[voice-bridge] RATE LIMIT exceeded | key=' + rlKey + ' count=' + rlResult.count);
    // Return graceful empty — not a hard error; session continues normally
    return _emptyOk(corsHeaders, { rate_limited: true });
  }

  // ── Build system prompt with optional profile context ─────────────────────
  let systemPrompt   = BRIDGE_SYSTEM;
  const profileLines = [];
  if (profile.name)      profileLines.push('Name (UNCONFIRMED — do NOT use until veteran confirms): ' + profile.name);
  if (profile.branch)    profileLines.push('Branch (UNCONFIRMED — do NOT use until veteran confirms): ' + profile.branch);
  if (profile.state)     profileLines.push('State: ' + profile.state);
  if (profile.va_rating) profileLines.push('VA Rating: ' + profile.va_rating + '%');
  if (profile.discharge) profileLines.push('Discharge type: ' + profile.discharge);
  if (profile.era)       profileLines.push('Service era: ' + profile.era);
  if (profileLines.length > 0) {
    systemPrompt += '\n\n## VETERAN CONTEXT (prior session — treat with full identity guard)\n' + profileLines.join('\n');
  }

  // ── Messages: history for context, current transcript as final user turn ───
  const messages = history.length > 0 ? history.slice() : [];
  const lastMsg  = messages.length > 0 ? messages[messages.length - 1] : null;
  if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== transcript) {
    messages.push({ role: 'user', content: transcript });
  }

  const startMs = Date.now();
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  500,
        system:      systemPrompt,
        messages:    messages,
        tools:       [STRUCTURED_TOOL],
        tool_choice: { type: 'tool', name: 'record_structured_output' }
      })
    });
  } catch (fetchErr) {
    console.error('[voice-bridge] Network error calling Claude:', fetchErr.message || fetchErr);
    return _emptyOk(corsHeaders, { error: 'network_error' });
  }

  const latencyMs = Date.now() - startMs;

  if (!response.ok) {
    console.error('[voice-bridge] Claude API returned', response.status);
    return _emptyOk(corsHeaders, { error: 'api_error_' + response.status });
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    console.error('[voice-bridge] Failed to parse Claude response:', parseErr.message);
    return _emptyOk(corsHeaders, { error: 'parse_error' });
  }

  // ── Extract structured output ──────────────────────────────────────────────
  let structuredOutput = null;
  if (data.content && Array.isArray(data.content)) {
    for (let i = 0; i < data.content.length; i++) {
      const block = data.content[i];
      if (block.type === 'tool_use' && block.name === 'record_structured_output') {
        structuredOutput = block.input || null;
        break;
      }
    }
  }

  const usage = data.usage || { input_tokens: 0, output_tokens: 0 };

  // ── Cost + observability log ───────────────────────────────────────────────
  // View at: Netlify Dashboard → Functions → voice-bridge → Logs
  console.log('[voice-bridge] CLASSIFIED' +
    ' | mode='      + (structuredOutput ? structuredOutput.mode : 'null') +
    ' | missions='  + (structuredOutput && structuredOutput.missions        ? structuredOutput.missions.length        : 0) +
    ' | checklist=' + (structuredOutput && structuredOutput.checklist_items ? structuredOutput.checklist_items.length : 0) +
    ' | risk='      + (structuredOutput && structuredOutput.risk_flags      ? structuredOutput.risk_flags.join(',')   : 'none') +
    ' | in='        + usage.input_tokens +
    ' | out='       + usage.output_tokens +
    ' | ms='        + latencyMs +
    ' | rl='        + rlResult.count + '/' + RL_MAX +
    ' | len='       + transcript.length);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ structured: structuredOutput, usage: usage })
  };
};
