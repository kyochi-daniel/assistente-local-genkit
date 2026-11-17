export default defineNuxtRouteMiddleware(async () => {
  const requestFetch = useRequestFetch()
  try {
    const session = await requestFetch<{ authenticated: boolean }>('/api/auth/session')
    if (session.authenticated) return
  } catch {}
  return navigateTo('/login')
})
