import { test, expect, type Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Only synthetic audio reaches the meter; recognition is controlled below.
const audioPath = join(tmpdir(), 'nexo-dictation-synthetic.wav')
const sampleRate = 48000
const samples = sampleRate * 4
const wav = Buffer.alloc(44 + samples * 2)
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28)
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36)
wav.writeUInt32LE(samples * 2, 40)
for (let i = 0; i < samples; i++) {
  const amplitude = Math.floor(i / (sampleRate / 2)) % 2 ? 0.65 : 0.05
  wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * amplitude * 32767), 44 + i * 2)
}
writeFileSync(audioPath, wav)

test.use({
  channel: 'chrome', headless: false, viewport: { width: 1440, height: 1000 },
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${audioPath}`] },
})
const env = parseEnv(readFileSync('.env', 'utf8'))

async function installSpeech(page: Page, options: { unsupported?: boolean; deny?: boolean } = {}) {
  await page.addInitScript(options => {
    const scope = window as any
    const control = { instances: [] as any[], tracks: [] as MediaStreamTrack[], starts: 0, stops: 0, aborts: 0, nativeSupported: Boolean(scope.SpeechRecognition || scope.webkitSpeechRecognition) }
    scope.__speechTest = control
    class Recognition {
      onstart: any; onend: any; onerror: any; onresult: any; onspeechend: any
      lang = ''; continuous = false; interimResults = false; maxAlternatives = 1
      constructor() { control.instances.push(this) }
      start() { control.starts++; setTimeout(() => this.onstart?.({}), 0) }
      stop() { control.stops++ }
      abort() { control.aborts++; this.onend?.({}) }
      result(text: string, final = true) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: 1 }], { isFinal: final })] }) }
      end() { this.onend?.({}) }
      fail(error: string) { this.onerror?.({ error }); this.onend?.({}) }
    }
    Object.defineProperty(scope, 'SpeechRecognition', { configurable: true, value: options.unsupported ? undefined : Recognition })
    Object.defineProperty(scope, 'webkitSpeechRecognition', { configurable: true, value: options.unsupported ? undefined : Recognition })
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (options.deny) throw new DOMException('Test denied', 'NotAllowedError')
      const stream = await getMedia(constraints)
      control.tracks.push(...stream.getTracks())
      return stream
    }
  }, options)
}
async function login(page: Page) {
  const response = await page.request.post('/api/auth/login', { headers: { Origin: 'http://localhost:3000' }, data: { username: env.NUXT_LOGIN_USER, password: env.NUXT_LOGIN_PASSWORD } })
  expect(response.status()).toBe(200)
  await page.goto('/assistente')
  await expect(page.locator('.workspace-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.getByLabel('Mensagem para o assistente')).toBeEnabled()
}
async function speech(page: Page, text: string, final = true, end = false) {
  await page.evaluate(({ text, final, end }) => {
    const instance = (window as any).__speechTest.instances.at(-1)
    instance.result(text, final)
    if (end) instance.end()
  }, { text, final, end })
}
async function noLiveTracks(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as any).__speechTest.tracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true)
}
async function blockChat(page: Page) {
  const requests: string[] = []
  await page.route('**/api/chat', route => { requests.push(route.request().url()); return route.abort() })
  return requests
}

test('ditado mede áudio real sintético e insere no cursor, sem enviar', async ({ page }) => {
  await installSpeech(page)
  const requests = await blockChat(page)
  await login(page)
  expect(await page.evaluate(() => (window as any).__speechTest.nativeSupported)).toBe(true)
  const input = page.getByLabel('Mensagem para o assistente')
  await input.fill('Crie para amanhã')
  await input.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(5, 9))
  await page.getByRole('button', { name: 'Ditar mensagem', exact: true }).click()
  await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
  await expect(input).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeDisabled()
  await speech(page, 'a cliente Ana', false)
  await expect(input).toHaveValue('Crie para amanhã')
  await expect.poll(() => page.evaluate(() => (window as any).__speechTest.tracks.length)).toBeGreaterThan(0)
  await expect.poll(async () => page.locator('.dictation-meter').evaluate(element => [...element.querySelectorAll('span')].some(bar => bar.getBoundingClientRect().height > 6))).toBe(true)
  const initialHeights = await page.locator('.dictation-meter span').evaluateAll(bars => bars.map(bar => bar.getBoundingClientRect().height))
  await expect.poll(() => page.locator('.dictation-meter span').evaluateAll((bars, initial) => bars.some((bar, index) => Math.abs(bar.getBoundingClientRect().height - initial[index]!) > 0.1), initialHeights)).toBe(true)
  await page.screenshot({ path: '/tmp/nexo-dictation-listening.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Concluir ditado', exact: true }).click()
  await expect(page.locator('.dictation-card')).toContainText('Transcrevendo')
  await noLiveTracks(page)
  await speech(page, 'a cliente Ana', true, true)
  await expect(input).toHaveValue('Crie a cliente Ana amanhã')
  await expect(input).toBeFocused()
  await expect(page.locator('.composer')).toContainText('Texto pronto para revisar')
  expect(requests).toEqual([])
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('genkit-assistant:v1') || '{"messages":[]}').messages.length)).toBe(0)
  await page.screenshot({ path: '/tmp/nexo-dictation-review.png', animations: 'disabled' })
})

test('clique prolongado apenas inicia; X descarta processamento e ignora resposta tardia', async ({ page }) => {
  await installSpeech(page)
  const requests = await blockChat(page)
  await login(page)
  const input = page.getByLabel('Mensagem para o assistente')
  await input.fill('Texto preservado')
  const mic = page.getByRole('button', { name: 'Ditar mensagem', exact: true })
  await mic.click({ delay: 400 })
  await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
  await page.getByRole('button', { name: 'Concluir ditado', exact: true }).click()
  await expect(page.locator('.dictation-card')).toContainText('Transcrevendo')
  await page.getByRole('button', { name: 'Cancelar ditado', exact: true }).click()
  await speech(page, 'não pode aparecer', true, true)
  await expect(input).toHaveValue('Texto preservado')
  await expect(mic).toBeFocused()
  await noLiveTracks(page)
  expect(requests).toEqual([])
})

test('pausas e ausência de fala rearmam sem escrever; somente o botão conclui os segmentos', async ({ page }) => {
  await installSpeech(page)
  const requests = await blockChat(page)
  await login(page)
  const input = page.getByLabel('Mensagem para o assistente')
  await input.fill('Pedido:')
  await page.getByRole('button', { name: 'Ditar mensagem', exact: true }).click()
  await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
  expect(await page.evaluate(() => (window as any).__speechTest.instances.at(-1).continuous)).toBe(true)
  await speech(page, 'Cadastre Ana', true)
  await speech(page, 'Cadastre Ana', true)
  await page.evaluate(() => (window as any).__speechTest.instances.at(-1).onspeechend?.({}))
  await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
  await expect(input).toHaveValue('Pedido:')
  expect(await page.evaluate(() => (window as any).__speechTest.stops)).toBe(0)
  await page.evaluate(() => (window as any).__speechTest.instances.at(-1).end())
  await expect.poll(() => page.evaluate(() => (window as any).__speechTest.starts)).toBe(2)
  await page.evaluate(() => (window as any).__speechTest.instances.at(-1).fail('no-speech'))
  await expect.poll(() => page.evaluate(() => (window as any).__speechTest.starts)).toBe(3)
  await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
  await expect(input).toHaveValue('Pedido:')
  await page.evaluate(() => {
    const finals = Object.assign([{ transcript: 'contrato de consultoria' }], { isFinal: true })
    const noise = Object.assign([{ transcript: 'barulho provisório' }], { isFinal: false })
    const instance = (window as any).__speechTest.instances.at(-1)
    instance.onresult({ results: [finals, noise] })
    instance.onspeechend?.({})
  })
  await expect(input).toHaveValue('Pedido:')
  expect(await page.evaluate(() => (window as any).__speechTest.stops)).toBe(0)
  await page.getByRole('button', { name: 'Concluir ditado', exact: true }).click()
  await expect(page.locator('.dictation-card')).toContainText('Transcrevendo')
  await page.evaluate(() => (window as any).__speechTest.instances.at(-1).end())
  await expect(input).toHaveValue('Pedido: Cadastre Ana contrato de consultoria')
  await noLiveTracks(page)
  expect(requests).toEqual([])
})

test('Escape cancela primeiro; minimizar interrompe captura sem apagar texto', async ({ page }) => {
  await installSpeech(page)
  await blockChat(page)
  await login(page)
  const input = page.getByLabel('Mensagem para o assistente')
  await input.fill('Rascunho')
  const mic = page.getByRole('button', { name: 'Ditar mensagem', exact: true })
  await mic.click()
  await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
  await page.keyboard.press('Escape')
  await expect(input).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Minimizar assistente', exact: true })).toBeVisible()
  await noLiveTracks(page)
  await mic.click()
  await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
  await page.getByRole('button', { name: 'Minimizar assistente', exact: true }).click()
  await noLiveTracks(page)
  await speech(page, 'tardio', true, true)
  await page.getByRole('button', { name: 'Abrir assistente', exact: true }).click()
  await expect(input).toHaveValue('Rascunho')
  await expect(page.locator('.dictation-card')).toHaveCount(0)
})

test('permissão recusada preserva digitação e libera reconhecimento', async ({ page }) => {
  await installSpeech(page, { deny: true })
  await login(page)
  const input = page.getByLabel('Mensagem para o assistente')
  await input.fill('Texto anterior')
  await page.getByRole('button', { name: 'Ditar mensagem', exact: true }).click()
  await expect(input).toBeEnabled()
  await expect(page.locator('.composer')).toContainText(/permissão|microfone/i)
  await expect(input).toHaveValue('Texto anterior')
  await expect.poll(() => page.evaluate(() => (window as any).__speechTest.aborts)).toBeGreaterThan(0)
})

test('navegador sem reconhecimento mantém entrada manual', async ({ page }) => {
  await installSpeech(page, { unsupported: true })
  await login(page)
  await expect(page.getByRole('button', { name: 'Ditar mensagem', exact: true })).toBeDisabled()
  await expect(page.locator('.composer')).toContainText(/navegador/i)
  await page.getByLabel('Mensagem para o assistente').fill('Posso digitar')
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeEnabled()
})

test('resultado extenso fica completo e não pode ser enviado antes da edição', async ({ page }) => {
  await installSpeech(page)
  const requests = await blockChat(page)
  await login(page)
  await page.getByRole('button', { name: 'Ditar mensagem', exact: true }).click()
  await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
  const text = 'palavra '.repeat(510).trim()
  await page.getByRole('button', { name: 'Concluir ditado', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Transcrevendo…', exact: true })).toBeDisabled()
  await speech(page, text, true)
  const input = page.getByLabel('Mensagem para o assistente')
  await expect(input).toHaveValue('')
  await expect(page.locator('.dictation-card')).toContainText('Transcrevendo')
  await expect(page.getByRole('button', { name: 'Cancelar ditado', exact: true })).toBeFocused()
  await page.screenshot({ path: '/tmp/nexo-dictation-processing.png', animations: 'disabled' })
  await page.evaluate(() => (window as any).__speechTest.instances.at(-1).end())
  await expect(input).toHaveValue(text)
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeDisabled()
  await input.press('Enter')
  await expect(input).toHaveValue(text)
  expect(requests).toEqual([])
  await input.fill('Texto revisado')
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeEnabled()
})

test('teclado e erros de reconhecimento mantêm o campo disponível', async ({ page }) => {
  await installSpeech(page)
  const requests = await blockChat(page)
  await login(page)
  const input = page.getByLabel('Mensagem para o assistente')
  await input.fill('Antes')
  const mic = page.getByRole('button', { name: 'Ditar mensagem', exact: true })
  for (const error of ['audio-capture', 'network']) {
    await mic.focus()
    await mic.press('Enter')
    await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
    await page.evaluate(error => (window as any).__speechTest.instances.at(-1).fail(error), error)
    await expect(input).toBeEnabled()
    await expect(input).toHaveValue('Antes')
    await noLiveTracks(page)
  }
  await mic.focus()
  await mic.press('Space')
  await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
  await page.getByRole('button', { name: 'Concluir ditado', exact: true }).press('Enter')
  await expect(page.locator('.dictation-card')).toContainText('Transcrevendo')
  await speech(page, 'depois', true, true)
  await expect(input).toHaveValue('Antes depois')
  expect(requests).toEqual([])
})

test('visibilidade controlada e logout encerram a captura', async ({ page }) => {
  await installSpeech(page)
  const requests = await blockChat(page)
  await login(page)
  const input = page.getByLabel('Mensagem para o assistente')
  await input.fill('Sem perder')
  await page.getByRole('button', { name: 'Ditar mensagem', exact: true }).click()
  await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
  await expect.poll(() => page.evaluate(() => (window as any).__speechTest.tracks.length)).toBeGreaterThan(0)
  // Automation pages can occupy separate visible windows; control visibility explicitly.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await noLiveTracks(page)
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await speech(page, 'não inserir', true, true)
  await expect(input).toHaveValue('Sem perder')
  await expect(input).toBeEnabled()
  await page.getByRole('button', { name: 'Ditar mensagem', exact: true }).click()
  await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await noLiveTracks(page)
  expect(requests).toEqual([])
})

test.describe('ditado por toque', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' })
  test('badge cabe no chat e o texto volta para revisão após toque', async ({ page }) => {
    await installSpeech(page)
    const requests = await blockChat(page)
    await login(page)
    await page.getByRole('button', { name: 'Ditar mensagem', exact: true }).tap()
    await expect(page.locator('.dictation-card')).toContainText('Ouvindo')
    const card = await page.locator('.dictation-card').boundingBox()
    expect(card!.x).toBeGreaterThanOrEqual(0)
    expect(card!.x + card!.width).toBeLessThanOrEqual(375)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: '/tmp/nexo-dictation-mobile.png', animations: 'disabled' })
    await page.getByRole('button', { name: 'Concluir ditado', exact: true }).tap()
    await expect(page.locator('.dictation-card')).toContainText('Transcrevendo')
    await speech(page, 'Cadastre Ana', true, true)
    await expect(page.getByLabel('Mensagem para o assistente')).toHaveValue('Cadastre Ana')
    expect(requests).toEqual([])
    await noLiveTracks(page)
  })
})
