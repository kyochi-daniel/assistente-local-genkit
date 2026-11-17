import { createError, getHeader, type H3Event } from 'h3'

export async function readLimitedJSON(event: H3Event, maxBytes: number): Promise<unknown> {
  if (getHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw createError({ statusCode: 400, statusMessage: 'Envie um corpo JSON.' })
  }
  const tooLarge = () => createError({ statusCode: 413, statusMessage: 'BODY_TOO_LARGE' })
  if (Number(getHeader(event, 'content-length')) > maxBytes) throw tooLarge()
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const request = event.node.req
    const chunks: Buffer[] = []
    let size = 0
    function cleanup() {
      request.off('data', onData)
      request.off('end', onEnd)
      request.off('error', onError)
      request.off('aborted', onAborted)
    }
    function onError() { cleanup(); reject(createError({ statusCode: 400, statusMessage: 'Corpo inválido.' })) }
    function onAborted() { onError() }
    function onData(chunk: Buffer) {
      size += chunk.length
      if (size > maxBytes) { cleanup(); request.resume(); reject(tooLarge()); return }
      chunks.push(chunk)
    }
    function onEnd() { cleanup(); resolve(Buffer.concat(chunks)) }
    request.on('data', onData)
    request.on('end', onEnd)
    request.on('error', onError)
    request.on('aborted', onAborted)
  })
  try { return JSON.parse(raw.toString('utf8')) }
  catch { throw createError({ statusCode: 400, statusMessage: 'JSON inválido.' }) }
}
