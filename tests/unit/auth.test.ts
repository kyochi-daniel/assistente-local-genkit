import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createApp, defineEventHandler, toNodeListener, useSession } from 'h3'
import { assertLoginConfigured, assertOrigin, checkLoginLimit, clearLoginFailures, credentialsEqual, recordLoginFailure, requireSession, SESSION_SECONDS, sessionConfig, sessionIsValid } from '../../server/utils/auth'
import { readLimitedJSON } from '../../server/utils/body'

const config = { loginUser: 'teste', loginPassword: ' senha fictícia ', sessionSecret: 'segredo-apenas-de-teste-com-32-bytes-minimo', allowedOrigin: 'http://localhost:3000' }
let server: Server
let base: string

beforeAll(async () => {
  const app = createApp().use(defineEventHandler(async event => {
    if (event.path === '/issue') {
      const session = await useSession<{ authenticatedAt: number }>(event, sessionConfig(config))
      await session.update({ authenticatedAt: Date.now() })
      return { authenticated: true }
    }
    if (event.path === '/body') return readLimitedJSON(event, 32)
    if (event.path === '/origin') { assertOrigin(event, config); return { ok: true } }
    await requireSession(event, config)
    return { authenticated: true }
  }))
  server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Servidor de teste indisponível.')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })

describe('autenticação local sem provedor IA', () => {
  it('compara credenciais sem remover espaços da senha', () => {
    expect(credentialsEqual(config.loginPassword, config.loginPassword)).toBe(true)
    expect(credentialsEqual(config.loginPassword.trim(), config.loginPassword)).toBe(false)
    expect(credentialsEqual('outra', config.loginPassword)).toBe(false)
  })
  it('bloqueia setup ausente e segredo curto', () => {
    expect(() => assertLoginConfigured({ ...config, loginPassword: '' })).toThrow()
    expect(() => assertLoginConfigured({ ...config, sessionSecret: 'curto' })).toThrow()
    expect(() => assertLoginConfigured(config)).not.toThrow()
  })
  it('expira em oito horas absolutas', () => {
    const now = Date.now()
    expect(sessionIsValid({ authenticatedAt: now - SESSION_SECONDS * 1000 + 1 }, now)).toBe(true)
    expect(sessionIsValid({ authenticatedAt: now - SESSION_SECONDS * 1000 }, now)).toBe(false)
    expect(sessionIsValid({ authenticatedAt: now + 1 }, now)).toBe(false)
    expect(sessionIsValid({}, now)).toBe(false)
    expect(sessionConfig({ ...config, allowedOrigin: 'https://localhost:3000' }).cookie.secure).toBe(true)
  })
  it('bloqueia após cinco falhas por um minuto', () => {
    const ip = 'ip-teste-limite'
    clearLoginFailures(ip)
    for (let i = 0; i < 4; i++) expect(() => recordLoginFailure(ip, 1000)).not.toThrow()
    expect(() => recordLoginFailure(ip, 1000)).toThrow(/minuto/)
    expect(() => checkLoginLimit(ip, 60_999)).toThrow()
    expect(() => checkLoginLimit(ip, 61_000)).not.toThrow()
  })
  it('aceita somente origem configurada', async () => {
    expect((await fetch(`${base}/origin`, { headers: { origin: config.allowedOrigin } })).status).toBe(200)
    expect((await fetch(`${base}/origin`, { headers: { origin: 'https://externo.example' } })).status).toBe(403)
    expect((await fetch(`${base}/origin`)).status).toBe(403)
  })
  it('usa cookie selado HttpOnly Strict e recusa cookie adulterado ou header de sessão', async () => {
    expect((await fetch(`${base}/protected`)).status).toBe(401)
    const issued = await fetch(`${base}/issue`)
    const cookie = issued.headers.get('set-cookie')!
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain(`Max-Age=${SESSION_SECONDS}`)
    const pair = cookie.split(';')[0]!
    expect((await fetch(`${base}/protected`, { headers: { cookie: pair } })).status).toBe(200)
    expect((await fetch(`${base}/protected`, { headers: { cookie: `${pair}corrompido` } })).status).toBe(401)
    expect((await fetch(`${base}/protected`, { headers: { 'x-genkit-session-session': pair.split('=').slice(1).join('=') } })).status).toBe(401)
  })
  it('valida JSON e limita bytes inclusive em envio fragmentado', async () => {
    expect((await fetch(`${base}/body`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status).toBe(400)
    expect((await fetch(`${base}/body`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status).toBe(400)
    expect((await fetch(`${base}/body`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(200)
    const chunks = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(40))); controller.close() } })
    const response = await fetch(`${base}/body`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: chunks, duplex: 'half' } as RequestInit)
    expect(response.status).toBe(413)
  })
})
