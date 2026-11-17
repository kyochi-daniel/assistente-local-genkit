import type { CatalogModel } from '#shared/models'

export const MAX_SIMULATION_TOKENS = 10_000_000

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usdFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const centsFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const modalityNames: Readonly<Record<string, string>> = Object.freeze({ text: 'texto', image: 'imagem', audio: 'áudio', video: 'vídeo', file: 'arquivos', embedding: 'vetores' })
type Modalities = Pick<CatalogModel, 'inputModalities' | 'outputModalities'>

function tokenCost(price: string | null, tokens: number): number | null {
  if (price === null) return tokens === 0 ? 0 : null
  if (typeof price !== 'string' || !/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(price)) return null
  const amount = Number(price)
  if (!Number.isFinite(amount) || amount < 0) return null
  if (tokens === 0) return 0
  // Preserve custos positivos abaixo da precisão numérica para não exibir gratuidade falsa.
  const positive = /[1-9]/.test(price.split(/[eE]/)[0]!)
  const result = (amount || (positive ? Number.MIN_VALUE : 0)) * tokens
  return Number.isFinite(result) ? result : null
}

export function estimateTokenCost(promptPrice: string | null, completionPrice: string | null, inputTokens: number, outputTokens: number, usdBrl: number | null): { usd: number | null; brl: number | null } {
  const validCounts = [inputTokens, outputTokens].every(value => Number.isInteger(value) && value >= 0 && value <= MAX_SIMULATION_TOKENS)
  if (!validCounts) return { usd: null, brl: null }
  const input = tokenCost(promptPrice, inputTokens)
  const output = tokenCost(completionPrice, outputTokens)
  if (input === null || output === null || !Number.isFinite(input + output)) return { usd: null, brl: null }
  const usd = input + output
  if (usdBrl === null || !Number.isFinite(usdBrl) || usdBrl <= 0) return { usd, brl: null }
  const converted = usd * usdBrl
  return { usd, brl: Number.isFinite(converted) ? converted || (usd > 0 ? Number.MIN_VALUE : 0) : null }
}

export function formatBrlCost(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return 'Não informado'
  if (value === 0) return brlFormatter.format(0)
  if (value < 0.0001) return '<0,01 cent'
  if (value < 1) {
    const cents = Math.round(value * 10_000) / 100
    return cents >= 100 ? brlFormatter.format(1) : `${centsFormatter.format(cents)} cent`
  }
  return brlFormatter.format(value)
}

export function formatUsdCost(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return 'Não informado'
  if (value > 0 && value < 0.01) return '<US$0,01'
  return usdFormatter.format(value)
}

function modalityList(values: string[]): string {
  return [...new Set(values.map(value => Object.hasOwn(modalityNames, value) ? modalityNames[value]! : 'outra modalidade'))].join(' + ') || 'não informado'
}

export function modalidadeLabel({ inputModalities, outputModalities }: Modalities): string {
  const label = `${modalityList(inputModalities)} → ${modalityList(outputModalities)}`
  return `${label[0]!.toLocaleUpperCase('pt-BR')}${label.slice(1)}`
}

export function modalityDescription({ inputModalities, outputModalities }: Modalities): string {
  return `Entrada: ${modalityList(inputModalities)}. Saída: ${modalityList(outputModalities)}.`
}
