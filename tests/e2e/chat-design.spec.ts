import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { randomUUID } from 'node:crypto'

const env = parseEnv(readFileSync('.env', 'utf8'))
test.use({ channel: 'chrome', headless: false, viewport: { width: 1440, height: 1000 } })
async function login(page: Page) {
  const response = await page.request.post('/api/auth/login', { headers: { Origin: 'http://localhost:3000' }, data: { username: env.NUXT_LOGIN_USER, password: env.NUXT_LOGIN_PASSWORD } })
  expect(response.status()).toBe(200)
  await page.goto('/assistente')
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
}

test('chat replica proporções, esfera e sugestões sem mudar o tema do espaço', async ({ page }) => {
  await login(page)
  const panel = page.locator('.assistant-popover')
  const box = await panel.boundingBox()
  expect(box!.width).toBeCloseTo(736, 0)
  expect(box!.height).toBeCloseTo(780, 0)
  const initialScroll = await page.locator('.conversation').evaluate(element => ({ client: element.clientHeight, scroll: element.scrollHeight }))
  expect(initialScroll.scroll).toBeLessThanOrEqual(initialScroll.client + 1)
  await expect(page.getByRole('heading', { name: 'Assistente', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'O que você quer organizar hoje?', exact: true })).toBeVisible()
  await expect(page.locator('.assistant-orb svg')).toHaveCount(1)
  await expect(page.locator('.assistant-orb')).toHaveAttribute('aria-hidden', 'true')
  expect(await page.locator('.assistant-orb').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  await expect(panel.locator('img, video, canvas')).toHaveCount(0)
  expect(await page.locator('.sidebar').evaluate(element => getComputedStyle(element).getPropertyValue('--primary').trim())).toBe('#245be1')
  const chips = page.locator('.suggestions button:not(.suggestions-more)')
  await expect(chips).toHaveCount(3)
  await expect(chips.locator('small')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mostrar mais', exact: true }).click()
  await expect(chips).toHaveCount(5)
  await page.getByRole('button', { name: 'Mostrar menos', exact: true }).click()
  await expect(chips).toHaveCount(3)
  await page.getByLabel('Mensagem para o assistente').fill('Ainda estou revisando')
  await page.getByRole('button', { name: 'Tópicos', exact: true }).click()
  await page.getByRole('button', { name: 'Tópicos', exact: true }).click()
  await expect(page.getByLabel('Mensagem para o assistente')).toHaveValue('Ainda estou revisando')
  await page.getByRole('button', { name: 'Minimizar assistente', exact: true }).click()
  await expect(page.locator('.assistant-orb')).toHaveAttribute('data-active', 'false')
  expect(await page.locator('.assistant-orb').evaluate(element => element.getAnimations({ subtree: true }).every(animation => animation.playState === 'paused' || animation.playState === 'finished'))).toBe(true)
  await page.getByRole('button', { name: 'Abrir assistente', exact: true }).click()
  await expect(page.locator('.assistant-orb')).toHaveAttribute('data-active', 'true')
  await page.getByLabel('Mensagem para o assistente').fill('')
  await panel.screenshot({ path: '/tmp/nexo-chat-remap-desktop.png', animations: 'disabled' })
  await expect.poll(() => page.locator('.assistant-orb').evaluate(element => element.getAnimations({ subtree: true }).length)).toBeGreaterThan(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.locator('.assistant-orb').evaluate(element => element.getAnimations({ subtree: true }).every(animation => animation.playState === 'paused' || animation.playState === 'finished'))).toBe(true)
})

test('Tópicos mantém histórico e encaminha uma sugestão pelo fluxo existente', async ({ page, context }) => {
  const message = { id: randomUUID(), role: 'assistant', text: 'Sua conversa está preservada.', createdAt: new Date().toISOString() }
  const history = Array.from({ length: 8 }, (_, index) => ({ ...message, id: randomUUID(), text: index === 0 ? message.text : `Mensagem anterior ${index}. ${'Histórico local preservado. '.repeat(12)}` }))
  await context.addInitScript(messages => localStorage.setItem('genkit-assistant:v1', JSON.stringify({ schemaVersion: 1, clients: [], contracts: [], draft: null, messages })), history)
  const bodies: Record<string, any>[] = []
  await page.route('**/api/chat', async route => {
    const body = route.request().postDataJSON()
    bodies.push(body)
    const events = [{ type: 'text_delta', text: 'Vamos conferir seus clientes.' }, { type: 'turn_end', reason: 'complete', technicalHistory: [{ role: 'user', text: body.text }] }]
    await route.fulfill({ contentType: 'text/event-stream', body: events.map(event => `data: ${JSON.stringify({ ...event, turnId: body.turnId })}\n\n`).join('') })
  })
  await login(page)
  await expect(page.locator('.message-content').first()).toContainText(message.text)
  await expect(page.locator('.assistant-orb')).toHaveCount(0)
  await page.getByRole('button', { name: 'Tópicos', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ver meus cadastros', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Ver meus cadastros', exact: true }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]!.text).toBe('Abra a lista de clientes.')
  await expect(page.locator('.message-content').last()).toContainText('Vamos conferir seus clientes.')
  await expect(page.getByRole('button', { name: 'Interromper', exact: true })).toHaveCount(0)
  await expect(page.locator('.message-content').first()).toContainText(message.text)
})

for (const viewport of [{ width: 375, height: 812 }, { width: 320, height: 568 }]) {
  test(`chat cabe e mantém controles em ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await login(page)
    const panel = page.locator('.assistant-popover')
    const box = await panel.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const name of ['Tópicos', 'Ditar mensagem', 'Enviar mensagem', 'Minimizar assistente']) {
      const control = page.getByRole('button', { name, exact: true })
      await expect(control).toBeInViewport()
      const target = await control.boundingBox()
      expect(target!.height).toBeGreaterThanOrEqual(44)
      expect(target!.width).toBeGreaterThanOrEqual(44)
    }
    await panel.screenshot({ path: `/tmp/nexo-chat-remap-${viewport.width}.png`, animations: 'disabled' })
  })
}
