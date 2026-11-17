import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { randomUUID } from 'node:crypto'

const env = parseEnv(readFileSync('.env', 'utf8'))
async function minimizeAssistant(page: Page) {
  const minimize = page.getByRole('button', { name: 'Minimizar assistente', exact: true })
  if (await minimize.isVisible()) await minimize.click()
}
async function login(page: Page) {
  const response = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://localhost:3000' },
    data: { username: env.NUXT_LOGIN_USER, password: env.NUXT_LOGIN_PASSWORD },
  })
  expect(response.status()).toBe(200)
  await page.goto('/assistente')
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.getByLabel('Mensagem para o assistente')).toBeEnabled()
}
async function say(page: Page, text: string) {
  await page.getByLabel('Mensagem para o assistente').fill(text)
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
}
async function localCounts(page: Page) {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('genkit-assistant:v1') || '{}')
    return { clients: state.clients?.length ?? 0, contracts: state.contracts?.length ?? 0 }
  })
}

test('protege acesso, recusa origem externa e usa login real', async ({ page }) => {
  await page.goto('/clientes')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Usuário')).toBeVisible()
  const refused = await page.request.post('/api/auth/login', { headers: { Origin: 'https://example.com' }, data: {} })
  expect(refused.status()).toBe(403)
  await login(page)
  await page.getByRole('button', { name: 'Sair da conta' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect((await page.request.get('/api/auth/session')).status()).toBe(401)
})

test('chat navega, preenche e confirma; formulários manuais persistem os quatro registros', async ({ page }) => {
  let mode: 'client' | 'contract' = 'client'
  await page.route('**/api/chat', async route => {
    const request = route.request().postDataJSON()
    const draft = request.context.draft
    const target = mode === 'client' ? 'client-new' : 'contract-new'
    const prepared = mode === 'client' ? draft?.fields.name === 'Ana' : draft?.fields.title === 'Consultoria'
    const name = request.context.screen !== target ? 'navigate' : !prepared ? 'patch-draft' : 'request-review'
    const input = name === 'navigate' ? { screen: target } : name === 'patch-draft'
      ? { entity: mode, draftId: draft.draftId, expectedRevision: draft.revision, fields: mode === 'client' ? { name: 'Ana', email: 'ana@example.com' } : { clientId: request.context.clients.find((c: { name: string }) => c.name === 'Ana').id, title: 'Consultoria', valueCents: 150000, startDate: '2026-11-15' } }
      : { entity: mode, draftId: draft.draftId, expectedRevision: draft.revision }
    const call = { actionId: randomUUID(), ref: randomUUID(), name, input }
    const history = [...request.technicalHistory, request.kind === 'continue' ? { role: 'tool', result: request.ack } : { role: 'user', text: request.text }, { role: 'model', call }]
    const events = [
      { type: 'model_selected', model: 'deepseek/deepseek-v4.1-flash', fallback: false },
      { type: 'text_delta', text: 'Vou preparar a próxima etapa.' },
      { type: 'action_requested', call },
      { type: 'turn_end', reason: name === 'request-review' ? 'awaiting_user' : 'awaiting_ack', technicalHistory: history },
    ].map(e => ({ ...e, turnId: request.turnId }))
    await route.fulfill({ contentType: 'text/event-stream', body: events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') })
  })
  await login(page)
  await say(page, 'Cadastre Ana com ana@example.com')
  await expect(page).toHaveURL(/\/clientes\/novo$/)
  await expect(page.getByLabel('Nome', { exact: false }).first()).toHaveValue('Ana')
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toBeEnabled()
  expect(await localCounts(page)).toEqual({ clients: 0, contracts: 0 })
  await page.getByRole('button', { name: 'Confirmar salvamento' }).dblclick()
  await expect(page).toHaveURL(/\/clientes$/)
  expect(await localCounts(page)).toEqual({ clients: 1, contracts: 0 })

  mode = 'contract'
  await say(page, 'Crie o contrato Consultoria para Ana')
  await expect(page).toHaveURL(/\/contratos\/novo$/)
  await expect(page.getByLabel('Título', { exact: false })).toHaveValue('Consultoria')
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toBeEnabled()
  await page.getByRole('button', { name: 'Confirmar salvamento' }).click()
  await expect(page).toHaveURL(/\/contratos$/)

  await page.goto('/clientes/novo')
  await minimizeAssistant(page)
  await page.getByLabel('Nome', { exact: false }).first().fill('Bruno')
  await page.getByRole('button', { name: 'Revisar cadastro' }).click()
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toBeVisible()
  await minimizeAssistant(page)
  await page.getByLabel('Nome', { exact: false }).first().fill('Bruno Silva')
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Revisar cadastro' }).click()
  await page.getByRole('button', { name: 'Confirmar salvamento' }).click()
  await expect(page).toHaveURL(/\/clientes$/)

  await page.goto('/contratos/novo')
  await minimizeAssistant(page)
  await page.getByLabel('Cliente', { exact: false }).first().selectOption({ label: await page.locator('#contract-client option').filter({ hasText: 'Bruno Silva' }).innerText() })
  await page.getByLabel('Título', { exact: false }).fill('Suporte')
  await page.getByLabel('Valor (R$)', { exact: false }).fill('250,00')
  await page.getByLabel('Data de início', { exact: false }).fill('2026-11-16')
  await page.getByRole('button', { name: 'Revisar contrato' }).click()
  await page.getByRole('button', { name: 'Confirmar salvamento' }).click()
  await expect(page).toHaveURL(/\/contratos$/)
  await page.reload()
  await expect(page.getByText('Suporte', { exact: true })).toBeVisible()
  expect(await localCounts(page)).toEqual({ clients: 2, contracts: 2 })
  await page.getByRole('link', { name: 'Assistente', exact: false }).first().click()
  await expect(page).toHaveURL(/\/assistente$/)
  await expect(page.getByRole('log')).toContainText('Cliente salvo com sucesso')
})

test('reload invalida revisão; cancelar resposta ignora ações tardias', async ({ page }) => {
  await login(page)
  await page.goto('/clientes/novo')
  await minimizeAssistant(page)
  await page.getByLabel('Nome', { exact: false }).first().fill('Rascunho seguro')
  await page.getByRole('button', { name: 'Revisar cadastro' }).click()
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toBeVisible()
  await page.reload()
  await minimizeAssistant(page)
  await expect(page.getByLabel('Nome', { exact: false }).first()).toHaveValue('Rascunho seguro')
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Abrir assistente', exact: true }).click()
  await page.route('**/api/chat', async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.fulfill({ contentType: 'text/event-stream', body: '' }).catch(() => {}) })
  await say(page, 'Altere meu cadastro')
  await page.getByRole('button', { name: 'Interromper' }).click()
  await expect(page.getByText('Resposta interrompida.', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Nome', { exact: false }).first()).toHaveValue('Rascunho seguro')
  expect(await localCounts(page)).toEqual({ clients: 0, contracts: 0 })
})

test('mobile abre chat visível, preserva abertura e apresenta revisão', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await login(page)
  await expect(page.getByRole('heading', { name: 'O que você quer organizar hoje?' })).toBeInViewport()
  await page.goto('/clientes/novo')
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  await minimizeAssistant(page)
  await page.getByLabel('Nome', { exact: false }).first().fill('Cliente mobile')
  await page.getByRole('button', { name: 'Abrir assistente' }).click()
  await expect(page.getByLabel('Mensagem para o assistente')).toBeFocused()
  await expect(page.locator('#assistant-region')).toBeInViewport()
  await minimizeAssistant(page)
  await page.getByRole('button', { name: 'Revisar cadastro' }).click()
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/nexo-mobile-final.png', fullPage: true })
})

test('perder sessão durante navegação conserva rascunho e exige novo acesso', async ({ page, context }) => {
  await login(page)
  await page.goto('/clientes/novo')
  await minimizeAssistant(page)
  await page.getByLabel('Nome', { exact: false }).first().fill('Rascunho após expiração')
  await page.getByRole('button', { name: 'Revisar cadastro' }).click()
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toBeVisible()
  await context.clearCookies()
  await page.locator('.navigation').getByRole('link', { name: 'Contratos', exact: false }).click()
  await expect(page).toHaveURL(/\/login$/)
  await login(page)
  await expect(page.getByRole('button', { name: 'Confirmar salvamento' })).toHaveCount(0)
  await page.goto('/clientes/novo')
  await expect(page.getByLabel('Nome', { exact: false }).first()).toHaveValue('Rascunho após expiração')
})

test('sem chave de IA o erro orienta configuração e o uso manual continua', async ({ page }) => {
  test.skip(Boolean(env.NUXT_OPENROUTER_API_KEY), 'Ambiente tem chave; este cenário não faz inferência real.')
  await login(page)
  await say(page, 'Olá')
  await expect(page.getByRole('alert')).toContainText('ainda não foi configurado')
  await page.goto('/clientes/novo')
  await expect(page.getByLabel('Nome', { exact: false }).first()).toBeEnabled()
})
