import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDictation } from '../../app/composables/useDictation'
import { insertDictationText } from '../../app/utils/dictation'
const hooks = vi.hoisted(() => ({ mounted: [] as (() => void)[], unmounted: [] as (() => void)[] }))
vi.mock('vue', async importOriginal => ({ ...await importOriginal<typeof import('vue')>(), onMounted: (callback: () => void) => hooks.mounted.push(callback), onBeforeUnmount: (callback: () => void) => hooks.unmounted.push(callback) }))
class Recognition {
  static instances: Recognition[] = []
  lang = ''; continuous = true; interimResults = false
  onstart: (() => void) | null = null; onend: (() => void) | null = null; onspeechend: (() => void) | null = null
  onresult: ((event: { results: ({ transcript: string }[] & { isFinal: boolean })[] }) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  start = vi.fn(); stop = vi.fn(); abort = vi.fn()
  constructor() { Recognition.instances.push(this) }
}
let win: EventTarget & { SpeechRecognition?: typeof Recognition; webkitSpeechRecognition?: typeof Recognition; AudioContext?: unknown }
let doc: EventTarget & { hidden: boolean }
let getUserMedia: ReturnType<typeof vi.fn>
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
function setup() {
  const onTranscript = vi.fn()
  const dictation = useDictation({ onTranscript })
  hooks.mounted.forEach(callback => callback())
  return { ...dictation, onTranscript }
}
beforeEach(() => {
  vi.useFakeTimers()
  hooks.mounted = []; hooks.unmounted = []; Recognition.instances = []
  win = Object.assign(new EventTarget(), { SpeechRecognition: Recognition })
  doc = Object.assign(new EventTarget(), { hidden: false })
  getUserMedia = vi.fn(() => new Promise(() => {}))
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => { hooks.unmounted.forEach(callback => callback()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('ditado nativo', () => {
  it('detecta suporte só no mount e inicia reconhecimento no gesto, sem esperar microfone', () => {
    const dictation = useDictation({ onTranscript: vi.fn() })
    expect(dictation.supported.value).toBe(false)
    hooks.mounted.forEach(callback => callback())
    dictation.start()
    const recognition = Recognition.instances[0]!
    expect(dictation.supported.value).toBe(true)
    expect(dictation.phase.value).toBe('starting')
    expect(recognition.start).toHaveBeenCalledOnce()
    expect(recognition).toMatchObject({ lang: 'pt-BR', continuous: true, interimResults: true })
    recognition.onstart!()
    expect(dictation.phase.value).toBe('listening')
    dictation.start()
    expect(Recognition.instances).toHaveLength(1)
  })

  it('detecta webkit e informa suporte ausente sem tocar no microfone', () => {
    delete win.SpeechRecognition
    win.webkitSpeechRecognition = Recognition
    expect(setup().supported.value).toBe(true)
    delete win.webkitSpeechRecognition
    const unsupported = setup()
    unsupported.start()
    expect(unsupported.supported.value).toBe(false)
    expect(unsupported.error.value).toContain('não está disponível')
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('acumula revisões sem emitir parciais e entrega uma transcrição apenas no end', () => {
    const dictation = setup(); dictation.start()
    const recognition = Recognition.instances[0]!
    recognition.onresult!({ results: [Object.assign([{ transcript: 'Olá' }], { isFinal: true })] })
    recognition.onresult!({ results: [Object.assign([{ transcript: 'Olá mundo' }], { isFinal: true }), Object.assign([{ transcript: 'teste' }], { isFinal: true })] })
    expect(dictation.onTranscript).not.toHaveBeenCalled()
    recognition.onspeechend!()
    expect(dictation.phase.value).toBe('starting')
    dictation.finish()
    expect(dictation.phase.value).toBe('processing')
    recognition.onend!(); recognition.onend!()
    expect(dictation.onTranscript).toHaveBeenCalledExactlyOnceWith('Olá mundo teste')
    expect(dictation.phase.value).toBe('idle')
  })

  it('finish durante starting não volta a ouvir quando onstart chega tarde', () => {
    const dictation = setup(); dictation.start(); dictation.finish()
    const recognition = Recognition.instances[0]!
    expect(dictation.phase.value).toBe('processing')
    recognition.onstart!()
    expect(dictation.phase.value).toBe('processing')
    expect(recognition.stop).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(10_000)
    expect(dictation.phase.value).toBe('idle')
    expect(recognition.abort).toHaveBeenCalledOnce()
    expect(dictation.error.value).toContain('demorou')
  })

  it('cancela sessão e ignora eventos e streams tardios sem afetar nova sessão', async () => {
    const resolvers: ((stream: unknown) => void)[] = []
    getUserMedia.mockImplementation(() => new Promise(done => { resolvers.push(done) }))
    const dictation = setup(); dictation.start()
    const previous = Recognition.instances[0]!
    dictation.cancel(); dictation.start()
    previous.onresult!({ results: [Object.assign([{ transcript: 'Não inserir' }], { isFinal: true })] }); previous.onend!()
    const stop = vi.fn()
    resolvers[0]!({ getTracks: () => [{ stop }] })
    await flush()
    expect(stop).toHaveBeenCalledOnce()
    expect(dictation.onTranscript).not.toHaveBeenCalled()
    expect(dictation.phase.value).toBe('starting')
    expect(Recognition.instances[1]!.abort).not.toHaveBeenCalled()
  })

  it('libera stream que chega depois de finish enquanto permissão estava pendente', async () => {
    let resolve!: (stream: unknown) => void
    getUserMedia.mockImplementation(() => new Promise(done => { resolve = done }))
    const dictation = setup(); dictation.start(); dictation.finish()
    const stop = vi.fn()
    resolve({ getTracks: () => [{ stop }] })
    await flush()
    expect(stop).toHaveBeenCalledOnce()
    expect(dictation.phase.value).toBe('processing')
  })

  it.each([['not-allowed', 'Permita o microfone'], ['network', 'Confira a conexão'], ['audio-capture', 'acessar o microfone']])('mostra erro seguro %s sem emitir texto', (code, text) => {
    const dictation = setup(); dictation.start()
    const recognition = Recognition.instances[0]!
    recognition.onresult!({ results: [Object.assign([{ transcript: 'Parcial' }], { isFinal: true })] })
    recognition.onerror!({ error: code }); recognition.onend!()
    expect(dictation.error.value).toContain(text)
    expect(dictation.phase.value).toBe('idle')
    expect(dictation.onTranscript).not.toHaveBeenCalled()
  })

  it('mede cinco bandas reais e libera tracks/contexto/RAF ao terminar', async () => {
    const stop = vi.fn(); const close = vi.fn(async () => {}); const connect = vi.fn()
    const analyser = { fftSize: 0, frequencyBinCount: 512, getByteFrequencyData: vi.fn((data: Uint8Array) => {
      const edges = [1, 5, 10, 21, 42, 85]
      ;[0, 51, 102, 153, 255].forEach((value, index) => data.fill(value, edges[index], edges[index + 1]))
    }) }
    win.AudioContext = class { state = 'running'; sampleRate = 48000; createAnalyser = () => analyser; createMediaStreamSource = () => ({ connect }); resume = async () => {}; close = close }
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] })
    const dictation = setup(); dictation.start(); await flush()
    expect(connect).toHaveBeenCalledWith(analyser)
    const callback = vi.mocked(requestAnimationFrame).mock.calls[0]![0]
    callback(0)
    expect(dictation.bands.value).toEqual([0, 0.2, 0.4, 0.6, 1])
    analyser.getByteFrequencyData.mockImplementation(data => { data.fill(0) })
    vi.mocked(requestAnimationFrame).mock.calls[1]![0](40)
    expect(dictation.bands.value).toEqual([0, 0, 0, 0, 0])
    dictation.finish(); await flush()
    expect(stop).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce()
    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(dictation.bands.value).toEqual([0, 0, 0, 0, 0])
  })

  it('continua ouvindo após 60 segundos até concluir explicitamente', () => {
    const dictation = setup(); dictation.start()
    Recognition.instances[0]!.onstart!()
    vi.advanceTimersByTime(120_000)
    expect(dictation.phase.value).toBe('listening')
    expect(Recognition.instances[0]!.stop).not.toHaveBeenCalled()
    dictation.finish()
    expect(dictation.phase.value).toBe('processing')
    vi.advanceTimersByTime(10_000)
    expect(dictation.phase.value).toBe('idle')
  })

  it('encerra reconhecimento quando getUserMedia nega permissão, sem listener invisível', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('private details', 'NotAllowedError'))
    const dictation = setup(); dictation.start(); await flush()
    expect(dictation.error.value).toBe('Permita o microfone no navegador para ditar.')
    expect(dictation.phase.value).toBe('idle')
    const recognition = Recognition.instances[0]!
    expect(recognition.abort).toHaveBeenCalledOnce()
    recognition.onstart!()
    expect(recognition.abort).toHaveBeenCalledTimes(2)
    expect(dictation.phase.value).toBe('idle')
  })

  it('mantém ditado com aviso honesto quando não há AudioContext e libera stream', async () => {
    const stop = vi.fn()
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] })
    const dictation = setup(); dictation.start(); await flush()
    expect(dictation.phase.value).toBe('starting')
    expect(dictation.bands.value).toEqual([0, 0, 0, 0, 0])
    expect(dictation.error.value).toContain('nível do microfone não está disponível')
    expect(stop).toHaveBeenCalledOnce()
    dictation.finish()
    Recognition.instances[0]!.onend!()
    expect(dictation.error.value).toContain('Não detectei fala')
  })

  it('permanece seguro sem window/document no servidor', () => {
    vi.stubGlobal('window', undefined); vi.stubGlobal('document', undefined)
    const dictation = setup()
    expect(dictation.supported.value).toBe(false)
    dictation.start()
    expect(dictation.phase.value).toBe('idle')
  })

  it('pausa e fim nativo rearmam com backoff, preservando frases finais sem duplicar', () => {
    const dictation = setup(); dictation.start()
    const first = Recognition.instances[0]!
    first.onstart!()
    const finals = [Object.assign([{ transcript: 'Primeira frase' }], { isFinal: true })]
    first.onresult!({ results: finals }); first.onresult!({ results: finals })
    first.onspeechend!()
    expect(first.stop).not.toHaveBeenCalled()
    expect(dictation.phase.value).toBe('listening')
    first.onend!(); first.onend!()
    vi.advanceTimersByTime(249)
    expect(Recognition.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    const second = Recognition.instances[1]!
    expect(second.start).toHaveBeenCalledOnce()
    first.onresult!({ results: [Object.assign([{ transcript: 'tardio' }], { isFinal: true })] })
    second.onstart!()
    second.onresult!({ results: [Object.assign([{ transcript: 'Segunda frase' }], { isFinal: true }), Object.assign([{ transcript: 'parcial' }], { isFinal: false })] })
    expect(dictation.onTranscript).not.toHaveBeenCalled()
    dictation.finish()
    second.onend!(); second.onend!()
    expect(dictation.onTranscript).toHaveBeenCalledExactlyOnceWith('Primeira frase Segunda frase')
    expect(getUserMedia).toHaveBeenCalledOnce()
  })

  it('no-speech e ruído sem finais não encerram nem inserem texto', () => {
    const dictation = setup(); dictation.start()
    const first = Recognition.instances[0]!
    first.onstart!()
    first.onresult!({ results: [Object.assign([{ transcript: 'ruído parcial' }], { isFinal: false })] })
    first.onerror!({ error: 'no-speech' }); first.onend!()
    expect(dictation.error.value).toBe('')
    expect(dictation.phase.value).toBe('listening')
    vi.advanceTimersByTime(250)
    expect(Recognition.instances).toHaveLength(2)
    dictation.finish(); Recognition.instances[1]!.onend!()
    expect(dictation.onTranscript).not.toHaveBeenCalled()
    expect(dictation.error.value).toContain('Não detectei fala')
  })

  it('conclui buffer entre reinícios sem abrir nova captura e permite cancelar a conclusão', () => {
    const dictation = setup(); dictation.start()
    const first = Recognition.instances[0]!
    first.onresult!({ results: [Object.assign([{ transcript: 'Guardado' }], { isFinal: true })] })
    first.onend!()
    dictation.finish()
    expect(dictation.phase.value).toBe('processing')
    expect(dictation.onTranscript).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(dictation.onTranscript).toHaveBeenCalledExactlyOnceWith('Guardado')
    vi.advanceTimersByTime(1000)
    expect(Recognition.instances).toHaveLength(1)
    dictation.start()
    Recognition.instances[1]!.onend!()
    dictation.finish(); dictation.cancel()
    vi.advanceTimersByTime(1000)
    expect(dictation.onTranscript).toHaveBeenCalledOnce()
    expect(Recognition.instances).toHaveLength(2)
  })

  it('cancela timer de reinício sem abrir reconhecimento tardio', () => {
    const dictation = setup(); dictation.start()
    Recognition.instances[0]!.onend!()
    dictation.cancel()
    vi.advanceTimersByTime(1000)
    expect(Recognition.instances).toHaveLength(1)
    expect(dictation.phase.value).toBe('idle')
  })

  it('cancela ao ocultar página, pagehide e desmontagem, removendo listeners', () => {
    const dictation = setup(); dictation.start()
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'))
    expect(dictation.phase.value).toBe('idle')
    dictation.start(); win.dispatchEvent(new Event('pagehide'))
    expect(dictation.phase.value).toBe('idle')
    dictation.start(); hooks.unmounted.forEach(callback => callback())
    expect(dictation.phase.value).toBe('idle')
    expect(Recognition.instances.every(recognition => recognition.abort.mock.calls.length === 1)).toBe(true)
  })
})

describe('inserção do ditado no cursor', () => {
  it.each([
    ['Olá mundo', 'novo', 4, 4, 'Olá novo mundo', 9],
    ['Olá mundo', 'Ana', 4, 9, 'Olá Ana', 7],
    ['Texto', 'mais', 5, 5, 'Texto mais', 10],
    ['Olá, mundo', 'novo', 3, 3, 'Olá novo, mundo', 8],
    ['Olá  mundo', 'novo', 4, 4, 'Olá novo mundo', 8],
  ])('preserva texto e seleção em %s', (base, transcript, start, end, text, caret) => {
    expect(insertDictationText(base as string, transcript as string, start as number, end as number)).toEqual({ text, caret })
  })
  it('não trunca transcrição ou rascunho e ignora fala vazia', () => {
    expect(insertDictationText('x'.repeat(4000), 'fala').text).toHaveLength(4005)
    expect(insertDictationText('texto', '  ', 2, 4)).toEqual({ text: 'texto', caret: 2 })
  })
})
