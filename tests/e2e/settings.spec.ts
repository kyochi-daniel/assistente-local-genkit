import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { randomUUID } from 'node:crypto'
import type { CatalogModel } from '../../shared/models'

test.use({ channel: 'chrome', headless: false, viewport: { width: 1440, height: 1000 } })

const env = parseEnv(readFileSync('.env', 'utf8'))
const primary = 'inclusionai/ling-3.2-flash:free'
const alternate = 'openai/gpt-6-luna'
const defaults = { primary: 'baidu/ernie-5.5-flash-preview:free', fallback: null }
const item = (id: string, name: string, cost: CatalogModel['cost'], compatible = true): CatalogModel => ({
  id, name, cost, compatible, promptPrice: cost === 'free' ? '0' : '0.000001',
  completionPrice: cost === 'free' ? '0' : '0.000002', contextLength: 100000, inputModalities: ['text'],
  outputModalities: ['text'], description: 'Modelo de teste para conversas e tarefas.', hasAdditionalCosts: false,
})
const models = [
  { ...item(primary, 'Ling 3.2 Flash', 'free'), inputModalities: ['text', 'image'] }, item(defaults.primary, 'ERNIE 5.5 Flash Preview', 'free'),
  ...Array.from({ length: 70 }, (_, index) => item(`teste/modelo-${index}:free`, `Modelo ${String(index).padStart(2, '0')}`, 'free')),
  { ...item(alternate, 'GPT-6 Luna', 'paid'), description: 'Modelo de teste <img src=x onerror=alert(1)>' },
  { ...item('recraft/recraft-v4.1-flash-v2', 'Recraft imagem', 'paid', false), promptPrice: '0', completionPrice: '0', outputModalities: ['image'], hasAdditionalCosts: true },
]

async function login(page: Page) {
  expect((await page.request.post('/api/auth/login', { headers: { Origin: 'http://localhost:3000' }, data: { username: env.NUXT_LOGIN_USER, password: env.NUXT_LOGIN_PASSWORD } })).status()).toBe(200)
}

async function mockCatalog(page: Page) {
  const queries: string[] = []
  await page.route('**/api/exchange-rate', route => route.fulfill({ json: { rate: 5, quotedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), source: 'AwesomeAPI', stale: false } }))
  await page.route('**/api/models?**', async route => {
    const params = new URL(route.request().url()).searchParams
    const q = (params.get('q') || '').toLowerCase()
    queries.push(q)
    const pricing = params.get('pricing') || 'all'
    const currentPage = Number(params.get('page') || 1)
    const compatibility = params.get('compatibility') || 'all'
    const found = models.filter(model => `${model.name} ${model.id}`.toLowerCase().includes(q) && (pricing === 'all' || pricing === model.cost) && (compatibility === 'all' || model.compatible === (compatibility === 'compatible')))
    await route.fulfill({ json: { items: found.slice((currentPage - 1) * 40, currentPage * 40), total: found.length, page: currentPage, pageSize: 40, updatedAt: '2026-11-14T03:00:00Z', stale: false, defaults } })
  })
  return queries
}

async function minimize(page: Page) {
  const button = page.getByRole('button', { name: 'Minimizar assistente', exact: true })
  if (await button.isVisible()) await button.click()
}

async function openSettings(page: Page) {
  await page.goto('/configuracoes')
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  await minimize(page)
  await expect(page.locator('.model-row').first()).toBeVisible()
}

test('catálogo real exige sessão, protege origem e retorna somente uma página reduzida', async ({ page }) => {
  expect((await page.request.get('/api/models')).status()).toBe(401)
  expect((await page.request.get('/api/exchange-rate')).status()).toBe(401)
  await login(page)
  expect((await page.request.get('/api/models', { headers: { Origin: 'https://externo.example' } })).status()).toBe(403)
  expect((await page.request.get('/api/exchange-rate', { headers: { Origin: 'https://externo.example' } })).status()).toBe(403)
  expect((await page.request.get('/api/exchange-rate?pair=EUR-USD')).status()).toBe(400)
  const exchangeResponse = await page.request.get('/api/exchange-rate')
  expect(exchangeResponse.status()).toBe(200)
  const exchange = await exchangeResponse.json()
  expect(exchange.source).toBe('AwesomeAPI')
  expect(exchange.rate).toBeGreaterThan(0)
  expect(Number.isFinite(Date.parse(exchange.quotedAt))).toBe(true)
  expect(exchangeResponse.headers()['cache-control']).toContain('private')
  expect((await page.request.get('/api/models?page=0')).status()).toBe(400)
  expect((await page.request.get('/api/models?compatibility=invalid')).status()).toBe(400)
  const response = await page.request.get('/api/models')
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toContain('private')
  const body = await response.json()
  expect(body.items.length).toBeGreaterThan(0)
  expect(body.items.length).toBeLessThanOrEqual(40)
  expect(body.total).toBeGreaterThanOrEqual(body.items.length)
  expect(Object.keys(body.defaults).sort()).toEqual(['fallback', 'primary'])
  expect(body.items[0]).toHaveProperty('description')
  expect(body.items[0].description.length).toBeLessThanOrEqual(240)
  expect(body.items[0]).toHaveProperty('outputModalities')
  expect(body.items[0]).not.toHaveProperty('pricing')
  for (const compatibility of ['compatible', 'incompatible']) {
    const filtered = await page.request.get(`/api/models?compatibility=${compatibility}`)
    expect(filtered.status()).toBe(200)
    expect((await filtered.json()).items.every((model: CatalogModel) => model.compatible === (compatibility === 'compatible'))).toBe(true)
  }
  const exact = await page.request.get('/api/models?q=baidu%2Fernie-5.5-flash-preview%3Afree')
  expect((await exact.json()).items).toEqual(expect.arrayContaining([expect.objectContaining({ id: defaults.primary, cost: 'free', compatible: true })]))
})

test('busca paginada, preço, principal/alternativo e snapshot do próximo turno', async ({ page }) => {
  const queries = await mockCatalog(page)
  await login(page)
  await openSettings(page)
  await expect(page.getByRole('link', { name: 'Configurações', exact: true })).toBeVisible()
  await expect(page.getByLabel('Compatibilidade', { exact: true })).toHaveValue('compatible')
  await expect(page.locator('.model-row')).toHaveCount(40)
  expect((await page.locator('.model-row').first().boundingBox())!.y).toBeLessThan(650)
  const visible = await page.locator('.model-row').evaluateAll(rows => rows.filter(row => { const rect = row.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= window.innerHeight }).length)
  expect(visible).toBeGreaterThanOrEqual(4)
  await page.getByRole('button', { name: 'Próxima', exact: true }).click()
  await expect(page.locator('.model-pagination')).toContainText('41–73 de 73')
  await expect(page.locator('.model-row')).toHaveCount(33)
  await page.getByLabel('Buscar modelos').pressSequentially('ling', { delay: 20 })
  await expect(page.locator('.model-row')).toHaveCount(1)
  expect(queries.filter(query => ['l', 'li', 'lin'].includes(query))).toEqual([])
  expect(queries.filter(query => query === 'ling')).toHaveLength(1)

  await page.getByLabel('Buscar modelos').fill('Recraft')
  await expect(page.locator('.model-row')).toHaveCount(0)
  await page.getByLabel('Compatibilidade', { exact: true }).selectOption('incompatible')
  const incompatible = page.locator('.model-row').filter({ hasText: 'Recraft imagem' })
  await expect(incompatible).toContainText('Pago')
  await expect(incompatible.getByRole('button', { name: 'Usar Recraft imagem como principal' })).toBeDisabled()
  await page.getByLabel('Compatibilidade', { exact: true }).selectOption('all')
  await page.getByLabel('Buscar modelos').fill('')
  await expect(page.locator('.model-pagination')).toContainText('1–40 de 74')
  await page.getByLabel('Buscar modelos').fill('ling 3.2')
  const ling = page.locator('.model-row').filter({ hasText: 'Ling 3.2 Flash' })
  await expect(ling).toContainText('Gratuito')
  await ling.getByRole('button', { name: 'Usar Ling 3.2 Flash como principal' }).click()
  await page.getByRole('button', { name: 'Alternativo', exact: true }).click()
  await page.getByLabel('Preço', { exact: true }).selectOption('paid')
  await page.getByLabel('Buscar modelos').fill(alternate)
  const luna = page.locator('.model-row').filter({ hasText: 'GPT-6 Luna' })
  await expect(luna).toContainText('Pago')
  await luna.getByRole('button', { name: 'Usar GPT-6 Luna como alternativo' }).click()
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click()
  await expect(page.getByText('Configuração aplicada. Será usada nos próximos turnos.')).toBeVisible()
  await page.reload()
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  await minimize(page)
  await expect(page.locator('.model-selection')).toContainText(primary)
  await expect(page.locator('.model-selection')).toContainText(alternate)
  await expect(page.locator('.model-selection article').filter({ hasText: alternate })).toContainText('Pago')
  await page.getByRole('heading', { name: 'Configurações', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: '/tmp/nexo-model-settings-desktop.png', animations: 'disabled' })

  await page.getByLabel('Buscar modelos').fill('ERNIE')
  await page.getByRole('button', { name: 'Usar ERNIE 5.5 Flash Preview como principal' }).click()
  const bodies: Record<string, any>[] = []
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/chat', async route => {
    const request = route.request().postDataJSON()
    bodies.push(request)
    if (request.kind === 'message') {
      await held
      const call = { name: 'navigate', actionId: randomUUID(), ref: randomUUID(), input: { screen: 'clients' } }
      const events = [{ type: 'model_selected', model: primary, fallback: false }, { type: 'action_requested', call }, { type: 'turn_end', reason: 'awaiting_ack', technicalHistory: [{ role: 'user', text: request.text }, { role: 'model', call }] }]
      await route.fulfill({ contentType: 'text/event-stream', body: events.map(event => `data: ${JSON.stringify({ ...event, turnId: request.turnId })}\n\n`).join('') })
    } else {
      await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ turnId: request.turnId, type: 'turn_end', reason: 'complete', technicalHistory: [...request.technicalHistory, { role: 'tool', result: request.ack }] })}\n\n` })
    }
  })
  await page.getByRole('button', { name: 'Abrir assistente', exact: true }).click()
  await page.getByLabel('Mensagem para o assistente').fill('Abra clientes')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await expect(page.getByRole('button', { name: 'Aplicar alterações', exact: true })).toBeDisabled()
  release()
  await expect(page).toHaveURL(/\/clientes$/)
  await expect(page.getByRole('button', { name: 'Interromper' })).toHaveCount(0)
  expect(bodies).toHaveLength(2)
  for (const body of bodies) {
    expect(body.modelSelection).toEqual({ primary, fallback: alternate })
    expect(body).not.toHaveProperty('openrouterApiKey')
  }
})

test('ID manual, falha de storage e padrão do ambiente preservam a configuração', async ({ page }) => {
  await mockCatalog(page)
  await login(page)
  await openSettings(page)
  await page.getByText('Informar ID manual', { exact: true }).click()
  await page.getByLabel('ID do modelo', { exact: true }).fill('https://externo.example/modelo')
  await expect(page.getByRole('button', { name: 'Usar ID digitado', exact: true })).toBeDisabled()
  await page.getByLabel('ID do modelo', { exact: true }).fill('provedor/novo-modelo:free')
  await page.getByRole('button', { name: 'Usar ID digitado', exact: true }).click()
  await expect(page.locator('.model-selection')).toContainText('Preço não confirmado')
  await page.locator('.model-selection').getByRole('button', { name: 'Detalhes de provedor/novo-modelo:free', exact: true }).hover()
  await expect(page.locator('.model-info')).toContainText('Preço e compatibilidade não confirmados')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click()
  await expect(page.getByText('Configuração aplicada. Será usada nos próximos turnos.')).toBeVisible()
  const saved = { primary: 'provedor/novo-modelo:free', fallback: null }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nexo:model-settings:v1')!))).toEqual(saved)

  await page.getByLabel('ID do modelo', { exact: true }).fill('provedor/outro-modelo')
  await page.getByRole('button', { name: 'Usar ID digitado', exact: true }).click()
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Object.assign(window, { settingsOriginalSetItem: original })
    Storage.prototype.setItem = function (key, value) {
      if (key === 'nexo:model-settings:v1') throw new DOMException('Quota cheia', 'QuotaExceededError')
      original.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('A seleção anterior foi preservada')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nexo:model-settings:v1')!))).toEqual(saved)
  await page.evaluate(() => { Storage.prototype.setItem = (window as typeof window & { settingsOriginalSetItem: typeof Storage.prototype.setItem }).settingsOriginalSetItem })
  await page.getByRole('button', { name: 'Usar padrão do ambiente', exact: true }).click()
  await expect(page.getByText('Padrão do ambiente restaurado para os próximos turnos.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('nexo:model-settings:v1'))).toBeNull()
  await expect(page.locator('.model-selection')).toContainText(defaults.primary)
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('heading', { name: 'Configurações', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: '/tmp/nexo-model-settings-mobile.png', animations: 'disabled' })
})


test('simulador converte USD para centavos e detalhes funcionam por hover e foco', async ({ page }) => {
  await mockCatalog(page)
  let fxRequests = 0
  await page.route('**/api/exchange-rate', route => {
    fxRequests += 1
    return route.fulfill({ json: { rate: 5, quotedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), source: 'AwesomeAPI', stale: false } })
  })
  await login(page)
  await openSettings(page)
  await page.getByLabel('Buscar modelos').fill(alternate)
  const row = page.locator('.model-row').filter({ hasText: 'GPT-6 Luna' })
  await expect(row.locator('.model-pricing')).toContainText('1,5 cent')
  expect(await row.locator('.model-pricing').innerText()).not.toContain('Contexto:')
  const info = row.getByRole('button', { name: 'Detalhes de GPT-6 Luna', exact: true })
  await info.hover()
  const panel = page.locator('.model-info')
  await expect(panel).toHaveCount(1)
  await expect(panel).toContainText('Somente texto')
  await expect(panel).toContainText('Entrada: texto. Saída: texto.')
  await expect(panel).toContainText('R$')
  await expect(panel).toContainText('5,00')
  await expect(panel).toContainText('IOF')
  await expect(panel).toContainText('<img src=x onerror=alert(1)>')
  await expect(panel.locator('img')).toHaveCount(0)
  await expect(info).toHaveAttribute('aria-describedby', /.+/)
  await panel.hover()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await info.focus()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  await page.getByLabel('Saída (tokens)', { exact: true }).fill('2500')
  await expect(row.locator('.model-pricing')).toContainText('3 cent')
  expect(fxRequests).toBe(1)
  await page.getByLabel('Entrada (tokens)', { exact: true }).fill('1')
  await page.getByLabel('Saída (tokens)', { exact: true }).fill('0')
  await expect(row.locator('.model-pricing')).toContainText('<0,01 cent')
  await page.getByLabel('Entrada (tokens)', { exact: true }).fill('1000000')
  await expect(row.locator('.model-pricing')).toContainText(/R\$\s*5,00/)
  await page.getByLabel('Entrada (tokens)', { exact: true }).fill('0')
  await page.getByLabel('Saída (tokens)', { exact: true }).fill('0')
  await expect(row.locator('.model-pricing')).toContainText('Sem tokens simulados')
  await expect(row.locator('.model-cost')).toHaveText('Pago')
  await page.getByLabel('Entrada (tokens)', { exact: true }).fill('-1')
  await expect(page.getByRole('alert')).toContainText('Use inteiros')
  await expect(row.locator('.model-pricing')).toContainText('Informe volumes válidos')
  await page.getByLabel('Entrada (tokens)', { exact: true }).fill('1000')
  await page.getByLabel('Saída (tokens)', { exact: true }).fill('1000')
  await page.getByLabel('Buscar modelos').fill(primary)
  const ling = page.locator('.model-row').filter({ hasText: 'Ling 3.2 Flash' })
  await ling.getByRole('button', { name: 'Detalhes de Ling 3.2 Flash', exact: true }).hover()
  await expect(panel).toContainText('Multimodal')
  await expect(panel).toContainText('Entrada: texto + imagem. Saída: texto.')
  await expect(panel).toHaveCount(1)
  await page.keyboard.press('Escape')
  await ling.getByRole('button', { name: 'Usar Ling 3.2 Flash como principal' }).click()
  await page.locator('.model-selection').getByRole('button', { name: 'Detalhes de Ling 3.2 Flash', exact: true }).hover()
  await expect(panel).toHaveCount(1)
  await expect(panel).toContainText('texto + imagem')
  await page.screenshot({ path: '/tmp/nexo-model-info-desktop.png', animations: 'disabled' })
})

test('câmbio indisponível mantém USD e cotação antiga é identificada sem bloquear seleção', async ({ page }) => {
  await mockCatalog(page)
  let available = false
  await page.route('**/api/exchange-rate', route => available
    ? route.fulfill({ json: { rate: 5, quotedAt: new Date(Date.now() - 2 * 86400000).toISOString(), fetchedAt: new Date().toISOString(), source: 'AwesomeAPI', stale: true } })
    : route.fulfill({ status: 503, json: { message: 'Cotação indisponível' } }))
  await login(page)
  await openSettings(page)
  await expect(page.locator('.model-exchange')).toContainText('indisponível')
  await page.getByLabel('Buscar modelos').fill(alternate)
  const row = page.locator('.model-row').filter({ hasText: 'GPT-6 Luna' })
  await expect(row.locator('.model-pricing')).toContainText('US$')
  await expect(row.locator('.model-pricing')).not.toContainText('cent')
  await row.getByRole('button', { name: 'Usar GPT-6 Luna como principal' }).click()
  await expect(page.getByRole('button', { name: 'Aplicar alterações', exact: true })).toBeEnabled()
  available = true
  await page.reload()
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  await minimize(page)
  await expect(page.locator('.model-exchange')).toContainText('Última cotação de')
  await page.getByLabel('Compatibilidade', { exact: true }).selectOption('incompatible')
  await page.getByLabel('Buscar modelos').fill('Recraft')
  const image = page.locator('.model-row').filter({ hasText: 'Recraft imagem' })
  await expect(image.locator('.model-pricing')).toContainText('Ver tarifas')
  await image.getByRole('button', { name: 'Detalhes de Recraft imagem', exact: true }).hover()
  await expect(page.locator('.model-info')).toContainText('Entrada: texto. Saída: imagem.')
  await expect(page.locator('.model-info')).toContainText('tarifas próprias')
})

test.describe('detalhes por toque', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } })
  test('foco do mesmo gesto não fecha o primeiro clique', async ({ page }) => {
    await mockCatalog(page)
    await login(page)
    await openSettings(page)
    await page.getByLabel('Buscar modelos').fill(primary)
    await expect(page.locator('.model-row')).toHaveCount(1)
    const trigger = page.locator('.model-row').getByRole('button', { name: 'Detalhes de Ling 3.2 Flash', exact: true })
    await expect(trigger).toBeEnabled()
    const openedByFocus = await trigger.evaluate(async element => {
      const button = element as HTMLButtonElement
      button.focus()
      await Promise.resolve()
      const opened = button.hasAttribute('aria-describedby')
      button.click()
      return opened
    })
    expect(openedByFocus).toBe(true)
    await expect(page.locator('.model-info')).toBeVisible()
    await trigger.tap()
    await expect(page.locator('.model-info')).toHaveCount(0)
  })

  test('ícone abre e fecha no toque sem sair da viewport', async ({ page }) => {
    await mockCatalog(page)
    await login(page)
    await openSettings(page)
    await page.getByLabel('Buscar modelos').fill(primary)
    const row = page.locator('.model-row').filter({ hasText: 'Ling 3.2 Flash' })
    const trigger = row.getByRole('button', { name: 'Detalhes de Ling 3.2 Flash', exact: true })
    await trigger.tap()
    const panel = page.locator('.model-info')
    await expect(panel).toBeVisible()
    await expect.poll(async () => {
      const box = await panel.boundingBox()
      return !!box && box.x >= 10 && box.x + box.width <= 365 && box.y >= 10 && box.y + box.height <= 802
    }).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: '/tmp/nexo-model-info-mobile.png', animations: 'disabled' })
    await trigger.tap()
    await expect(panel).toHaveCount(0)
    await trigger.tap()
    await expect(panel).toBeVisible()
    await page.getByRole('heading', { name: 'Configurações', exact: true }).tap()
    await expect(panel).toHaveCount(0)
  })
})
