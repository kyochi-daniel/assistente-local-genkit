import { describe, expect, it } from 'vitest'
import { fitRequest, readEvents } from '../../app/utils/stream'

const turnId = '00000000-0000-4000-8000-000000000001'

async function collect(chunks: Uint8Array[]) {
  const body = new ReadableStream<Uint8Array>({ start(controller) { chunks.forEach((chunk) => controller.enqueue(chunk)); controller.close() } })
  const events = []
  for await (const event of readEvents(body)) events.push(event)
  return events
}

describe('stream SSE', () => {
  it('recompõe UTF-8 e delimitadores incompletos', async () => {
    const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ turnId, type: 'text_delta', text: 'ação' })}\r\n\r\ndata: ${JSON.stringify({ turnId, type: 'turn_end', reason: 'complete', technicalHistory: [] })}\n\n`)
    const events = await collect([...bytes].map((byte) => new Uint8Array([byte])))
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ text: 'ação' })
  })

  it('rejeita JSON, ações e eventos incompletos', async () => {
    await expect(collect([new TextEncoder().encode('data: {}\n\n')])).rejects.toThrow()
    await expect(collect([new TextEncoder().encode('data: {')])).rejects.toThrow('STREAM_INTERRUPTED')
  })

  it('remove somente histórico antigo pelo tamanho UTF-8', () => {
    const request = { visibleHistory: ['ç'.repeat(140_000)], text: 'preservado', technicalHistory: [] }
    expect(JSON.parse(fitRequest(request))).toEqual({ ...request, visibleHistory: [] })
    expect(request.visibleHistory).toHaveLength(1)
    expect(() => fitRequest({ visibleHistory: [], text: 'ç'.repeat(140_000) })).toThrow('BODY_TOO_LARGE')
  })
})
