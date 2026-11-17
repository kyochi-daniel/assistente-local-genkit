import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { randomUUID } from 'node:crypto'

const env = parseEnv(readFileSync('.env', 'utf8'))

test('chat flutua, mantém texto ao minimizar e formata negrito sem executar HTML', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await context.addInitScript(message => {
    if (!localStorage.getItem('genkit-assistant:v1')) localStorage.setItem('genkit-assistant:v1', JSON.stringify({ schemaVersion: 1, clients: [], contracts: [], draft: null, messages: [message] }))
  }, { id: randomUUID(), role: 'assistant', text: '**Atenção**\n<img src=x onerror="alert(1)">', createdAt: new Date().toISOString() })
  expect((await page.request.post('/api/auth/login', { headers: { Origin: 'http://localhost:3000' }, data: { username: env.NUXT_LOGIN_USER, password: env.NUXT_LOGIN_PASSWORD } })).status()).toBe(200)
  await page.goto('/assistente')
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  expect(await page.locator('.assistant-popover').evaluate(node => getComputedStyle(node).position)).toBe('fixed')
  await expect(page.locator('.message-content strong')).toHaveText('Atenção')
  await expect(page.locator('.message-content')).toContainText('<img src=x onerror="alert(1)">')
  await expect(page.locator('.message-content img')).toHaveCount(0)
  await page.getByLabel('Mensagem para o assistente').fill('Minha mensagem ainda não enviada')
  await page.getByLabel('Mensagem para o assistente').press('Escape')
  await expect(page.getByRole('button', { name: 'Abrir assistente', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Abrir assistente', exact: true }).press('Enter')
  await expect(page.getByLabel('Mensagem para o assistente')).toHaveValue('Minha mensagem ainda não enviada')
  await expect(page.locator('#assistant-region section.assistant')).toHaveCount(1)
  const box = await page.locator('.assistant-popover').boundingBox()
  expect(box?.width).toBeCloseTo(736, 0)
  expect(box?.height).toBeCloseTo(780, 0)
  await page.screenshot({ path: '/tmp/nexo-floating-desktop-final.png', fullPage: true })
})
