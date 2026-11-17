import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { randomUUID } from 'node:crypto'

const env = parseEnv(readFileSync('.env', 'utf8'))

test('dados antigos: editar não duplica; lixeira explica cascata e restaura somente o lote', async ({ page, context }) => {
  const clientId = randomUUID(), contractId = randomUUID(), olderContractId = randomUUID()
  const createdAt = '2026-11-13T12:00:00.000Z'
  const client = { id: clientId, name: 'Cliente legado QA', email: '', phone: '', createdAt }
  const contract = { id: contractId, clientId, title: 'Contrato vinculado QA', valueCents: 150000, startDate: '2026-11-15', endDate: '', status: 'draft', createdAt }
  const previous = { ...contract, id: olderContractId, title: 'Contrato arquivado antes', deletedAt: createdAt, deletionBatchId: randomUUID() }
  await context.addInitScript(data => { if (!localStorage.getItem('genkit-assistant:v1')) localStorage.setItem('genkit-assistant:v1', JSON.stringify(data)) }, { schemaVersion: 1, clients: [client], contracts: [contract, previous], messages: [], draft: null })
  expect((await page.request.post('/api/auth/login', { headers: { Origin: 'http://localhost:3000' }, data: { username: env.NUXT_LOGIN_USER, password: env.NUXT_LOGIN_PASSWORD } })).status()).toBe(200)
  await page.goto('/clientes')
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: 'Minimizar assistente', exact: true }).click()
  await page.getByRole('link', { name: 'Editar cliente Cliente legado QA', exact: true }).click()
  await expect(page.locator('#client-name')).toHaveValue('Cliente legado QA')
  await page.locator('#client-email').fill('legado.qa@example.com')
  await page.getByRole('button', { name: 'Revisar alterações' }).click()
  await page.getByRole('button', { name: 'Confirmar alterações' }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  await expect(page.getByRole('row').filter({ hasText: 'Cliente legado QA' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Minimizar assistente', exact: true }).click()
  await page.getByRole('button', { name: 'Mover cliente Cliente legado QA para a lixeira', exact: true }).click()
  await expect(page.locator('#mutation-card')).toContainText('1 contrato vinculado')
  await expect(page.locator('#mutation-card')).toContainText('Contrato vinculado QA')
  await expect(page.locator('#mutation-card')).not.toContainText('Contrato arquivado antes')
  await page.locator('#mutation-card').getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Cliente legado QA' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Minimizar assistente', exact: true }).click()
  await page.getByRole('button', { name: 'Mover cliente Cliente legado QA para a lixeira', exact: true }).click()
  await page.locator('#mutation-card').getByRole('button', { name: 'Mover para a lixeira', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Cliente legado QA' })).toHaveCount(0)
  await page.goto('/lixeira')
  await page.getByRole('button', { name: 'Minimizar assistente', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Restaurar contrato Contrato vinculado QA', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Restaurar cliente Cliente legado QA', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar restauração' }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  await page.goto('/contratos')
  await expect(page.getByRole('row').filter({ hasText: 'Contrato vinculado QA' })).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: 'Contrato arquivado antes' })).toHaveCount(0)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1')!))
  expect(saved.clients).toHaveLength(1)
  expect(saved.clients[0]).toMatchObject({ id: clientId, createdAt, email: 'legado.qa@example.com' })
  expect(saved.contracts).toHaveLength(2)
  expect(saved.contracts.find((c: { id: string }) => c.id === olderContractId).deletedAt).toBeTruthy()
})
