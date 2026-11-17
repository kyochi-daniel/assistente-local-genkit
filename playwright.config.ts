import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  workers: 1,
  use: { baseURL: 'http://localhost:3000', screenshot: 'only-on-failure', trace: 'off' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
