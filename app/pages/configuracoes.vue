<template>
  <TooltipProvider :delay-duration="200"><section class="model-settings">
    <header class="page-header"><div><h1>Configurações</h1><p>Modelos para os próximos turnos.</p></div></header>
    <section class="list-card" aria-labelledby="selection-title">
      <header class="list-header"><div><h2 id="selection-title">Modelos do assistente</h2><Badge v-if="hasChanges" variant="secondary">Alterações não aplicadas</Badge><span v-else>{{ selection ? 'Escolha local' : 'Padrão do ambiente' }}</span></div><div class="model-settings-actions"><Button type="button" :disabled="!canApply || busy" @click="applySelection">Aplicar alterações</Button><Button type="button" variant="outline" :disabled="!ready || busy || !catalog" @click="resetSelection">Usar padrão do ambiente</Button></div></header>
      <div class="model-selection"><article v-for="item in selections" :key="item.key"><div class="model-heading"><p>{{ item.label }}</p><strong>{{ item.model?.name || (item.id ? 'Modelo selecionado' : item.key === 'fallback' ? 'Desativado' : 'Aguardando seleção') }}</strong><span v-if="item.id" class="model-cost" :class="item.model?.cost || 'unknown'">{{ costLabel(item.model?.cost) }}</span><Button v-if="item.key === 'fallback' && item.id" type="button" variant="ghost" size="icon" aria-label="Desativar alternativo" title="Desativar alternativo" :disabled="!ready" @click="disableFallback"><span aria-hidden="true">×</span></Button></div><code v-if="item.id">{{ item.id }}</code><div v-if="item.id" class="model-pricing"><span>{{ item.model ? estimateLabel(item.model) : 'Preço não confirmado' }}</span><ModelInfo :model="item.model" :model-id="item.id" :open="activeInfo === `selection-${item.key}`" :input-tokens="inputTokens" :output-tokens="outputTokens" :simulation-valid="simulationValid" :usd-brl="usdBrl" @update:open="setInfo(`selection-${item.key}`, $event)" /></div><p v-if="item.model && !item.model.compatible" class="field-error">Sem suporte às ações do assistente.</p></article></div>
      <p v-if="hasChanges && applied" class="small muted">Em uso: {{ applied.primary }} · Alternativo: {{ applied.fallback || 'desativado' }}.</p>
      <p v-if="hasPaidSelection" class="small muted">Modelos pagos podem consumir créditos OpenRouter.</p>
      <p v-if="busy" class="small muted">Aguarde o turno atual para aplicar alterações.</p><p v-if="notice" role="status">{{ notice }}</p><p v-if="settingsError" class="field-error" role="alert">{{ settingsError }}</p>
    </section>
    <section class="list-card" aria-labelledby="catalog-title">
      <header class="list-header"><h2 id="catalog-title">Catálogo OpenRouter</h2><div class="model-targets" role="group" aria-label="Escolher para"><span>Escolher para</span><Button type="button" variant="outline" :aria-pressed="state.target === 'primary'" :disabled="!ready" @click="state.target = 'primary'">Principal</Button><Button type="button" variant="outline" :aria-pressed="state.target === 'fallback'" :disabled="!ready" @click="state.target = 'fallback'">Alternativo</Button></div><span v-if="catalog">{{ catalog.pageSize }} modelos por página</span></header>
      <div class="model-toolbar"><div class="model-search campo"><Label for="model-query">Buscar modelos</Label><Input id="model-query" v-model="state.query" placeholder="Nome, provedor ou :free" maxlength="200" spellcheck="false" :disabled="!ready" /></div><div class="model-compatibility campo"><Label for="model-compatibility">Compatibilidade</Label><select id="model-compatibility" v-model="state.compatibility" :disabled="!ready"><option value="compatible">Compatíveis</option><option value="all">Todos</option><option value="incompatible">Incompatíveis</option></select></div><div class="model-filters campo"><Label for="model-pricing">Preço</Label><select id="model-pricing" v-model="state.pricing" :disabled="!ready"><option v-for="filter in filters" :key="filter.value" :value="filter.value">{{ filter.label }}</option></select></div></div>
      <div class="model-simulation"><span>Simular volumes agregados</span><div class="campo"><Label for="simulation-input">Entrada (tokens)</Label><Input id="simulation-input" v-model="simulation.input" :disabled="!ready" type="tel" inputmode="numeric" maxlength="8" spellcheck="false" :aria-invalid="!Number.isFinite(inputTokens)" aria-describedby="simulation-help" /></div><div class="campo"><Label for="simulation-output">Saída (tokens)</Label><Input id="simulation-output" v-model="simulation.output" :disabled="!ready" type="tel" inputmode="numeric" maxlength="8" spellcheck="false" :aria-invalid="!Number.isFinite(outputTokens)" aria-describedby="simulation-help" /></div><p id="simulation-help" :class="simulationValid ? 'small muted' : 'field-error'" :role="simulationValid ? undefined : 'alert'">{{ simulationValid ? 'Sem nova inferência. O chat pode somar várias etapas.' : 'Use inteiros de 0 a 10.000.000 em ambos os campos.' }}</p></div>
      <p class="model-exchange" role="status">{{ exchangeLabel }}</p>
      <p v-if="catalog?.stale" class="form-notice" role="status">Catálogo desatualizado. Confira os preços no provedor antes do uso.</p>
      <p v-if="catalogError" class="field-error" role="alert">{{ catalogError }} <Button type="button" variant="ghost" size="sm" :disabled="loading" @click="loadCatalog">Tentar novamente</Button></p>
      <p class="small muted" role="status" aria-live="polite">{{ loading || !ready ? 'Buscando modelos…' : catalog ? `${catalog.total} modelos encontrados.` : 'Catálogo indisponível.' }}</p>
      <div class="model-results" :aria-busy="loading || !ready">
        <article v-for="model in catalog?.items || []" :key="model.id" class="model-row"><div class="model-identity"><div class="model-heading"><span class="model-cost" :class="model.cost">{{ costLabel(model.cost) }}</span><strong>{{ model.name }}</strong></div><code>{{ model.id }}</code><p v-if="!model.compatible" class="small muted">Sem suporte às ações do assistente.</p></div><div class="model-pricing"><span>{{ estimateLabel(model) }}</span><ModelInfo :model="model" :model-id="model.id" :open="activeInfo === `catalog-${model.id}`" :input-tokens="inputTokens" :output-tokens="outputTokens" :simulation-valid="simulationValid" :usd-brl="usdBrl" @update:open="setInfo(`catalog-${model.id}`, $event)" /></div><Button type="button" variant="outline" size="sm" :disabled="loading || !ready || !model.compatible" :aria-pressed="state[state.target] === model.id" :aria-label="`Usar ${model.name} como ${state.target === 'primary' ? 'principal' : 'alternativo'}`" @click="choose(model.id)">Selecionar</Button></article>
        <p v-if="ready && !loading && catalog && !catalog.items.length" class="loading-state">Nenhum modelo encontrado. Ajuste os filtros ou informe um ID exato.</p>
      </div>
      <div class="model-pagination"><span>{{ interval }}</span><div><Button type="button" variant="ghost" size="sm" :disabled="loading || state.page <= 1" @click="state.page -= 1">Anterior</Button><Button type="button" variant="ghost" size="sm" :disabled="loading || !catalog || state.page * catalog.pageSize >= catalog.total" @click="state.page += 1">Próxima</Button></div></div>
      <p v-if="catalog" class="small muted">Atualizado em {{ new Date(catalog.updatedAt).toLocaleString('pt-BR') }}.</p>
      <details class="model-advanced"><summary>Informar ID manual</summary><div class="model-manual"><div class="campo"><Label for="model-id">ID do modelo</Label><Input id="model-id" v-model="state.manualId" placeholder="provedor/modelo[:tag]" maxlength="200" spellcheck="false" :disabled="!ready" :aria-invalid="!!state.manualId && !manualId.success" aria-describedby="model-id-help" /><p id="model-id-help" class="small muted">Use um ID exato ausente dos resultados. Preço e compatibilidade podem não estar confirmados.</p><p v-if="state.manualId && !manualId.success" class="field-error">Informe o ID no formato provedor/modelo[:tag].</p><p v-else-if="manualIsIncompatible" class="field-error">Este modelo não oferece suporte às ações do assistente.</p><p v-else-if="manualIsListed" class="small muted">Este modelo está nos resultados desta página. Use Selecionar.</p></div><Button type="button" variant="outline" :disabled="!ready || loading || !manualId.success || manualIsIncompatible || manualIsListed" @click="chooseManual">Usar ID digitado</Button></div></details>
    </section>
  </section></TooltipProvider>
</template>

<script setup lang="ts">
import { TooltipProvider } from 'reka-ui'
import { MAX_SIMULATION_TOKENS, estimateTokenCost, formatBrlCost, formatUsdCost } from '~/utils/model-cost'
import { modelIdSchema, modelSelectionSchema, type CatalogModel, type ModelCatalogResponse, type ExchangeRate } from '#shared/models'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

const { selection, error: settingsError, init, apply, reset } = useModelSettings()
const { busy } = useAssistant()
const state = reactive({ query: '', pricing: 'all', compatibility: 'compatible', page: 1, target: 'primary' as 'primary' | 'fallback', primary: '', fallback: null as string | null, manualId: '' })
const simulation = reactive({ input: '1000', output: '1000' })
const activeInfo = ref<string | null>(null)
const exchange = ref<ExchangeRate | null>(null)
const exchangeFailed = ref(false)
const exchangeLoading = ref(false)
let exchangeController: AbortController | null = null
let exchangeLastAttempt = 0
let exchangeTimer: ReturnType<typeof setInterval> | undefined
const models = reactive<Record<string, CatalogModel>>({})
const catalog = ref<ModelCatalogResponse | null>(null)
const ready = ref(false)
const loading = ref(false)
const catalogError = ref('')
const notice = ref('')
let controller: AbortController | null = null
let requestId = 0
let timer: ReturnType<typeof setTimeout> | undefined
let draftInitialized = false
const lookedUp = new Set<string>()
const lookups = new Set<AbortController>()
const filters = [{ value: 'all', label: 'Todos' }, { value: 'free', label: 'Gratuitos' }, { value: 'paid', label: 'Pagos' }]
const applied = computed(() => selection.value ?? catalog.value?.defaults ?? null)
const candidate = computed(() => modelSelectionSchema.safeParse({ primary: state.primary, fallback: state.fallback }))
const hasChanges = computed(() => !!applied.value && (state.primary !== applied.value.primary || state.fallback !== applied.value.fallback))
const selections = computed(() => [
  { key: 'primary', label: 'Principal', id: state.primary, model: models[state.primary] },
  { key: 'fallback', label: 'Alternativo opcional', id: state.fallback, model: state.fallback ? models[state.fallback] : undefined },
])
const hasPaidSelection = computed(() => selections.value.some(item => item.model?.cost === 'paid'))
const canApply = computed(() => ready.value && candidate.value.success && selections.value.every(item => !item.model || item.model.compatible))
const manualId = computed(() => modelIdSchema.safeParse(state.manualId))
const manualIsIncompatible = computed(() => manualId.value.success && models[manualId.value.data]?.compatible === false)
const manualIsListed = computed(() => manualId.value.success && catalog.value?.items.some(model => model.id === manualId.value.data))
const interval = computed(() => {
  const data = catalog.value
  if (!data || !data.total) return '0 modelos'
  return `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} de ${data.total}`
})

definePageMeta({ middleware: 'auth' })

const costLabel = (cost?: CatalogModel['cost']) => ({ free: 'Gratuito', paid: 'Pago', unknown: 'Preço não confirmado' }[cost || 'unknown'])
const tokenCount = (value: string) => /^\d+$/.test(value) && Number(value) <= MAX_SIMULATION_TOKENS ? Number(value) : Number.NaN
const inputTokens = computed(() => tokenCount(simulation.input))
const outputTokens = computed(() => tokenCount(simulation.output))
const simulationValid = computed(() => Number.isFinite(inputTokens.value) && Number.isFinite(outputTokens.value))
const usdBrl = computed(() => exchange.value?.rate ?? null)
const exchangeLabel = computed(() => {
  const current = exchange.value
  if (!current) return exchangeLoading.value ? 'Consultando cotação USD/BRL…' : 'Cotação USD/BRL indisponível · estimativas em USD.'
  const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 4 }).format(current.rate)
  const date = new Date(current.quotedAt).toLocaleString('pt-BR')
  return `${current.stale || exchangeFailed.value ? 'Última cotação de' : 'Cotação de'} ${date} · US$ 1 ≈ ${value} · ${current.source} · cache de 1 min.`
})

const setInfo = (id: string, open: boolean) => {
  if (open) activeInfo.value = id
  else if (activeInfo.value === id) activeInfo.value = null
}

const estimateLabel = (model: CatalogModel) => {
  if (!simulationValid.value) return 'Informe volumes válidos'
  if (inputTokens.value === 0 && outputTokens.value === 0) return 'Sem tokens simulados'
  if (!model.outputModalities.includes('text')) return 'Ver tarifas'
  const cost = estimateTokenCost(model.promptPrice, model.completionPrice, inputTokens.value, outputTokens.value, usdBrl.value)
  if (cost.usd === null) return 'Ver tarifas'
  const label = cost.brl === null ? formatUsdCost(cost.usd) : formatBrlCost(cost.brl)
  return model.hasAdditionalCosts ? `${label} (base)` : label
}

const expireExchange = () => {
  if (exchange.value && Date.now() - Date.parse(exchange.value.quotedAt) > 7 * 24 * 60 * 60_000) exchange.value = null
}

const refreshExchange = async () => {
  expireExchange()
  if (document.hidden || exchangeController || Date.now() - exchangeLastAttempt < 60_000) return
  exchangeLastAttempt = Date.now()
  const abort = new AbortController()
  exchangeController = abort
  exchangeLoading.value = true
  try {
    const response = await fetch('/api/exchange-rate', { credentials: 'same-origin', signal: abort.signal })
    if (!response.ok) throw new Error('EXCHANGE_UNAVAILABLE')
    const result = await response.json() as ExchangeRate
    if (abort.signal.aborted) return
    exchange.value = result
    exchangeFailed.value = false
  } catch {
    expireExchange()
    if (!abort.signal.aborted) exchangeFailed.value = true
  } finally {
    if (exchangeController === abort) {
      exchangeController = null
      exchangeLoading.value = false
    }
  }
}

const visibilityChanged = () => {
  if (document.hidden && exchangeController) {
    const pending = exchangeController
    exchangeController = null
    pending.abort()
    exchangeLoading.value = false
    exchangeLastAttempt = 0
  } else if (!document.hidden) void refreshExchange()
}

const loadCatalog = async () => {
  const current = ++requestId
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  catalogError.value = ''
  try {
    const query = new URLSearchParams({ q: state.query.trim(), pricing: state.pricing, compatibility: state.compatibility, page: String(state.page) })
    const response = await fetch(`/api/models?${query}`, { credentials: 'same-origin', signal: controller.signal })
    if (!response.ok) throw new Error(response.status === 401 ? 'SESSION' : 'CATALOG')
    const result = await response.json() as ModelCatalogResponse
    if (current !== requestId) return
    catalog.value = result
    for (const model of result.items) models[model.id] = model
    if (!draftInitialized) {
      state.primary = result.defaults.primary
      state.fallback = result.defaults.fallback
      draftInitialized = true
    }
  } catch (cause) {
    if (current !== requestId) return
    catalogError.value = cause instanceof Error && cause.message === 'SESSION' ? 'Sessão encerrada. Entre novamente para consultar os modelos.' : 'Não foi possível carregar o catálogo. Sua seleção foi mantida.'
  } finally {
    if (current === requestId) loading.value = false
  }
}

const lookupModel = async (id: string) => {
  if (models[id] || lookedUp.has(id)) return
  lookedUp.add(id)
  const abort = new AbortController()
  lookups.add(abort)
  try {
    const query = new URLSearchParams({ q: id, pricing: 'all', compatibility: 'all', page: '1' })
    const response = await fetch(`/api/models?${query}`, { credentials: 'same-origin', signal: abort.signal })
    if (!response.ok) return
    const result = await response.json() as ModelCatalogResponse
    if (abort.signal.aborted) return
    const model = result.items.find(item => item.id === id)
    if (model) models[id] = model
  } catch {
    // A seleção permanece disponível com preço e compatibilidade não confirmados.
  } finally {
    lookups.delete(abort)
  }
}

const choose = (id: string) => {
  if (models[id]?.compatible === false) return
  state[state.target] = id
  draftInitialized = true
  notice.value = ''
}

const chooseManual = () => {
  if (!manualId.value.success || manualIsIncompatible.value) return
  choose(manualId.value.data)
}

const disableFallback = () => {
  state.fallback = null
  state.target = 'primary'
  notice.value = ''
}

const applySelection = () => {
  if (!canApply.value || busy.value || !candidate.value.success) return
  if (apply(candidate.value.data)) notice.value = 'Configuração aplicada. Será usada nos próximos turnos.'
}

const resetSelection = () => {
  if (busy.value || !catalog.value || !reset()) return
  state.primary = catalog.value.defaults.primary
  state.fallback = catalog.value.defaults.fallback
  draftInitialized = true
  notice.value = 'Padrão do ambiente restaurado para os próximos turnos.'
}

watch(() => [state.query, state.pricing, state.compatibility, state.page] as const, (current, previous) => {
  if (current[0] !== previous[0] || current[1] !== previous[1] || current[2] !== previous[2]) state.page = 1
  clearTimeout(timer)
  controller?.abort()
  requestId += 1
  loading.value = true
  timer = setTimeout(loadCatalog, 275)
})

watch(() => [state.primary, state.fallback, loading.value], () => {
  if (!ready.value || loading.value) return
  for (const id of [state.primary, state.fallback]) if (id) void lookupModel(id)
})

onMounted(() => {
  init()
  if (selection.value) {
    state.primary = selection.value.primary
    state.fallback = selection.value.fallback
    draftInitialized = true
  }
  ready.value = true
  void loadCatalog()
  void refreshExchange()
  exchangeTimer = setInterval(refreshExchange, 60_000)
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('focus', refreshExchange)
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  clearInterval(exchangeTimer)
  exchangeController?.abort()
  document.removeEventListener('visibilitychange', visibilityChanged)
  window.removeEventListener('focus', refreshExchange)
  requestId += 1
  controller?.abort()
  for (const lookup of lookups) lookup.abort()
  lookups.clear()
})
</script>
