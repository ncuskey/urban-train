/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  timeout: 90_000,
  webServer: {
    command: 'npx http-server -p 8000 -c-1 .',
    port: 8000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 }
  },
  reporter: [['list'], ['html', { open: 'never' }]],
};
module.exports = config;
