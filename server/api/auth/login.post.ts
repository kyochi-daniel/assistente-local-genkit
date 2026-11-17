import { createError, defineEventHandler, useSession } from 'h3'
import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
import { assertLoginConfigured, assertOrigin, checkLoginLimit, clearLoginFailures, credentialsEqual, loginIP, recordLoginFailure, sessionConfig } from '../../utils/auth'
import { readLimitedJSON } from '../../utils/body'

const loginSchema = z.object({ username: z.string().min(1).max(120), password: z.string().min(1).max(256) }).strict()

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  assertOrigin(event, config)
  const result = loginSchema.safeParse(await readLimitedJSON(event, 2048))
  if (!result.success) throw createError({ statusCode: 400, statusMessage: 'Credenciais inválidas.' })
  assertLoginConfigured(config)
  const ip = loginIP(event)
  checkLoginLimit(ip)
  const usernameMatches = credentialsEqual(result.data.username, config.loginUser)
  const passwordMatches = credentialsEqual(result.data.password, config.loginPassword)
  if (!usernameMatches || !passwordMatches) {
    recordLoginFailure(ip)
    throw createError({ statusCode: 401, statusMessage: 'Usuário ou senha incorretos.' })
  }
  clearLoginFailures(ip)
  const session = await useSession<{ authenticatedAt: number }>(event, sessionConfig(config))
  await session.clear()
  await session.update({ authenticatedAt: Date.now() })
  return { authenticated: true }
})
