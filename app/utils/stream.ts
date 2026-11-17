import { streamEventSchema } from '#shared/schemas'
import type { ChatEvent } from '#shared/types'

export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      if (buffer.length > 1_048_576) throw new Error('INVALID_STREAM')
      let separator = /\r?\n\r?\n/.exec(buffer)
      while (separator) {
        const frame = buffer.slice(0, separator.index)
        buffer = buffer.slice(separator.index + separator[0].length)
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (data) yield streamEventSchema.parse(JSON.parse(data)) as ChatEvent
        separator = /\r?\n\r?\n/.exec(buffer)
      }
      if (done) {
        if (buffer.trim()) throw new Error('STREAM_INTERRUPTED')
        break
      }
    }
  } finally { await reader.cancel(); reader.releaseLock() }
}

export function fitRequest<T extends { visibleHistory: unknown[] }>(request: T): string {
  let next = request
  let json = JSON.stringify(next)
  while (new TextEncoder().encode(json).byteLength > 262_144 && next.visibleHistory.length) {
    next = { ...next, visibleHistory: next.visibleHistory.slice(1) }
    json = JSON.stringify(next)
  }
  if (new TextEncoder().encode(json).byteLength > 262_144) throw new Error('BODY_TOO_LARGE')
  return json
}
