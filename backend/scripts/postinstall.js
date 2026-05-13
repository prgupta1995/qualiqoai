const { spawnSync } = require('child_process');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run('node', ['scripts/prisma-command.js', 'generate']);

if (process.env.VERCEL || process.env.INSTALL_PLAYWRIGHT_BROWSERS === 'true') {
  run('node', ['scripts/install-playwright.js']);
}
