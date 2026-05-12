function parseLogs(logs) {
  if (!logs) {
    return [];
  }

  if (Array.isArray(logs)) {
    return logs;
  }

  try {
    return JSON.parse(logs);
  } catch {
    return [];
  }
}

function buildScreenshotUrl(req, screenshot) {
  if (!screenshot) {
    return null;
  }

  if (/^https?:\/\//i.test(screenshot)) {
    return screenshot;
  }

  const normalizedPath = screenshot.startsWith('/') ? screenshot : `/${screenshot}`;
  return `${req.protocol}://${req.get('host')}${normalizedPath}`;
}

function serializeTestRun(run, req) {
  return {
    ...run,
    logs: parseLogs(run.logs),
    screenshot: buildScreenshotUrl(req, run.screenshot),
  };
}

module.exports = { serializeTestRun };
