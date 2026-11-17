import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { randomUUID } from 'node:crypto'

const env = parseEnv(readFileSync('.env', 'utf8'))

test('lote pergunta dados faltantes e grava cliente+contrato atomicamente após confirmação única', async ({ page }) => {
  let complete = false
  await page.route('**/api/chat', async route => {
    const request = route.request().postDataJSON()
    const previous = request.context.batchDraft
    const call = {
      actionId: randomUUID(), ref: randomUUID(), name: 'prepare-batch',
      input: {
        ...(previous ? { batchId: previous.batchId, expectedRevision: previous.revision } : {}),
        clients: previous && complete ? [] : [{ ref: 'cliente1', name: 'Cliente Lote QA', email: 'lote.qa@example.com' }],
        contracts: previous && complete ? [{ ref: 'contrato1', valueCents: 250000, startDate: '2026-11-15' }] : [{ ref: 'contrato1', clientRef: 'cliente1', title: 'Contrato Lote QA' }],
      },
    }
    const history = [{ role: 'user', text: request.text }, { role: 'model', call }]
    const events = [{ type: 'action_requested', call }, { type: 'turn_end', reason: 'awaiting_user', technicalHistory: history }]
    await route.fulfill({ contentType: 'text/event-stream', body: events.map(event => `data: ${JSON.stringify({ ...event, turnId: request.turnId })}\n\n`).join('') })
  })
  expect((await page.request.post('/api/auth/login', { headers: { Origin: 'http://localhost:3000' }, data: { username: env.NUXT_LOGIN_USER, password: env.NUXT_LOGIN_PASSWORD } })).status()).toBe(200)
  await page.goto('/assistente')
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  await page.getByLabel('Mensagem para o assistente').fill('Cadastre Cliente Lote QA e um contrato para ele.')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await expect(page.locator('#batch-card')).toContainText('Faltam informações')
  await expect(page.getByRole('button', { name: 'Confirmar cadastros' })).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1')!).clients.length)).toBe(0)
  complete = true
  await page.getByLabel('Mensagem para o assistente').fill('O valor é R$ 2.500 e o início é 2026-11-15.')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await expect(page.getByRole('button', { name: 'Confirmar cadastros' })).toBeEnabled()
  await expect(page.locator('#batch-card')).toContainText('Cliente Lote QA (cliente 1 do lote)')

  await page.evaluate(() => {
    const win = window as typeof window & { originalSetItem?: typeof Storage.prototype.setItem }
    win.originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'genkit-assistant:v1' && JSON.parse(value).clients.length > 0) throw new DOMException('Quota cheia', 'QuotaExceededError')
      win.originalSetItem!.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Confirmar cadastros' }).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  const failed = await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1')!))
  expect(failed.clients).toHaveLength(0)
  expect(failed.contracts).toHaveLength(0)
  await page.evaluate(() => { Storage.prototype.setItem = (window as typeof window & { originalSetItem: typeof Storage.prototype.setItem }).originalSetItem })
  await page.getByRole('button', { name: 'Confirmar cadastros' }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  await expect(page.getByRole('log')).toContainText('1 cliente e 1 contrato criados')
  await page.reload()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1')!))
  expect(saved.clients).toHaveLength(1)
  expect(saved.contracts).toHaveLength(1)
  expect(saved.contracts[0].clientId).toBe(saved.clients[0].id)
  expect(saved.contracts[0].valueCents).toBe(250000)
  expect(saved.batchDraft).toBeNull()
})
