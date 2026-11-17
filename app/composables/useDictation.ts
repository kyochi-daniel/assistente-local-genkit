import { onBeforeUnmount, onMounted, ref } from 'vue'

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean
  onstart: (() => void) | null; onend: (() => void) | null; onspeechend: (() => void) | null
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  start(): void; stop(): void; abort(): void
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition; webkitAudioContext?: typeof AudioContext }
type Session = { recognition: Recognition | null; text: string; stopRequested: boolean; stream?: MediaStream; context?: AudioContext; frame?: number; restart?: ReturnType<typeof setTimeout>; watchdog?: ReturnType<typeof setTimeout> }
const silence = () => [0, 0, 0, 0, 0]
const messages: Record<string, string> = {
  'not-allowed': 'Permita o microfone no navegador para ditar.', 'service-not-allowed': 'O ditado não está disponível neste navegador.',
  'audio-capture': 'Não foi possível acessar o microfone.', 'no-speech': 'Não detectei fala. Tente novamente.',
  network: 'Não foi possível transcrever agora. Confira a conexão.',
}

export function useDictation({ onTranscript }: { onTranscript: (text: string) => void }) {
  const supported = ref(false)
  const phase = ref<'idle' | 'starting' | 'listening' | 'processing'>('idle')
  const error = ref('')
  const bands = ref(silence())
  let session: Session | null = null
  let constructor: (new () => Recognition) | undefined

  async function closeContext(context?: AudioContext): Promise<void> {
    try { if (context && context.state !== 'closed') await context.close() } catch { /* O restante da captura já foi liberado. */ }
  }

  function stopMeter(current: Session): void {
    if (current.frame !== undefined) cancelAnimationFrame(current.frame)
    current.stream?.getTracks().forEach(track => track.stop())
    void closeContext(current.context)
    current.stream = undefined
    current.context = undefined
    bands.value = silence()
  }

  function release(current: Session): void {
    clearTimeout(current.restart)
    clearTimeout(current.watchdog)
    stopMeter(current)
    if (session === current) { session = null; phase.value = 'idle' }
  }

  function cancel(): void {
    const current = session
    if (!current) return
    release(current)
    try { current.recognition?.abort() } catch { /* A sessão pode já ter terminado no navegador. */ }
  }

  function processing(current: Session): void {
    if (session !== current || phase.value === 'processing') return
    phase.value = 'processing'
    clearTimeout(current.restart)
    stopMeter(current)
    current.watchdog = setTimeout(() => {
      if (session !== current) return
      cancel(); error.value = 'A transcrição demorou demais. Tente novamente.'
    }, 10_000)
  }

  function finish(): void {
    const current = session
    if (!current || phase.value === 'processing') return
    current.stopRequested = true
    processing(current)
    if (!current.recognition) { current.restart = setTimeout(() => complete(current), 0); return }
    try { current.recognition.stop() } catch { /* onstart repete a parada se a captura ainda estiver iniciando. */ }
  }

  async function startMeter(current: Session): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (session !== current || current.stopRequested || phase.value === 'processing') { stream.getTracks().forEach(track => track.stop()); return }
      current.stream = stream
      const Audio = window.AudioContext || (window as SpeechWindow).webkitAudioContext
      if (!Audio) { stopMeter(current); error.value = 'O nível do microfone não está disponível neste navegador.'; return }
      const context = new Audio()
      current.context = context
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      context.createMediaStreamSource(stream).connect(analyser)
      await context.resume()
      if (session !== current || current.stopRequested) return
      const data = new Uint8Array(analyser.frequencyBinCount)
      const edges = [80, 250, 500, 1000, 2000, 4000]
      let sampledAt = -Infinity
      const sample = (time: number) => {
        if (session !== current || current.stopRequested) return
        if (time - sampledAt >= 1000 / 30) {
          analyser.getByteFrequencyData(data)
          bands.value = Array.from({ length: 5 }, (_, index) => {
            const from = Math.floor(edges[index]! * analyser.fftSize / context.sampleRate)
            const to = Math.max(from + 1, Math.floor(edges[index + 1]! * analyser.fftSize / context.sampleRate))
            const bins = data.slice(from, to)
            return bins.reduce((total, value) => total + value, 0) / Math.max(1, bins.length) / 255
          })
          sampledAt = time
        }
        current.frame = requestAnimationFrame(sample)
      }
      current.frame = requestAnimationFrame(sample)
    } catch (cause) {
      if (session !== current || current.stopRequested) return
      const acquired = Boolean(current.stream)
      const denied = cause instanceof Error && ['NotAllowedError', 'SecurityError', 'PermissionDeniedError'].includes(cause.name)
      stopMeter(current)
      if (!acquired) { cancel(); error.value = denied ? messages['not-allowed']! : messages['audio-capture']! }
      else error.value = 'Não foi possível mostrar o nível do microfone.'
    }
  }

  function complete(current: Session): void {
    if (session !== current) return
    const transcript = current.text.trim()
    release(current)
    if (transcript) onTranscript(transcript)
    else error.value = 'Não detectei fala. Tente novamente.'
  }

  function bindRecognition(current: Session, recognition: Recognition): void {
    let finals: Record<number, string> = {}
    const active = () => session === current && current.recognition === recognition
    recognition.onstart = () => {
      if (!active()) { try { recognition.abort() } catch { /* A captura antiga já foi encerrada. */ }; return }
      if (current.stopRequested) { try { recognition.stop() } catch { /* O watchdog libera a sessão. */ }; return }
      phase.value = 'listening'
    }
    recognition.onresult = ({ results }) => {
      if (!active()) return
      const received = Object.fromEntries(Array.from(results).flatMap((result, index) => result.isFinal ? [[index, result[0]?.transcript ?? '']] : []))
      finals = { ...finals, ...received }
    }
    recognition.onspeechend = () => { /* Pausas não concluem o ditado. */ }
    recognition.onerror = ({ error: code }) => {
      if (!active() || code === 'no-speech') return
      cancel()
      error.value = Object.hasOwn(messages, code) ? messages[code]! : 'Não foi possível transcrever. Tente novamente.'
    }
    recognition.onend = () => {
      if (!active()) return
      current.text = [current.text, ...Object.values(finals)].filter(Boolean).join(' ')
      current.recognition = null
      if (current.stopRequested) complete(current)
      else current.restart = setTimeout(() => beginRecognition(current), 250)
    }
  }

  function beginRecognition(current: Session): void {
    if (session !== current || current.stopRequested || !constructor) return
    try {
      const recognition = new constructor()
      recognition.lang = 'pt-BR'; recognition.continuous = true; recognition.interimResults = true
      current.recognition = recognition
      bindRecognition(current, recognition)
      recognition.start()
    } catch { cancel(); error.value = 'Não foi possível iniciar o ditado. Tente novamente.' }
  }

  function start(): void {
    if (session) return
    error.value = ''
    if (!constructor) { error.value = 'O ditado não está disponível neste navegador.'; return }
    const current: Session = { recognition: null, text: '', stopRequested: false }
    session = current; phase.value = 'starting'
    beginRecognition(current)
    if (session === current) void startMeter(current)
  }

  const onVisibility = () => { if (document.hidden) cancel() }
  onMounted(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    constructor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition
    supported.value = Boolean(constructor)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', cancel)
  })
  onBeforeUnmount(() => {
    cancel()
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', cancel)
  })
  return { supported, phase, error, bands, start, finish, cancel }
}
