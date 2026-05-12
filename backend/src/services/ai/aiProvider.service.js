const ollamaService = require('./ollama.service');
const openaiService = require('./openai.service');

function resolveProvider() {
  const configuredProvider = String(process.env.AI_PROVIDER || 'ollama').trim().toLowerCase();

  if (configuredProvider === 'openai' && String(process.env.OPENAI_API_KEY || '').trim()) {
    return openaiService;
  }

  return ollamaService;
}

async function generateManualTestCases(prompt) {
  return resolveProvider().generateManualTestCases(prompt);
}

async function generatePlaywrightScript(prompt) {
  return resolveProvider().generatePlaywrightScript(prompt);
}

async function generateScriptFromRecording(prompt) {
  return resolveProvider().generateScriptFromRecording(prompt);
}

module.exports = {
  generateManualTestCases,
  generatePlaywrightScript,
  generateScriptFromRecording,
};
