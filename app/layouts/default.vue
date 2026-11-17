<template>
  <div class="workspace-shell" :data-ready="hydrated" @keydown.esc="closeChat">
    <a href="#main-content" class="skip-link">Ir para o conteúdo</a>
    <aside class="sidebar" aria-label="Menu principal">
      <NuxtLink to="/assistente" class="brand"><span class="brand-symbol">n</span>Nexo<span class="brand-dot" /></NuxtLink>
      <p class="navigation-label">ESPAÇO DE TRABALHO</p>
      <nav class="navigation">
        <NuxtLink to="/assistente"><Sparkles aria-hidden="true" />Assistente<ArrowUpRight aria-hidden="true" class="navigation-arrow" /></NuxtLink>
        <NuxtLink to="/clientes"><UsersRound aria-hidden="true" />Clientes<span class="navigation-count">{{ activeClients.length }}</span></NuxtLink>
        <NuxtLink to="/contratos"><Files aria-hidden="true" />Contratos<span class="navigation-count">{{ activeContracts.length }}</span></NuxtLink>
        <NuxtLink to="/lixeira"><Trash2 aria-hidden="true" />Lixeira<span class="navigation-count">{{ deletedClients.length + deletedContracts.length }}</span></NuxtLink>
        <NuxtLink to="/configuracoes"><Settings2 aria-hidden="true" />Configurações</NuxtLink>
      </nav>
      <div class="sidebar-bottom">
        <div class="local-note"><span class="status-dot" /><span>Ambiente local<small>Dados salvos neste navegador</small></span><LaptopMinimal aria-hidden="true" /></div>
        <div class="profile"><span class="avatar">EU</span><span>Meu espaço<small>Sessão local</small></span><Button variant="ghost" size="icon" aria-label="Sair da conta" :disabled="!hydrated || session.busy.value" @click="session.logout"><LogOut aria-hidden="true" /></Button></div>
      </div>
    </aside>
    <div class="workspace-body">
      <header class="workspace-topbar"><span>Nexo <ChevronRight aria-hidden="true" /> {{ pageName }}</span><div><span class="local-indicator"><span class="status-dot" />Local</span></div></header>
      <p v-if="error" class="workspace-warning" role="alert">{{ error }}</p>
      <p v-if="session.error.value" class="workspace-warning" role="alert">{{ session.error.value }}</p>
      <div class="workspace-content">
        <main id="main-content" ref="main" class="page-content" tabindex="-1">
          <slot />
          <Transition name="page-transition"><div v-if="navigation" class="page-navigation" aria-hidden="true"><p>{{ navigation.label }}</p><div class="page-skeleton"><span /><span /><span /></div></div></Transition>
        </main>
      </div>
      <footer class="workspace-footer"><span>Feito para simplificar o seu dia.</span><span>Use apenas dados fictícios.</span></footer>
    </div>
    <Transition name="chat-transition"><aside v-show="chatOpen" id="assistant-region" class="assistant-popover" tabindex="-1" aria-label="Conversa com o assistente"><AssistantPanel :visible="chatOpen" @minimize="closeChat" /></aside></Transition>
    <Transition name="chat-transition"><Button v-show="!chatOpen" id="chat-launcher" :disabled="!hydrated" class="chat-launcher" :class="{ busy }" size="icon" :aria-expanded="chatOpen" aria-controls="assistant-region" :aria-label="busy ? 'Abrir assistente. Resposta em andamento.' : 'Abrir assistente'" @click="openChat"><LoaderCircle v-if="busy" aria-hidden="true" /><MessageSquare v-else aria-hidden="true" /></Button></Transition>
  </div>
</template>

<script setup lang="ts">
import { ArrowUpRight, ChevronRight, Files, LaptopMinimal, LoaderCircle, LogOut, MessageSquare, Settings2, Sparkles, Trash2, UsersRound } from '@lucide/vue'
import { Button } from '~/components/ui/button'

const route = useRoute()
const session = useSession()
const modelSettings = useModelSettings()
const { activeClients, activeContracts, deletedClients, deletedContracts, hydrated, error, review, mutationReview, batchDraft, batchReview, init, clearReview } = useWorkspace()
const { stop, busy, navigation } = useAssistant()
const chatOpen = ref(true)
const main = ref<HTMLElement | null>(null)
const pageName = computed(() => route.path.startsWith('/clientes') ? 'Clientes' : route.path.startsWith('/contratos') ? 'Contratos' : route.path === '/lixeira' ? 'Lixeira' : route.path === '/configuracoes' ? 'Configurações' : 'Assistente')

const openChat = async () => {
  chatOpen.value = true
  await nextTick()
  document.getElementById(busy.value ? 'assistant-region' : 'chat-message')?.focus({ preventScroll: true })
}

const closeChat = async () => {
  if (!chatOpen.value) return
  chatOpen.value = false
  await nextTick()
  document.getElementById('chat-launcher')?.focus({ preventScroll: true })
}

watch(() => route.path, async () => {
  await nextTick()
  main.value?.focus({ preventScroll: true })
})

watch([review, mutationReview, batchDraft, batchReview], ([pending, mutation, batch, batchConfirmation]) => { if (pending || mutation || batch || batchConfirmation) chatOpen.value = true })

onMounted(() => { init(); modelSettings.init() })
onBeforeUnmount(() => {
  stop()
  clearReview()
})
</script>
