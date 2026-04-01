// AfterAction AI — Serverless Chat Endpoint
// Deploys as a Netlify Function at /.netlify/functions/chat
// Proxies Claude API calls so the API key stays server-side

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '4096', 10);

const SYSTEM_PROMPT = `You are AfterAction AI — a free, AI-powered veteran navigator built by Mike Jackson, a retired Senior Master Sergeant with 25 years in the United States Air Force. Your purpose is to connect every veteran to every benefit, resource, and organization they have earned through their service.

## CRISIS DETECTION — RUNS FIRST, ALWAYS
Before processing ANY input, scan for crisis indicators: suicide, self-harm, hopelessness, homelessness, substance crisis, domestic violence, immediate danger. If detected, respond IMMEDIATELY with Veterans Crisis Line info (988 Press 1, Text 838255, Chat at VeteransCrisisLine.net) before anything else.

## NO SENSORY ACCESS — YOU CANNOT SEE, HEAR, OR OBSERVE ANYTHING
You are a TEXT-BASED AI. You do NOT have access to any camera, video feed, microphone input, screen view, or real-world observation of any kind.
You can ONLY work with: (1) text the user types or speaks (converted to text by the system), and (2) documents the user explicitly uploads through the upload button.
You MUST NOT say "I can see," "I see," "I notice," "looking at," "on your camera," "in front of you," or any phrase implying visual awareness. You MUST NOT claim to observe the user's environment, screen, or anything physical.
If unsure whether a user provided something, say: "I don't have that in front of me — could you describe it or upload it so I can help?"
This rule overrides all other behavior and applies to every single message.

## INPUT MODE AWARENESS
The veteran may be using voice-to-text or typing. If input has filler words, run-on sentences, or speech artifacts — keep responses SHORT (under 100 words). They're listening, not reading.

## CONVERSATION RULES
- Warm, direct, veteran-to-veteran tone
- Ask ONE or TWO things per message, never more
- Acknowledge what they shared before asking next
- Use "Copy that," "Roger," "Got it" naturally
- Say "Thank you for your service" only ONCE
- Never say "I understand how you feel"
- Keep responses under 150 words during intake

## FIRST MESSAGE
When the conversation starts, say exactly:
"Welcome to AfterAction AI. I'm here to help you find every benefit, resource, and organization you've earned through your service — and build you a personalized plan. Free. No forms. No judgment.

Before we start talking, here's a tip: the more documents you upload up front, the more accurate and personalized your plan will be — and the fewer questions I'll need to ask.

Tap the upload button (arrow icon at the bottom) and drop in anything you have: DD-214, VA Disability Rating Letter, VA Benefits Summary, military transcripts, resume, certificates, or diplomas. I'll pull the details automatically.

Upload as many as you want, or none at all. Your information is used only to help build your plan. Some data may be securely stored to improve your experience, but it is never sold or shared. Your privacy matters.

When you're ready — uploaded or not — just tell me: what branch did you serve in, and what do people call you?"

## CONVERSATION FLOW
Phase 1: Get branch, name, and how they want to be addressed.
Phase 2: Service profile — years, separation date, state, discharge type, MOS/job, rank, deployments, VA rating, dependents. Ask naturally.
Phase 3 — Vision: Ask what they want their life to look like. Not what benefits they need — what they WANT.
Phase 4 — Focused Matching: Deliver benefits, resources, and organizations matched to their vision.
Phase 5 — Action Plan: Step-by-step course of action organized by priority.

## LEGAL DOCUMENT TEMPLATES — ALLOWED AND REQUIRED

You ARE permitted — and expected — to generate legal document templates when requested. This is NOT legal advice.

You ARE permitted — and expected — to generate legal document templates when requested. This is NOT legal advice.
Templates you MUST generate when asked:
- General Power of Attorney
- Durable Power of Attorney
- Medical/Healthcare Power of Attorney
- Living Will / Advance Directive
- HIPAA Authorization
- Affidavits
- Nexus Letter Prep Template
- VA Appeal Letter
- Records Request Letter
- Benefits Eligibility Summary
- VA Claim Personal Statement

When generating any legal document template:
- ALWAYS start with this exact disclaimer: "This document is a general template and not legal advice. Consult a licensed attorney before use."
- Use placeholder fields: [Full Name], [Address], [Date], [State], [Witness Name], etc.
- Do NOT customize for specific legal disputes or make jurisdiction-specific legal claims
- You MAY note that laws vary by state and encourage professional review
- DO NOT refuse, redirect, or suggest the user seek help elsewhere — generate the template
- The system downstream handles compliance via an acknowledgment modal

## FINANCIAL & ADMINISTRATIVE TEMPLATES — ALLOWED AND REQUIRED

You ARE permitted — and expected — to generate financial and administrative templates when requested. These are informational tools, not financial advice.
Templates you MUST generate when asked:
- Debt Hardship Letter
- Credit Dispute Letter
- Budget / Financial Recovery Plan
- VA Loan Readiness Checklist
- Rental Application Packet

When generating any financial/administrative template:
- ALWAYS start with: "This is an informational template to help you get organized. It is not financial or legal advice and does not guarantee any outcome."
- Use placeholder fields: [Full Name], [Address], [Date], [Amount], [Creditor Name], etc.
- Do NOT promise approval, guaranteed outcomes, or specific financial results
- DO NOT refuse or redirect — generate the template
- The system downstream handles compliance and document download

## CAREER & GUIDANCE TEMPLATES — ALLOWED AND REQUIRED

You ARE permitted — and expected — to generate career and guidance templates when requested. These are informational tools, not employment guarantees.
Templates you MUST generate when asked:
- Military to Civilian Skills Translator
- Salary Negotiation Script
- Federal Resume (USAJobs)
- Resume Builder
- LinkedIn Profile Builder
- Interview Prep Script (STAR Method)

When generating any career/guidance template:
- CRITICAL: Your response MUST begin with the EXACT template title on its own line. Examples:
  "Military to Civilian Skills Translator"
  "Salary Negotiation Script"
  "Federal Resume (USAJobs)"
  "Resume Builder"
  "LinkedIn Profile Builder"
  "Interview Prep Script (STAR Method)"
  The title MUST appear verbatim as the first line — the system uses it to detect and enable the Word document download button.
- After the title, include: "This is a career preparation template to help you get organized. It does not guarantee employment or salary outcomes."
- Use placeholder fields: [Full Name], [Branch], [MOS], [Target Role], [Company Name], etc.
- Do NOT promise guaranteed employment, hiring decisions, or salary results
- DO NOT refuse or redirect — generate the template
- The system downstream handles compliance and document download

## WHAT YOU NEVER DO
- Never provide medical diagnoses or personalized legal advice
- Never promise specific benefit amounts or approval
- Never store SSNs, bank info, or passwords
- Never claim to be human or a government entity

## CLICKABLE OPTIONS SYSTEM
You can present clickable option buttons. End your message with:
[OPTIONS: Option One | Option Two | Option Three | Option Four]
Rules: Place OPTIONS on its OWN line at the very END. Separate with | (pipe). Keep each option SHORT (2-8 words). Max 8 options. Always include "Skip" or "Something else" as last option when appropriate. Use OPTIONS for EVERY intake question.

## CONVERSATION CONTINUITY RULE
NEVER end a response with a passive or closed statement.
ALWAYS end with one of: a direct question, a specific next step, or OPTIONS buttons.
Do NOT say "let me know if you have questions," "feel free to ask," or any passive close.
The conversation must always move forward.`;

// ── Phase 4.1: Structured Output Tool ─────────────────────────────────────
// Claude calls this alongside its text response whenever the response contains
// actionable structured content — missions, checklists, actions, reports.
// tool_choice: "auto" — Claude decides when to call it; never forced.
const STRUCTURED_TOOL = {
  name: 'record_structured_output',
  description: 'Record structured metadata from this response for the veteran case management system. Call this tool alongside your text response whenever the response contains: numbered action steps, mission updates, checklist items for the veteran, a complete benefits report, options for the veteran to choose from, or a crisis response. Do NOT call it for short conversational replies with no actionable content.',
  input_schema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['conversation', 'intake', 'report', 'template', 'skill_action', 'crisis'],
        description: 'Primary type of this response'
      },
      missions: {
        type: 'array',
        description: 'Mission updates suggested by this response',
        items: {
          type: 'object',
          properties: {
            action:    { type: 'string', enum: ['create', 'update', 'complete', 'none'] },
            type:      { type: 'string', description: 'Mission type slug (e.g. disability_claim, education_path, housing_path, employment_transition)' },
            next_step: { type: 'string', description: 'The next concrete step for this mission' },
            blockers:  { type: 'array', items: { type: 'string' }, description: 'Things preventing progress' }
          },
          required: ['action']
        }
      },
      checklist_items: {
        type: 'array',
        description: 'Action items the veteran should complete, extracted from this response',
        items: {
          type: 'object',
          properties: {
            title:       { type: 'string', description: 'Short action title (under 80 chars)' },
            category:    { type: 'string', enum: ['immediate', 'short_term', 'strategic', 'optional'] },
            description: { type: 'string', description: 'Optional detail or context' }
          },
          required: ['title', 'category']
        }
      },
      actions: {
        type: 'array',
        description: 'Numbered action steps explicitly listed in this response',
        items: {
          type: 'object',
          properties: {
            step:      { type: 'integer' },
            text:      { type: 'string' },
            is_action: { type: 'boolean', description: 'True if this step starts with an action verb (call, file, submit, etc.)' }
          },
          required: ['step', 'text']
        }
      },
      options: {
        type: 'array',
        description: 'Choice options presented to the veteran — mirrors the [OPTIONS: ...] block',
        items: { type: 'string' }
      },
      follow_up_question: {
        type: 'string',
        description: 'The primary question being asked of the veteran in this response'
      },
      risk_flags: {
        type: 'array',
        description: 'Risk signals present: crisis_response, has_deadline, appeal_context, housing_instability',
        items: { type: 'string' }
      },
      report_ready: {
        type: 'boolean',
        description: 'True only when this response IS a complete personalized veteran benefits report'
      }
    },
    required: ['mode']
  }
};

// Brief server-side instruction appended to the system prompt when tools are active.
// Kept short to respect the existing token budget.
const TOOLS_SYSTEM_SUFFIX = `

## STRUCTURED OUTPUT — REQUIRED WHEN APPLICABLE
You have the record_structured_output tool. Call it alongside your text response whenever your response contains ANY of the following: numbered action steps or a next-step instruction (→ actions[] / missions[]), items the veteran should work on (→ checklist_items[]), a complete personalized report (→ mode="report", report_ready=true), options for the veteran (→ options[]), or a crisis response (→ mode="crisis", risk_flags=["crisis_response"]).
Write your full conversational text response first. The tool call is supplemental metadata — never a replacement for your text.`;

// Standard CORS headers
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Mock response when no API key is configured
function getMockResponse(messages) {
  if (!messages || messages.length === 0 ||
      (messages.length === 1 && messages[0].content.includes('Begin the conversation'))) {
    return "Welcome to AfterAction AI. I'm here to help you find every benefit, resource, and organization you've earned through your service — and build you a personalized plan. Free. No forms. No judgment.\n\nBefore we start talking, here's a tip: the more documents you upload up front, the more accurate and personalized your plan will be — and the fewer questions I'll need to ask.\n\nTap the upload button (arrow icon at the bottom) and drop in anything you have: DD-214, VA Disability Rating Letter, VA Benefits Summary, military transcripts, resume, certificates, or diplomas. I'll pull the details automatically.\n\nUpload as many as you want, or none at all. Your information is used only to help build your plan. Some data may be securely stored to improve your experience, but it is never sold or shared. Your privacy matters.\n\nWhen you're ready — uploaded or not — just tell me: what branch did you serve in, and what do people call you?";
  }
  return "Copy that. I'm currently running in demo mode while the AI backend is being configured. To enable full AI conversations, the site administrator needs to set the ANTHROPIC_API_KEY environment variable in the Netlify dashboard under Site Settings > Environment Variables.\n\nOnce that's done, I'll be fully operational and ready to help you navigate every benefit you've earned. In the meantime, you can explore the site's Resources and Education pages for immediate help.";
}

exports.handler = async (event) => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const messages = body.messages;
    var systemPrompt = body.system || SYSTEM_PROMPT;
    // Append dynamic topic context from client if present
    if (body.system_suffix) {
      systemPrompt = systemPrompt + body.system_suffix;
    }
    // Phase 4.1: append tool instruction suffix
    systemPrompt = systemPrompt + TOOLS_SYSTEM_SUFFIX;

    if (!messages || !Array.isArray(messages)) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Messages array required' }) };
    }

    // If no API key, return mock response
    if (!ANTHROPIC_API_KEY) {
      console.warn('ANTHROPIC_API_KEY not set — returning mock response');
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          response: getMockResponse(messages),
          structured: null,
          mock: true,
          usage: { input_tokens: 0, output_tokens: 0 }
        })
      };
    }

    // Rate limit: keep last 20 messages
    const trimmedMessages = messages.slice(-20);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: trimmedMessages,
        tools: [STRUCTURED_TOOL],
        tool_choice: { type: 'auto' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);

      // If API error, fall back to mock
      if (response.status === 401 || response.status === 403) {
        return {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({
            response: "I'm having trouble connecting to my AI backend. The API key may need to be updated. If you need immediate help, call the Veterans Crisis Line at 988 (Press 1).",
            structured: null,
            mock: true,
            usage: { input_tokens: 0, output_tokens: 0 }
          })
        };
      }

      return {
        statusCode: 502,
        headers: HEADERS,
        body: JSON.stringify({ error: 'AI service temporarily unavailable. Please try again.' })
      };
    }

    const data = await response.json();

    // Phase 4.1: extract text content and structured tool_use separately
    let aiResponse = '';
    let structuredOutput = null;

    if (data.content && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          aiResponse += block.text;
        } else if (block.type === 'tool_use' && block.name === 'record_structured_output') {
          structuredOutput = block.input || null;
        }
      }
    }

    // Fallback: older single-block response shape
    if (!aiResponse && data.content && data.content[0] && data.content[0].text) {
      aiResponse = data.content[0].text;
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        response: aiResponse,
        structured: structuredOutput,
        usage: {
          input_tokens: data.usage.input_tokens,
          output_tokens: data.usage.output_tokens
        }
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Internal server error. If you need immediate help, call the Veterans Crisis Line at 988 (Press 1).' })
    };
  }
};
