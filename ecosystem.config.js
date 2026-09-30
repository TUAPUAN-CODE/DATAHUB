module.exports = {
  apps: [
    {
      name: 'datahub-server',
      cwd: './server',
      script: './node_modules/ts-node-dev/lib/bin.js',
      args: '--respawn --transpile-only src/index.ts',
      interpreter: 'node',
      windowsHide: true,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'datahub-client',
      cwd: './client',
      script: './node_modules/vite/bin/vite.js',
      args: '--host 0.0.0.0 --port 5175',
      interpreter: 'node',
      windowsHide: true,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};