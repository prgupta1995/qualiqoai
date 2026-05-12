const OpenAI = require('openai');

function getClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();

  if (!apiKey) {
    const error = new Error('OpenAI API key is not configured');
    error.status = 500;
    throw error;
  }

  return new OpenAI({ apiKey });
}

function stripMarkdown(text) {
  return String(text || '').replace(/^```(?:json|javascript|js)?/i, '').replace(/```$/i, '').trim();
}

async function generateCompletion(prompt) {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });

  return stripMarkdown(completion.choices?.[0]?.message?.content);
}

async function generateManualTestCases(prompt) {
  const raw = await generateCompletion(prompt);
  const parsed = JSON.parse(raw);
  return parsed;
}

async function generatePlaywrightScript(prompt) {
  return generateCompletion(prompt);
}

async function generateScriptFromRecording(prompt) {
  return generateCompletion(prompt);
}

module.exports = {
  generateManualTestCases,
  generatePlaywrightScript,
  generateScriptFromRecording,
};
