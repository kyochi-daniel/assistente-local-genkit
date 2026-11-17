import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

const env = parseEnv(readFileSync('.env', 'utf8'))
const model = 'inclusionai/ling-3.2-flash:free'

test('modelo gratuito escolhido na tela é utilizado pelo Genkit real', async ({ page }) => {
  test.skip(!env.NUXT_OPENROUTER_API_KEY, 'Este teste usa a chave configurada e o endpoint gratuito.')
  expect((await page.request.post('/api/auth/login', { headers: { Origin: 'http://localhost:3000' }, data: { username: env.NUXT_LOGIN_USER, password: env.NUXT_LOGIN_PASSWORD } })).status()).toBe(200)
  await page.goto('/configuracoes')
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: 'Minimizar assistente', exact: true }).click()
  await page.getByLabel('Buscar modelos').fill(model)
  const row = page.locator('.model-row').filter({ hasText: model })
  await expect(row).toContainText('Gratuito', { timeout: 15000 })
  await row.getByRole('button', { name: /como principal$/ }).click()
  const disable = page.getByRole('button', { name: 'Desativar alternativo', exact: true })
  if (await disable.isVisible()) await disable.click()
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click()
  await expect(page.getByText('Configuração aplicada. Será usada nos próximos turnos.')).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nexo:model-settings:v1')!))).toEqual({ primary: model, fallback: null })
  await page.getByRole('button', { name: 'Abrir assistente', exact: true }).click()
  await page.getByLabel('Mensagem para o assistente').fill('Responda apenas: pronto. Não use ferramentas neste pedido.')
  const response = page.waitForResponse(r => r.url().endsWith('/api/chat'), { timeout: 70000 })
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  const result = await response
  expect(result.status()).toBe(200)
  await expect(page.getByRole('button', { name: 'Interromper' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.assistant-footer')).toContainText(model)
  await expect(page.locator('.assistant-footer')).not.toContainText('modelo alternativo')
})
