function getOllamaConfig() {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.1',
  };
}

function validateGeneratedPlaywrightScript(script) {
  const normalizedScript = String(script || '').trim();

  if (!normalizedScript) {
    throw new Error('Generated script is empty');
  }

  if (!/test\s*\(/.test(normalizedScript)) {
    throw new Error('Generated script must include a test() block');
  }

  if (!/\bpage\./.test(normalizedScript)) {
    throw new Error('Generated script must include Playwright page usage');
  }
}

async function callOllama(prompt) {
  const { baseUrl, model } = getOllamaConfig();

  let response;

  try {
    response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
    });
  } catch (err) {
    const error = new Error(
      'Local AI model is not running. Please start Ollama using: ollama serve',
    );
    error.status = 503;
    throw error;
  }

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(body || 'Ollama request failed');
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  return payload.response || '';
}

function stripMarkdown(text) {
  return String(text || '').replace(/^```(?:json|javascript|js)?/i, '').replace(/```$/i, '').trim();
}

async function generateManualTestCases(prompt) {
  const response = stripMarkdown(await callOllama(prompt));
  const parsed = JSON.parse(response);

  if (!Array.isArray(parsed.testCases) || !parsed.testCases.length) {
    throw new Error('No test cases were generated');
  }

  return parsed;
}

async function generatePlaywrightScript(prompt) {
  const response = stripMarkdown(await callOllama(prompt));
  validateGeneratedPlaywrightScript(response);
  return response;
}

async function generateScriptFromRecording(prompt) {
  const response = stripMarkdown(await callOllama(prompt));
  validateGeneratedPlaywrightScript(response);
  return response;
}

module.exports = {
  generateManualTestCases,
  generatePlaywrightScript,
  generateScriptFromRecording,
};
