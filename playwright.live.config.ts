import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testDir: './tests/live',
  outputDir: './live-test-results',
  timeout: 240000,
  retries: 0,
  use: { ...base.use, channel: 'chrome', headless: false, viewport: { width: 1440, height: 1000 }, actionTimeout: 15000 },
})
