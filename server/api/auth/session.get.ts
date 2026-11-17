import { defineEventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { requireSession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  await requireSession(event, useRuntimeConfig(event))
  return { authenticated: true }
})
