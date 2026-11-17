<template>
  <div class="dictation-control">
    <div v-if="active" class="dictation-card">
      <div class="dictation-status" role="status"><LoaderCircle v-if="phase === 'starting' || phase === 'processing'" class="motion-safe:animate-spin" aria-hidden="true" /><span>{{ statusText }}</span></div>
      <div v-if="active" class="dictation-meter" aria-hidden="true"><span v-for="(level, index) in bands" :key="index" :style="{ '--level': reducedMotion ? 0 : level }" /></div>
      <Button v-if="active" type="button" variant="ghost" size="icon" id="dictation-cancel" aria-label="Cancelar ditado" @click="cancelDictation()"><X aria-hidden="true" /></Button>
      <p v-if="error" class="dictation-notice" role="alert">{{ error }}</p><p v-else-if="unsupported" class="dictation-notice">Seu navegador não oferece ditado. Você pode digitar normalmente.</p>
      <p v-if="active || textReady" class="dictation-notice">O reconhecimento de voz pode usar o serviço do navegador.</p>
    </div>
    <p v-if="!active" class="dictation-feedback" :role="error ? 'alert' : 'status'">{{ error || (unsupported ? 'Seu navegador não oferece ditado. Você pode digitar normalmente.' : textReady ? 'Texto pronto para revisar.' : 'Use o microfone para ditar. Pode usar o serviço do navegador.') }}</p>
    <span id="dictation-help" class="visually-hidden">Clique para iniciar e novamente para transcrever. Pode usar o serviço do navegador.</span>
    <Button id="dictation-microphone" type="button" variant="ghost" size="icon" class="dictation-button" title="Clique para iniciar e novamente para transcrever. Pode usar o serviço do navegador." aria-describedby="dictation-help" :disabled="disabled || !supported || phase === 'processing'" :aria-label="phase === 'processing' ? 'Transcrevendo…' : active ? 'Concluir ditado' : 'Ditar mensagem'" :aria-busy="phase === 'processing'" :aria-pressed="active" :aria-disabled="phase === 'processing'" @click="clickMicrophone"><Mic v-if="!active" aria-hidden="true" /><LoaderCircle v-else-if="phase === 'processing'" class="motion-safe:animate-spin" aria-hidden="true" /><Square v-else aria-hidden="true" /></Button>
  </div>
</template>

<script setup lang="ts">
import { LoaderCircle, Mic, Square, X } from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'
import { Button } from '~/components/ui/button'

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const props = defineProps({ disabled: { type: Boolean, default: false }, visible: { type: Boolean, default: true } })
const emit = defineEmits<{ activity: [active: boolean]; transcript: [text: string] }>()
const { supported, phase, error, bands, start, finish, cancel } = useDictation({ onTranscript: text => { textReady.value = true; emit('transcript', text) } })
const textReady = ref(false)
const active = computed(() => phase.value !== 'idle')
const unsupported = computed(() => !supported.value && !props.disabled)
const statusText = computed(() => ({ starting: 'Ativando microfone…', listening: 'Ouvindo…', processing: 'Transcrevendo…', idle: textReady.value ? 'Texto pronto para revisar.' : 'Ditado de mensagem' }[phase.value]))

const begin = () => {
  if (props.disabled || !props.visible || document.hidden || !supported.value || active.value) return
  textReady.value = false
  start()
}

const clickMicrophone = () => {
  if (phase.value === 'processing') return
  if (active.value) finish()
  else begin()
}

const cancelDictation = async (restoreFocus = true) => {
  textReady.value = false
  cancel()
  if (!restoreFocus || !props.visible || props.disabled) return
  await nextTick()
  document.getElementById('dictation-microphone')?.focus({ preventScroll: true })
}

watch(phase, async value => {
  emit('activity', value !== 'idle')
  if (value !== 'processing') return
  await nextTick()
  if (phase.value === 'processing' && props.visible) document.getElementById('dictation-cancel')?.focus({ preventScroll: true })
}, { flush: 'sync' })
watch(() => [props.visible, props.disabled], () => { if (!props.visible || props.disabled) void cancelDictation(false) })
defineExpose({ cancel: () => cancelDictation() })
</script>
