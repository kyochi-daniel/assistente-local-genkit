import { describe, expect, it } from 'vitest'
import { estimateTokenCost, formatBrlCost, formatUsdCost, MAX_SIMULATION_TOKENS, modalidadeLabel, modalityDescription } from '../../app/utils/model-cost'

const normalize = (value: string) => value.replace(/\s/g, '')

describe('estimativa de tokens sem arredondamento antecipado', () => {
  it('soma preços originais por token e converte com a taxa informada', () => {
    expect(estimateTokenCost('0.000001', '0.000002', 1000, 500, 5)).toEqual({ usd: 0.002, brl: 0.01 })
    expect(estimateTokenCost('1e-8', '2e-8', 100, 0, 4)).toEqual({ usd: 0.000001, brl: 0.000004 })
    expect(estimateTokenCost('0.1', '0.2', 10, 10, 5)).toEqual({ usd: 3, brl: 15 })
  })

  it('distingue preços ausentes de zero real e ignora preço ausente somente sem volume', () => {
    expect(estimateTokenCost('0', '0.0000e-3', 100, 100, 5)).toEqual({ usd: 0, brl: 0 })
    expect(estimateTokenCost(null, null, 0, 0, 5)).toEqual({ usd: 0, brl: 0 })
    expect(estimateTokenCost(null, '0.01', 0, 1, 5)).toEqual({ usd: 0.01, brl: 0.05 })
    expect(estimateTokenCost('0.01', null, 1, 0, 5)).toEqual({ usd: 0.01, brl: 0.05 })
    expect(estimateTokenCost(null, '0', 1, 1, 5)).toEqual({ usd: null, brl: null })
  })

  it.each(['-1', '-1e-999', '', ' ', 'NaN', 'Infinity', '0x10', '1,2', '1_000', '12USD', '1e999'])('rejeita preço inválido %s sem simular gratuidade', price => {
    expect(estimateTokenCost(price, '0', 1, 0, 5)).toEqual({ usd: null, brl: null })
  })

  it.each([-1, 0.5, MAX_SIMULATION_TOKENS + 1, NaN, Infinity])('rejeita contagem inválida %s', count => {
    expect(estimateTokenCost('0', '0', count, 0, 5)).toEqual({ usd: null, brl: null })
    expect(estimateTokenCost('0', '0', 0, count, 5)).toEqual({ usd: null, brl: null })
  })

  it('aceita o limite e preserva USD quando o câmbio está ausente ou inválido', () => {
    expect(estimateTokenCost('0.000001', null, MAX_SIMULATION_TOKENS, 0, null)).toEqual({ usd: 10, brl: null })
    ;[null, 0, -5, Infinity, NaN].forEach(rate => {
      expect(estimateTokenCost('0.01', '0', 1, 0, rate)).toEqual({ usd: 0.01, brl: null })
    })
  })

  it('retorna desconhecido para overflow e preserva custos positivos em underflow', () => {
    expect(estimateTokenCost('1e308', '0', 10, 0, 5)).toEqual({ usd: null, brl: null })
    expect(estimateTokenCost('1e308', '1e308', 1, 1, 5)).toEqual({ usd: null, brl: null })
    expect(estimateTokenCost('1e308', '0', 1, 0, 5)).toEqual({ usd: 1e308, brl: null })
    const underflow = estimateTokenCost('1e-999', null, 1, 0, 0.01)
    expect(underflow.usd).toBeGreaterThan(0)
    expect(underflow.brl).toBeGreaterThan(0)
    expect(formatBrlCost(underflow.brl)).toBe('<0,01 cent')
    expect(formatUsdCost(underflow.usd)).toBe('<US$0,01')
    expect(estimateTokenCost('0e-999', null, 1, 0, 5)).toEqual({ usd: 0, brl: 0 })
  })
})

describe('formatação de centavos e moedas', () => {
  it.each([[0.02, '2 cent'], [0.0004, '0,04 cent'], [0.019, '1,9 cent'], [0.0001, '0,01 cent'], [0.00001, '<0,01 cent'], [Number.MIN_VALUE, '<0,01 cent']])('formata R$ %s sem zerar preço positivo', (value, expected) => {
    expect(formatBrlCost(value as number)).toBe(expected)
  })

  it('converte arredondamento de 100 centavos para reais e formata montantes maiores', () => {
    expect(normalize(formatBrlCost(0))).toBe('R$0,00')
    expect(normalize(formatBrlCost(0.99999))).toBe('R$1,00')
    expect(normalize(formatBrlCost(1))).toBe('R$1,00')
    expect(normalize(formatBrlCost(1234.56))).toBe('R$1.234,56')
    expect(normalize(formatUsdCost(0))).toBe('US$0,00')
    expect(formatUsdCost(0.001)).toBe('<US$0,01')
    expect(normalize(formatUsdCost(0.01))).toBe('US$0,01')
    expect(normalize(formatUsdCost(1234.56))).toBe('US$1.234,56')
  })

  it.each([null, NaN, Infinity, -1, 'invalid'])('informa valor indisponível em vez de preço falso para %s', value => {
    expect(formatBrlCost(value as number | null)).toBe('Não informado')
    expect(formatUsdCost(value as number | null)).toBe('Não informado')
  })
})

describe('modalidades de entrada e saída', () => {
  it('distingue entrada multimodal de geração de imagens sem alegar qualidade', () => {
    const vision = { inputModalities: ['text', 'image'], outputModalities: ['text'] }
    expect(modalidadeLabel(vision)).toBe('Texto + imagem → texto')
    expect(modalityDescription(vision)).toBe('Entrada: texto + imagem. Saída: texto.')
    expect(modalidadeLabel({ inputModalities: ['text'], outputModalities: ['image'] })).toBe('Texto → imagem')
  })

  it('traduz modalidades conhecidas e representa desconhecidas e listas vazias', () => {
    expect(modalidadeLabel({ inputModalities: ['audio', 'video', 'file'], outputModalities: ['embedding'] })).toBe('Áudio + vídeo + arquivos → vetores')
    expect(modalidadeLabel({ inputModalities: [], outputModalities: [] })).toBe('Não informado → não informado')
    expect(modalityDescription({ inputModalities: ['unknown', 'constructor'], outputModalities: ['text', 'text'] })).toBe('Entrada: outra modalidade. Saída: texto.')
  })
})
