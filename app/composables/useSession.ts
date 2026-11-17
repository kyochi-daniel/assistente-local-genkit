export function useSession() {
  const requestFetch = useRequestFetch()
  const assistant = useAssistant()
  const workspace = useWorkspace()
  const authenticated = useState('session-authenticated', () => false)
  const busy = useState('session-busy', () => false)
  const error = useState('session-error', () => '')

  const check = async () => {
    try {
      const result = await requestFetch<{ authenticated: boolean }>('/api/auth/session')
      authenticated.value = result.authenticated === true
    } catch {
      authenticated.value = false
    }
    return authenticated.value
  }

  const login = async (username: string, password: string) => {
    if (busy.value) return false
    busy.value = true
    error.value = ''
    try {
      await $fetch('/api/auth/login', { method: 'POST', body: { username, password } })
      authenticated.value = true
      return true
    } catch (cause) {
      const status = (cause as { statusCode?: number }).statusCode
      error.value = status === 503
        ? 'O acesso ainda não foi configurado. Configure as variáveis locais do servidor.'
        : status === 429
          ? 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.'
          : status === 401
            ? 'Usuário ou senha incorretos.'
            : 'Não foi possível entrar. Confira os dados e tente novamente.'
      authenticated.value = false
      return false
    } finally {
      busy.value = false
    }
  }

  const logout = async () => {
    if (busy.value) return
    assistant.stop()
    workspace.clearReview()
    busy.value = true
    error.value = ''
    try {
      await $fetch('/api/auth/logout', { method: 'POST', body: {} })
      authenticated.value = false
      await navigateTo('/login')
    } catch {
      error.value = 'Não foi possível encerrar a sessão. Tente novamente.'
    } finally {
      busy.value = false
    }
  }

  return { authenticated, busy, error, check, login, logout }
}
