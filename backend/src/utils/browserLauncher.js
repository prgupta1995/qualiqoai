function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function normalizeLaunchError(error) {
  const message = error?.message || String(error);
  return new Error(
    [
      'Unable to launch Chromium for browser automation.',
      `Runtime: ${isServerlessRuntime() ? 'serverless' : 'local'}.`,
      `Reason: ${message}`,
      isServerlessRuntime()
        ? 'Serverless deployments must include @sparticuz/chromium and use playwright-core.'
        : 'Local development requires Playwright browsers. Run: npx playwright install chromium',
    ].join(' '),
  );
}

async function launchChromium(options = {}) {
  const launchOptions = {
    headless: true,
    ...options,
  };

  try {
    if (isServerlessRuntime()) {
      const serverlessChromium = require('@sparticuz/chromium');
      const { chromium: playwrightChromium } = require('playwright-core');
      const executablePath = await serverlessChromium.executablePath();

      if (!executablePath) {
        throw new Error('Serverless Chromium executable path was empty.');
      }

      return playwrightChromium.launch({
        ...launchOptions,
        args: [
          ...serverlessChromium.args,
          '--disable-dev-shm-usage',
          ...(launchOptions.args || []),
        ],
        executablePath,
        headless: true,
      });
    }

    const { chromium: localChromium } = require('playwright');
    return localChromium.launch(launchOptions);
  } catch (error) {
    throw normalizeLaunchError(error);
  }
}

module.exports = {
  isServerlessRuntime,
  launchChromium,
};
