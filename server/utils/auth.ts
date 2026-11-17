import { createHash, timingSafeEqual } from 'node:crypto'
import { createError, getHeader, getRequestIP, useSession, type H3Event } from 'h3'

export interface AuthConfig {
  loginUser: string
  loginPassword: string
  sessionSecret: string
  allowedOrigin: string
}

export const SESSION_SECONDS = 8 * 60 * 60

export function assertOrigin(event: H3Event, config: Pick<AuthConfig, 'allowedOrigin'>) {
  if (getHeader(event, 'origin') !== (config.allowedOrigin || 'http://localhost:3000')) {
    throw createError({ statusCode: 403, statusMessage: 'Origem não permitida.' })
  }
}

export function credentialsEqual(actual: string, expected: string) {
  return timingSafeEqual(createHash('sha256').update(actual).digest(), createHash('sha256').update(expected).digest())
}

export function assertLoginConfigured(config: AuthConfig) {
  if (!config.loginUser || !config.loginPassword || Buffer.byteLength(config.sessionSecret) < 32) {
    throw createError({ statusCode: 503, statusMessage: 'Configure as credenciais locais e um segredo de sessão com pelo menos 32 bytes.' })
  }
}

export function sessionConfig(config: AuthConfig) {
  return {
    name: 'genkit-session',
    password: config.sessionSecret,
    maxAge: SESSION_SECONDS,
    sessionHeader: false as const,
    cookie: { httpOnly: true, sameSite: 'strict' as const, path: '/', maxAge: SESSION_SECONDS, secure: config.allowedOrigin.startsWith('https://') },
  }
}

export function sessionIsValid(data: { authenticatedAt?: unknown }, now = Date.now()) {
  return typeof data.authenticatedAt === 'number' && Number.isSafeInteger(data.authenticatedAt)
    && data.authenticatedAt <= now && now - data.authenticatedAt < SESSION_SECONDS * 1000
}

export async function requireSession(event: H3Event, config: AuthConfig) {
  if (Buffer.byteLength(config.sessionSecret) < 32) {
    throw createError({ statusCode: 401, statusMessage: 'Sessão ausente ou expirada.' })
  }
  const session = await useSession<{ authenticatedAt: number }>(event, sessionConfig(config))
  if (!sessionIsValid(session.data)) {
    throw createError({ statusCode: 401, statusMessage: 'Sessão ausente ou expirada.' })
  }
  return session
}

// shortcut: contador por processo, substituir ao publicar ou executar várias instâncias.
const failures = new Map<string, { count: number; expiresAt: number; blockedUntil: number }>()

export function checkLoginLimit(ip: string, now = Date.now()) {
  for (const [key, entry] of failures) {
    if (Math.max(entry.expiresAt, entry.blockedUntil) <= now) failures.delete(key)
  }
  if ((failures.get(ip)?.blockedUntil || 0) > now) {
    throw createError({ statusCode: 429, statusMessage: 'Aguarde um minuto antes de tentar novamente.' })
  }
}

export function recordLoginFailure(ip: string, now = Date.now()) {
  checkLoginLimit(ip, now)
  const current = failures.get(ip) || { count: 0, expiresAt: now + 60_000, blockedUntil: 0 }
  current.count += 1
  if (current.count >= 5) current.blockedUntil = now + 60_000
  failures.set(ip, current)
  checkLoginLimit(ip, now)
}

export function clearLoginFailures(ip: string) { failures.delete(ip) }
export function loginIP(event: H3Event) { return getRequestIP(event) || 'local' }
