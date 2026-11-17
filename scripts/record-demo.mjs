import { chromium, expect } from '@playwright/test'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { resolve } from 'node:path'

// Perfil descartável: nunca altera o localStorage do navegador pessoal.
const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env }
const baseURL = 'http://localhost:3000'
const model = process.env.DEMO_MODEL || 'baidu/ernie-5.5-flash-preview:free'
if (!model.endsWith(':free')) throw new Error('A gravação aceita somente um modelo explicitamente gratuito.')
if (!env.NUXT_OPENROUTER_API_KEY) throw new Error('Configure a chave no .env local antes de gravar.')
const rawDirectory = resolve('test-results/demo-recording')
const mediaDirectory = resolve('docs/media')
mkdirSync(rawDirectory, { recursive: true })
mkdirSync(mediaDirectory, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1600, height: 1000 },
  recordVideo: { dir: rawDirectory, size: { width: 1600, height: 1000 } },
})
const login = await context.request.post('/api/auth/login', {
  headers: { Origin: baseURL },
  data: { username: env.NUXT_LOGIN_USER, password: env.NUXT_LOGIN_PASSWORD },
})
if (login.status() !== 200) throw new Error('Login local não autorizado; nenhuma credencial foi registrada.')
await context.addInitScript(selectedModel => {
  localStorage.setItem('nexo:model-settings:v1', JSON.stringify({ primary: selectedModel, fallback: null }))
}, model)
const page = await context.newPage()
const video = page.video()
const started = Date.now()
const chapters = []
const turns = []
const errors = []
page.on('pageerror', error => errors.push(error.name))
const mark = text => { chapters.push({ at: (Date.now() - started) / 1000, text }); console.log(text) }
const pause = milliseconds => page.waitForTimeout(milliseconds)
const minimize = async () => {
  const button = page.getByRole('button', { name: 'Minimizar assistente', exact: true })
  if (await button.isVisible()) await button.click()
}
const open = async () => {
  const button = page.getByRole('button', { name: 'Abrir assistente', exact: true })
  if (await button.isVisible()) await button.click()
}
async function ask(text) {
  await open()
  await page.getByLabel('Mensagem para o assistente').fill(text)
  await pause(1600)
  const began = Date.now()
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/chat'), { timeout: 120000 })
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  const response = await responsePromise
  if (response.status() !== 200) throw new Error(`O provedor respondeu HTTP ${response.status()}.`)
  await expect(page.getByRole('button', { name: 'Interromper', exact: true })).toHaveCount(0, { timeout: 120000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.composer-details summary')).toContainText(model)
  turns.push({ seconds: +(Date.now() - began) / 1000, model, httpStatus: response.status() })
  await pause(2500)
}
try {
  await page.goto('/assistente')
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1') || '{"clients":[]}').clients.length)).toBe(0)
  mark('01 · Assistente local: conversa limpa e dados fictícios')
  await pause(4000)
  await page.screenshot({ path: `${mediaDirectory}/inicio.png` })

  mark('02 · Pedido em linguagem natural: cliente e contrato no mesmo lote')
  await ask('Cadastre a cliente Ana Souza, e-mail ana@example.com, sem telefone. Na mesma operação crie para ela o contrato Consultoria de automações, valor R$ 2.500,00, início em 2026-11-20, status rascunho e sem término. Prepare o lote para minha revisão.')
  await expect(page.locator('#batch-card')).toContainText('1 cliente · 1 contrato', { timeout: 10000 })
  await expect(page.getByRole('button', { name: 'Confirmar cadastros', exact: true })).toBeEnabled()
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1')))
  expect(before.clients).toHaveLength(0)
  expect(before.contracts).toHaveLength(0)
  mark('03 · Revisão humana: nada foi salvo antes da confirmação')
  await page.locator('#batch-card').scrollIntoViewIfNeeded()
  await pause(5000)
  await page.screenshot({ path: `${mediaDirectory}/revisao-lote.png` })
  await page.getByRole('button', { name: 'Confirmar cadastros', exact: true }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  await minimize()
  await pause(4000)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1')))
  expect(saved.clients).toHaveLength(1)
  expect(saved.contracts).toHaveLength(1)
  expect(saved.contracts[0].clientId).toBe(saved.clients[0].id)
  expect(saved.contracts[0].valueCents).toBe(250000)
  await page.getByRole('link', { name: /^Contratos/ }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Consultoria de automações' })).toHaveCount(1)
  await pause(3500)

  mark('04 · Edição por formulário: o cadastro também funciona sem IA')
  await page.getByRole('link', { name: /^Clientes/ }).click()
  await page.getByRole('link', { name: 'Editar cliente Ana Souza', exact: true }).click()
  await page.locator('#client-phone').fill('(67) 99999-1234')
  await pause(2000)
  await page.getByRole('button', { name: 'Revisar alterações', exact: true }).click()
  await pause(3500)
  await page.getByRole('button', { name: 'Confirmar alterações', exact: true }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  await minimize()
  await pause(2000)

  mark('05 · Exclusão com impacto: cliente e contrato serão movidos juntos')
  await page.getByRole('button', { name: 'Mover cliente Ana Souza para a lixeira', exact: true }).click()
  await expect(page.locator('#mutation-card')).toContainText('1 contrato')
  await expect(page.locator('#mutation-card')).toContainText('Consultoria de automações')
  await pause(4500)
  await page.screenshot({ path: `${mediaDirectory}/revisao-exclusao.png` })
  await page.locator('#mutation-card').getByRole('button', { name: 'Mover para a lixeira', exact: true }).click()
  await minimize()
  await page.getByRole('link', { name: /^Lixeira/ }).click()
  await expect(page.getByRole('button', { name: 'Restaurar contrato Consultoria de automações', exact: true })).toBeDisabled()
  await pause(4000)
  mark('06 · Restauração: os vínculos do lote são recuperados com confirmação')
  await page.getByRole('button', { name: 'Restaurar cliente Ana Souza', exact: true }).click()
  await pause(3500)
  await page.getByRole('button', { name: 'Confirmar restauração', exact: true }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  await minimize()
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: 'Ana Souza' })).toHaveCount(1)
  await minimize()
  await pause(3000)

  mark('07 · Catálogo real: modelos, compatibilidade e estimativa de custos')
  await page.getByRole('link', { name: 'Configurações', exact: true }).click()
  await expect(page.getByLabel('Buscar modelos')).toBeEnabled({ timeout: 20000 })
  await page.getByLabel('Buscar modelos').fill(':free')
  await pause(4500)
  await page.screenshot({ path: `${mediaDirectory}/configuracoes.png` })
  mark('08 · Dados no navegador; inferência remota via Genkit e OpenRouter')
  await pause(5000)
  expect(errors).toEqual([])
  const final = await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1')))
  expect(final.clients.filter(client => !client.deletedAt)).toHaveLength(1)
  expect(final.contracts.filter(contract => !contract.deletedAt)).toHaveLength(1)
  const seconds = (Date.now() - started) / 1000
  await context.close()
  const rawPath = await video.path()
  writeFileSync(`${rawDirectory}/manifest.json`, JSON.stringify({ recordedAt: new Date().toISOString(), rawPath, seconds, model, realProvider: true, isolatedContext: true, chapters, turns, checks: ['empty storage', 'no write before confirmation', 'linked atomic batch', 'edit', 'cascade delete', 'restore', 'reload persistence', 'no browser errors'] }, null, 2))
  console.log(JSON.stringify({ completed: true, seconds, rawPath, turns }))
} catch (error) {
  await page.screenshot({ path: `${rawDirectory}/failure.png` }).catch(() => {})
  await context.close()
  writeFileSync(`${rawDirectory}/failure.json`, JSON.stringify({ error: error.message, chapters, turns, model, rawPath: await video.path() }, null, 2))
  console.error(error.message)
  process.exitCode = 1
} finally { await browser.close() }
