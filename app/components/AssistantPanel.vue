<template>
  <section class="assistant" aria-labelledby="assistant-title" @keydown.esc.capture="handleEscape">
    <header class="assistant-header"><div class="assistant-identity"><Sparkles aria-hidden="true" /><h2 id="assistant-title"><strong>Assistente</strong></h2><span class="assistant-brand">Nexo</span></div><div class="assistant-controls"><Button type="button" variant="ghost" size="icon" aria-label="Minimizar assistente" :disabled="!hydrated" aria-controls="assistant-region" :aria-expanded="true" @click="emit('minimize')"><X aria-hidden="true" /></Button></div></header>
    <div v-if="navigation" class="navigation-card" role="status"><LoaderCircle aria-hidden="true" /><span>{{ navigation.label }}</span></div>
    <div ref="conversation" class="conversation" role="log" aria-label="Histórico da conversa" aria-live="polite" aria-relevant="additions text">
      <div v-if="!state.messages.length" class="chat-welcome">
        <AssistantOrb :active="orbActive" />
        <h2 class="chat-question">O que você quer<br /> organizar hoje?</h2>
        <div v-if="topicsOpen" id="assistant-topics" class="suggestions"><button v-for="suggestion in visibleSuggestions" :key="suggestion.text" type="button" :disabled="busy || dictating || !hydrated" @click="sendSuggestion(suggestion.text)">{{ suggestion.title }}</button><button type="button" class="suggestions-more" :disabled="busy || dictating || !hydrated" :aria-expanded="suggestionsExpanded" @click="suggestionsExpanded = !suggestionsExpanded">{{ suggestionsExpanded ? 'Mostrar menos' : 'Mostrar mais' }}</button></div>
      </div>
      <article v-for="message in state.messages" :key="message.id" class="message" :class="message.role"><span class="message-avatar"><UserRound v-if="message.role === 'user'" aria-hidden="true" /><Sparkles v-else aria-hidden="true" /></span><div><span class="message-author">{{ message.role === 'user' ? 'Você' : 'Assistente' }}</span><MessageContent :text="message.text" /></div></article>
      <article v-if="assistantText" class="message assistant"><span class="message-avatar"><Sparkles aria-hidden="true" /></span><div><span class="message-author">Assistente</span><MessageContent :text="assistantText" /></div></article>
      <p v-if="busy" class="assistant-progress" role="status"><LoaderCircle aria-hidden="true" />{{ statusText }}</p>
      <ReviewCard />
      <MutationCard />
      <BatchCard />
      <section v-if="topicsOpen && state.messages.length" id="assistant-topics" class="assistant-topics" aria-label="Tópicos"><div class="suggestions"><button v-for="suggestion in visibleSuggestions" :key="suggestion.text" type="button" :disabled="busy || dictating || !hydrated" @click="sendSuggestion(suggestion.text)">{{ suggestion.title }}</button><button type="button" class="suggestions-more" :disabled="busy || dictating || !hydrated" :aria-expanded="suggestionsExpanded" @click="suggestionsExpanded = !suggestionsExpanded">{{ suggestionsExpanded ? 'Mostrar menos' : 'Mostrar mais' }}</button></div></section>
    </div>
    <div v-if="batchDraft" class="draft-indicator"><Files aria-hidden="true" /><span>Lote de {{ batchDraft.clients.length + batchDraft.contracts.length }} cadastros em andamento</span><a href="#batch-card" @click.prevent="focusBatch">Revisar</a></div>
    <div v-else-if="state.draft" class="draft-indicator"><FilePenLine aria-hidden="true" /><span>{{ state.draft.recordId ? 'Edição' : 'Rascunho' }} de {{ state.draft.entity === 'client' ? 'cliente' : 'contrato' }} em andamento</span><NuxtLink :to="draftPath">Abrir</NuxtLink></div>
    <p v-if="error" class="chat-error" role="alert">{{ error }} Você pode tentar novamente ou continuar pelo formulário.</p>
    <p v-else-if="status === 'cancelled'" class="chat-notice" role="status">Resposta interrompida. As alterações já exibidas foram mantidas.</p>
    <form class="composer" @submit.prevent="submit">
      <label for="chat-message" class="visually-hidden">Mensagem para o assistente</label>
      <textarea id="chat-message" ref="textarea" v-model="input.text" rows="2" placeholder="Pergunte ou peça uma tarefa…" spellcheck="false" :disabled="busy || dictating || !hydrated" :aria-invalid="overLimit" :aria-describedby="overLimit ? 'composer-help composer-limit' : 'composer-help'" @keydown.enter.exact.prevent="submit" />
      <DictationControl v-show="!busy" ref="dictationControl" :disabled="busy || !hydrated" :visible="visible" @activity="dictationActivity" @transcript="insertTranscript" />
      <p v-if="overLimit" id="composer-limit" class="chat-error" role="alert">A mensagem tem {{ input.text.length }} caracteres. O limite é 4.000. Revise o texto antes de enviar.</p>
      <div class="composer-bottom"><Button type="button" class="assistant-topics-toggle" variant="ghost" :disabled="busy || dictating || !hydrated" :aria-expanded="topicsOpen" aria-controls="assistant-topics" @click="toggleTopics"><Sparkles aria-hidden="true" />Tópicos</Button><div class="composer-actions"><Button v-if="busy" type="button" variant="outline" size="sm" @click="stop"><Square aria-hidden="true" />Interromper</Button><Button v-else type="submit" size="icon" :disabled="!input.text.trim() || !hydrated || dictating || overLimit" aria-label="Enviar mensagem"><Send aria-hidden="true" /></Button></div></div>
    </form>
    <details class="composer-details"><summary><span>{{ modelLabel || 'Ajuda e limites' }}<template v-if="fallbackUsed"> · modelo alternativo configurado</template><template v-if="historyTrimmed"> · histórico resumido</template></span><span class="composer-count">{{ input.text.length }}/4000</span></summary><p id="composer-help">Enter para enviar · Shift + Enter para nova linha. Até 4.000 caracteres por mensagem.</p><footer v-if="state.messages.length || historyTrimmed" class="assistant-footer"><p v-if="historyTrimmed">As mensagens mais antigas foram removidas. Mantemos as 40 mais recentes.</p><p v-else>Até 40 mensagens são mantidas. As mais antigas saem do histórico.</p></footer></details>
  </section>
</template>

<script setup lang="ts">
import { FilePenLine, Files, LoaderCircle, Send, Sparkles, Square, UserRound, X } from '@lucide/vue'
import { useDocumentVisibility } from '@vueuse/core'
import { Button } from '~/components/ui/button'
import { insertDictationText } from '~/utils/dictation'

const pageVisibility = useDocumentVisibility()
const { state, hydrated, historyTrimmed, batchDraft } = useWorkspace()
const { send, stop, busy, status, text: assistantText, error, modelLabel, fallbackUsed, navigation } = useAssistant()
const props = defineProps({ visible: { type: Boolean, default: true } })
const emit = defineEmits(['minimize'])
const input = reactive({ text: '' })
const topicsOpen = ref(true)
const suggestionsExpanded = ref(false)
const dictationSnapshot = reactive({ text: '', start: 0, end: 0 })
const dictating = ref(false)
const textarea = ref<HTMLTextAreaElement | null>(null)
const dictationControl = ref<{ cancel: () => void } | null>(null)
const overLimit = computed(() => input.text.length > 4000)
const conversation = ref<HTMLElement | null>(null)
const suggestions = [
  { title: 'Cadastrar um cliente', text: 'Quero cadastrar um cliente. Abra o formulário e me pergunte os dados necessários.' },
  { title: 'Criar um contrato', text: 'Quero criar um contrato. Abra o formulário e me ajude com os dados necessários.' },
  { title: 'Ver meus cadastros', text: 'Abra a lista de clientes.' },
  { title: 'Ver contratos', text: 'Abra a lista de contratos.' },
  { title: 'Ver lixeira', text: 'Abra a lixeira.' },
]
const visibleSuggestions = computed(() => suggestionsExpanded.value ? suggestions : suggestions.slice(0, 3))
const orbActive = computed(() => props.visible && pageVisibility.value === 'visible')
const draftPath = computed(() => {
  const draft = state.value.draft
  const base = draft?.entity === 'client' ? '/clientes' : '/contratos'
  return draft?.recordId ? `${base}/${draft.recordId}/editar` : `${base}/novo`
})
const statusText = computed(() => ({ thinking: 'Pensando no seu pedido…', executing: 'Atualizando seu espaço…', awaiting_confirmation: 'Aguardando sua confirmação.', awaiting_input: 'Aguardando mais informações.' }[status.value as string] || 'Preparando a resposta…'))

const toggleTopics = async () => {
  if (busy.value || dictating.value) return
  topicsOpen.value = !topicsOpen.value
  if (!topicsOpen.value) return
  await nextTick()
  document.getElementById('assistant-topics')?.scrollIntoView({ block: 'nearest' })
}

const focusBatch = () => {
  document.getElementById('batch-card')?.focus({ preventScroll: true })
  document.getElementById('batch-card')?.scrollIntoView({ block: 'nearest' })
}

const dictationActivity = (active: boolean) => {
  if (active && !dictating.value) {
    dictationSnapshot.text = input.text
    dictationSnapshot.start = textarea.value?.selectionStart ?? input.text.length
    dictationSnapshot.end = textarea.value?.selectionEnd ?? input.text.length
  }
  dictating.value = active
}

const insertTranscript = async (text: string) => {
  if (!props.visible || busy.value) return
  const result = insertDictationText(dictationSnapshot.text, text, dictationSnapshot.start, dictationSnapshot.end)
  input.text = result.text
  await nextTick()
  textarea.value?.focus({ preventScroll: true })
  textarea.value?.setSelectionRange(result.caret, result.caret)
}

const handleEscape = (event: KeyboardEvent) => {
  if (!dictating.value) return
  event.preventDefault()
  event.stopPropagation()
  dictationControl.value?.cancel()
}

const submit = async () => {
  const text = input.text.trim()
  if (!text || busy.value || dictating.value || overLimit.value || !hydrated.value) return
  topicsOpen.value = false
  input.text = ''
  await send(text)
}

const sendSuggestion = async (text: string) => {
  if (busy.value || dictating.value || !hydrated.value) return
  topicsOpen.value = false
  await send(text)
}

watch(hydrated, ready => { if (ready && state.value.messages.length) topicsOpen.value = false }, { immediate: true })

watch(() => [state.value.messages.length, state.value.messages.at(-1)?.text, assistantText.value, status.value], async () => {
  if (!state.value.messages.length && !assistantText.value) return
  await nextTick()
  conversation.value?.scrollTo({ top: conversation.value.scrollHeight, behavior: 'instant' })
})
</script>
