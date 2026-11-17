import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { randomUUID } from 'node:crypto'

const env = parseEnv(readFileSync('.env', 'utf8'))
const name = 'Cliente QA Real'
const title = 'Consultoria QA Real'

async function ask(page: Page, text: string) {
  const startedAt = Date.now()
  await page.getByLabel('Mensagem para o assistente').fill(text)
  const response = page.waitForResponse(r => r.url().endsWith('/api/chat'), { timeout: 70000 })
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  expect((await response).status()).toBe(200)
  await expect(page.getByRole('button', { name: 'Interromper' })).toHaveCount(0, { timeout: 70000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  const models = await page.locator('.assistant-footer').innerText()
  if (!env.NUXT_OPENROUTER_FALLBACK_MODEL) expect(models).toContain(env.NUXT_OPENROUTER_MODEL!)
  console.log(JSON.stringify({ elapsedMs: Date.now() - startedAt, prompt: text, route: new URL(page.url()).pathname, models }))
}

test.beforeEach(async ({ page }) => {
  test.skip(!env.NUXT_OPENROUTER_API_KEY, 'A chave deve ser configurada no .env; este teste usa o provedor real.')
  const login = await page.request.post('/api/auth/login', { headers: { Origin: 'http://localhost:3000' }, data: { username: env.NUXT_LOGIN_USER, password: env.NUXT_LOGIN_PASSWORD } })
  expect(login.status()).toBe(200)
  await page.goto('/assistente')
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
})

test('OpenRouter real: cria, edita e arquiva cliente/contrato; restaura pelo navegador', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('response', async response => {
    if (!response.url().endsWith('/api/chat')) return
    try {
      for (const line of (await response.text()).split('\n')) {
        if (!line.startsWith('data:')) continue
        const event = JSON.parse(line.slice(5))
        if (event.type === 'error') console.log(JSON.stringify({ serverError: event.code, message: event.message }))
      }
    } catch {}
  })

  await ask(page, `Cadastre um cliente novo chamado ${name}, e-mail qa.real@example.com e telefone (67) 99999-1234.`)
  await expect(page).toHaveURL(/\/clientes\/novo$/)
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toBeVisible()
  await expect(page.locator('#client-name')).toHaveValue(name)
  await expect(page.locator('#client-email')).toHaveValue('qa.real@example.com')
  await page.getByRole('button', { name: 'Confirmar salvamento' }).click()
  await expect(page).toHaveURL(/\/clientes$/)

  await ask(page, `Edite o cliente ${name} e altere o telefone para (67) 98888-5678.`)
  await expect(page).toHaveURL(/\/clientes\/[\da-f-]+\/editar$/)
  await expect(page.locator('#client-phone')).toHaveValue('(67) 98888-5678')
  await expect(page.getByRole('button', { name: 'Confirmar alterações' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar alterações' }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1)

  await ask(page, `Crie um contrato para o cliente ${name}, título ${title}, valor de R$ 1.500,00, início em 2026-11-15, status rascunho e sem data de término.`)
  await expect(page.locator('#contract-title')).toHaveValue(title)
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar salvamento' }).click()
  await expect(page).toHaveURL(/\/contratos$/)

  await ask(page, `Edite o contrato ${title} e altere o valor para R$ 1.750,00, mantendo os demais dados.`)
  await expect(page).toHaveURL(/\/contratos\/[\da-f-]+\/editar$/)
  await expect(page.locator('#contract-value')).toHaveValue('1750,00')
  await expect(page.getByRole('button', { name: 'Confirmar alterações' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar alterações' }).click()
  await expect(page).toHaveURL(/\/contratos$/)

  await ask(page, `Exclua o cliente ${name}, mostrando o impacto antes de eu confirmar.`)
  await expect(page.locator('#mutation-card')).toContainText('1 contrato')
  await expect(page.locator('#mutation-card')).toContainText(title)
  await page.locator('#mutation-card').getByRole('button', { name: 'Mover para a lixeira', exact: true }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0)
  await page.goto('/lixeira')
  await page.getByRole('button', { name: 'Minimizar assistente', exact: true }).click()
  await expect(page.getByRole('button', { name: `Restaurar contrato ${title}`, exact: true })).toBeDisabled()
  await page.getByRole('button', { name: `Restaurar cliente ${name}`, exact: true }).click()
  await expect(page.locator('#mutation-card')).toContainText('1 contrato')
  await page.getByRole('button', { name: 'Confirmar restauração' }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1)
  await page.goto('/contratos')
  await expect(page.getByRole('row').filter({ hasText: title })).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: title })).toContainText('1.750,00')
  await ask(page, `Exclua somente o contrato ${title}.`)
  await expect(page.locator('#mutation-card')).toContainText(/o cliente continuará disponível/i)
  await page.locator('#mutation-card').getByRole('button', { name: 'Mover para a lixeira', exact: true }).click()
  await expect(page).toHaveURL(/\/contratos$/)
  await expect(page.getByRole('row').filter({ hasText: title })).toHaveCount(0)
  await page.goto('/lixeira')
  await page.getByRole('button', { name: 'Minimizar assistente', exact: true }).click()
  await page.getByRole('button', { name: `Restaurar contrato ${title}`, exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar restauração' }).click()
  await expect(page).toHaveURL(/\/contratos$/)
  await expect(page.getByRole('row').filter({ hasText: title })).toHaveCount(1)
  expect(browserErrors).toEqual([])
  await page.screenshot({ path: '/tmp/nexo-live-crud-final.png', fullPage: true })
})

test('OpenRouter real pergunta nome ausente e não exige contatos opcionais', async ({ page }) => {
  await ask(page, 'Quero cadastrar um cliente. Abra o formulário e pergunte o nome, ainda não informei.')
  await expect(page).toHaveURL(/\/clientes\/novo$/)
  await expect(page.locator('#client-name')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toHaveCount(0)
  await ask(page, 'O nome é Cliente Nome QA. Deixe e-mail e telefone vazios.')
  await expect(page.locator('#client-name')).toHaveValue('Cliente Nome QA')
  await expect(page.locator('#client-email')).toHaveValue('')
  await expect(page.locator('#client-phone')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toBeVisible()
})

test('OpenRouter real pede escolha quando há clientes homônimos', async ({ page }) => {
  const ids = [randomUUID(), randomUUID()]
  await page.evaluate(clientIds => {
    const current = JSON.parse(localStorage.getItem('genkit-assistant:v1') || '{"schemaVersion":1,"clients":[],"contracts":[],"messages":[],"draft":null}')
    current.clients = clientIds.map(id => ({ id, name: 'Duplicado QA', email: '', phone: '', createdAt: new Date().toISOString() }))
    localStorage.setItem('genkit-assistant:v1', JSON.stringify(current))
  }, ids)
  await page.reload()
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  await ask(page, 'Exclua o cliente Duplicado QA.')
  await expect(page.locator('#mutation-card')).toHaveCount(0)
  await expect(page.getByRole('log')).toContainText(/qual|escolh|identific|dois|2/i)
  const active = await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1')!).clients.filter((c: { deletedAt?: string }) => !c.deletedAt).length)
  expect(active).toBe(2)
})

test('OpenRouter real cria cliente e contrato juntos e completa os dados do lote', async ({ page }) => {
  if (process.env.NEXO_TRACE_LIVE === '1') {
    await page.route('**/api/chat', async route => {
      const response = await route.fetch()
      const body = await response.text()
      for (const line of body.split('\n')) {
        if (!line.startsWith('data:')) continue
        const event = JSON.parse(line.slice(5))
        if (event.type === 'error' || event.type === 'action_requested') console.log(JSON.stringify(event))
      }
      await route.fulfill({ response, body })
    })
  }
  await ask(page, 'Cadastre o cliente Cliente Conjunto QA, e-mail conjunto.qa@example.com. Na mesma operação, crie para ele o contrato Consultoria Conjunta QA. Ainda vou informar valor e data de início.')
  await expect(page.locator('#batch-card')).toBeVisible()
  await expect(page.locator('#batch-card')).toContainText('Faltam informações')
  await expect(page.getByRole('button', { name: 'Confirmar cadastros' })).toHaveCount(0)
  await ask(page, 'O contrato Consultoria Conjunta QA custa R$ 2.500,00 e começa em 2026-11-15. Mantenha os dados do cliente e deixe telefone e término vazios.')
  await expect(page.getByRole('button', { name: 'Confirmar cadastros' })).toBeEnabled()
  await expect(page.locator('#batch-card')).toContainText('1 cliente · 1 contrato')
  await page.screenshot({ path: '/tmp/nexo-live-batch-review-final.png', fullPage: true })
  await page.getByRole('button', { name: 'Confirmar cadastros' }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1')!))
  expect(saved.clients).toHaveLength(1)
  expect(saved.contracts).toHaveLength(1)
  expect(saved.contracts[0].clientId).toBe(saved.clients[0].id)
  expect(saved.clients[0].name).toBe('Cliente Conjunto QA')
  expect(saved.contracts[0].title).toBe('Consultoria Conjunta QA')
  expect(saved.contracts[0].valueCents).toBe(250000)
  await page.screenshot({ path: '/tmp/nexo-live-batch-final.png', fullPage: true })
})

test('OpenRouter real prepara vários clientes e contratos com vínculos distintos', async ({ page }) => {
  await ask(page, 'Cadastre dois clientes novos: QA Lote Um, e-mail um.qa@example.com; QA Lote Dois, e-mail dois.qa@example.com. Na mesma operação, crie o contrato Plano Um QA para QA Lote Um, valor R$ 100,00, início 2026-11-15; e o contrato Plano Dois QA para QA Lote Dois, valor R$ 200,00, início 2026-11-16. Todos em status rascunho, sem término e sem telefones.')
  await expect(page.locator('#batch-card')).toContainText('2 clientes · 2 contratos')
  await expect(page.getByRole('button', { name: 'Confirmar cadastros' })).toBeEnabled()
  await page.getByRole('button', { name: 'Confirmar cadastros' }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1')!))
  expect(saved.clients).toHaveLength(2)
  expect(saved.contracts).toHaveLength(2)
  const first = saved.clients.find((client: { name: string }) => client.name === 'QA Lote Um')
  const second = saved.clients.find((client: { name: string }) => client.name === 'QA Lote Dois')
  expect(saved.contracts.find((contract: { title: string }) => contract.title === 'Plano Um QA').clientId).toBe(first.id)
  expect(saved.contracts.find((contract: { title: string }) => contract.title === 'Plano Dois QA').clientId).toBe(second.id)
})
