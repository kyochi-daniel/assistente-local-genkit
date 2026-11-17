import { defineEventHandler, deleteCookie, setResponseStatus } from 'h3'
import { useRuntimeConfig } from '#imports'
import { assertOrigin } from '../../utils/auth'
import { readLimitedJSON } from '../../utils/body'

export default defineEventHandler(async (event) => {
  assertOrigin(event, useRuntimeConfig(event))
  await readLimitedJSON(event, 2048)
  deleteCookie(event, 'genkit-session', { path: '/', httpOnly: true, sameSite: 'strict' })
  setResponseStatus(event, 204)
  return null
})
