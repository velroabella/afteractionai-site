// Diagnostic: test Anthropic API directly and return the actual error
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '8192', 10);
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  const keyPresent = Boolean(ANTHROPIC_API_KEY);
  const keyPrefix = ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.substring(0, 8) + '...' : 'MISSING';
  let apiResult = {};
  if (keyPresent) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 50,
          messages: [{ role: 'user', content: 'Say hello in one word.' }]
        })
      });
      const txt = await r.text();
      apiResult = { status: r.status, body: txt.substring(0, 500) };
    } catch (e) {
      apiResult = { fetchError: e.message };
    }
  }
  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({
      key_present: keyPresent,
      key_prefix: keyPrefix,
      model: MODEL,
      max_tokens: MAX_TOKENS,
      api_result: apiResult
    })
  };
};
