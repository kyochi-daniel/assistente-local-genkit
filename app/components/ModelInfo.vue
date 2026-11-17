<template>
  <TooltipRoot v-model:open="isOpen" :disable-closing-trigger="true" :disable-hoverable-content="false">
    <TooltipTrigger as-child><Button type="button" variant="ghost" size="icon" class="model-info-trigger" :aria-label="`Detalhes de ${name}`" @click="toggle"><Info aria-hidden="true" /></Button></TooltipTrigger>
    <TooltipPortal><TooltipContent v-if="isOpen" class="model-info" :collision-padding="12" :side-offset="8" position-strategy="fixed" @escape-key-down="dismiss" @pointer-down-outside="dismiss">
      <h3>{{ name }}</h3>
      <template v-if="model"><p v-if="model.description">{{ model.description }}</p><p v-if="modelType"><strong>{{ modelType }}</strong></p><p>{{ modalityDescription(model) }}</p><dl class="model-info-section"><div><dt>Contexto</dt><dd>{{ model.contextLength ? `${model.contextLength.toLocaleString('pt-BR')} tokens` : 'Não informado' }}</dd></div><div><dt>Ações do assistente</dt><dd>{{ model.compatible ? 'Compatível' : 'Sem suporte' }}</dd></div><div><dt>Entrada por 1M de tokens</dt><dd>{{ formatUsdCost(inputRate.usd) }}<span v-if="inputRate.brl !== null"> · {{ formatBrlCost(inputRate.brl) }}</span></dd></div><div><dt>Saída por 1M de tokens</dt><dd>{{ formatUsdCost(outputRate.usd) }}<span v-if="outputRate.brl !== null"> · {{ formatBrlCost(outputRate.brl) }}</span></dd></div></dl>
        <p v-if="!simulationValid">Informe volumes inteiros válidos para simular.</p><p v-else-if="inputTokens === 0 && outputTokens === 0">Sem tokens simulados.</p><p v-else-if="!hasTextOutput">Ver tarifas: a estimativa textual não cobre cobrança por outras modalidades.</p><p v-else>Para {{ inputTokens.toLocaleString('pt-BR') }} tokens de entrada e {{ outputTokens.toLocaleString('pt-BR') }} de saída: {{ formatUsdCost(estimate.usd) }}<span v-if="estimate.brl !== null"> · {{ formatBrlCost(estimate.brl) }}</span><span v-if="model.hasAdditionalCosts">, somente a base textual</span>.</p>
        <p v-if="model.hasAdditionalCosts">Cache e outras modalidades podem ter tarifas próprias, não calculadas aqui.</p><p v-if="!hasTextOutput">As modalidades informadas pelo provedor podem ter tarifas próprias.</p>
      </template>
      <p v-else>Metadados indisponíveis. Preço e compatibilidade não confirmados.</p>
      <p v-if="usdBrl === null" class="small muted">Cotação indisponível; valores mantidos em USD.</p><p class="small muted">Estimativa de volumes agregados, sem IOF, spread ou tarifas extras. O chat pode executar várias etapas.</p>
    </TooltipContent></TooltipPortal>
  </TooltipRoot>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { Info } from '@lucide/vue'
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'
import type { CatalogModel } from '#shared/models'
import { estimateTokenCost, formatBrlCost, formatUsdCost, modalityDescription } from '~/utils/model-cost'
import { Button } from '~/components/ui/button'

const props = defineProps({
  model: { type: Object as PropType<CatalogModel>, default: undefined },
  modelId: { type: String, required: true },
  open: { type: Boolean, default: false },
  inputTokens: { type: Number, required: true },
  outputTokens: { type: Number, required: true },
  simulationValid: { type: Boolean, required: true },
  usdBrl: { type: Number as PropType<number | null>, default: null },
})
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const pinned = ref(false)
const isOpen = computed({ get: () => props.open, set: value => { if (value || !pinned.value) emit('update:open', value) } })
const name = computed(() => props.model?.name || props.modelId)
const modelType = computed(() => {
  if (!props.model) return ''
  const modalities = new Set([...props.model.inputModalities, ...props.model.outputModalities])
  if (modalities.size >= 2) return 'Multimodal'
  return props.model.inputModalities.length && props.model.outputModalities.length && modalities.size === 1 && modalities.has('text') ? 'Somente texto' : ''
})
const hasTextOutput = computed(() => props.model?.outputModalities.includes('text') === true)
const inputRate = computed(() => estimateTokenCost(props.model?.promptPrice ?? null, null, 1_000_000, 0, props.usdBrl))
const outputRate = computed(() => estimateTokenCost(null, props.model?.completionPrice ?? null, 0, 1_000_000, props.usdBrl))
const estimate = computed(() => estimateTokenCost(props.model?.promptPrice ?? null, props.model?.completionPrice ?? null, props.inputTokens, props.outputTokens, props.usdBrl))
// O toque pode rolar a página ao dispensar o teclado; preserve a abertura explícita.
const toggle = () => {
  // O foco do mesmo gesto pode abrir antes do clique; alterne apenas a fixação explícita.
  pinned.value = !pinned.value
  emit('update:open', pinned.value)
}

const dismiss = (event: Event) => {
  if (event.defaultPrevented) return
  pinned.value = false
  emit('update:open', false)
}

watch(() => props.open, value => { if (!value) pinned.value = false })
</script>
