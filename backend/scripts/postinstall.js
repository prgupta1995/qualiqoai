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
  run('npx', ['playwright', 'install', 'chromium'], {
    env: {
      PLAYWRIGHT_BROWSERS_PATH: '0',
    },
  });
}
