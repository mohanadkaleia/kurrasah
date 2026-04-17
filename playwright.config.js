// @ts-check
import { defineConfig } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'off',
    locale: 'ar',
  },

  outputDir: 'artifacts/playwright/screenshots',

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],

  webServer: [
    {
      command: 'python3 e2e/start_backend.py',
      port: 5000,
      reuseExistingServer: !process.env.CI,
      cwd: __dirname,
      timeout: 30000,
    },
    {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      cwd: path.join(__dirname, 'web'),
      timeout: 15000,
    },
  ],
})
