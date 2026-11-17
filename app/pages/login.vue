<template>
  <main class="login">
    <section class="login-story" aria-labelledby="welcome-title">
      <NuxtLink to="/" class="brand" aria-label="Nexo, início"><span class="brand-symbol">n</span>Nexo</NuxtLink>
      <div>
        <p class="eyebrow">SEU ESPAÇO DE TRABALHO</p>
        <h1 id="welcome-title">Menos etapas.<br>Mais conversa.</h1>
        <p>Organize clientes e contratos com um assistente que acompanha o seu trabalho.</p>
      </div>
      <p class="login-note"><ShieldCheck aria-hidden="true" /> Você revisa. Você confirma. Você decide.</p>
    </section>
    <section class="login-content" aria-labelledby="login-title">
      <form class="login-form" @submit.prevent="submit">
        <p class="eyebrow">BEM-VINDO AO NEXO</p>
        <h2 id="login-title">Entre no seu espaço</h2>
        <p class="muted">Use as credenciais configuradas neste ambiente local.</p>
        <div class="campo">
          <Label for="username">Usuário</Label>
          <Input id="username" v-model="state.username" autocomplete="username" :maxlength="120" required spellcheck="false" placeholder="Seu usuário" />
        </div>
        <div class="campo">
          <Label for="password">Senha</Label>
          <Input id="password" v-model="state.password" type="password" autocomplete="current-password" :maxlength="256" required spellcheck="false" placeholder="Sua senha" />
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <Button type="submit" :disabled="busy" class="login-submit">{{ busy ? 'Entrando…' : 'Entrar' }}<ArrowRight aria-hidden="true" /></Button>
        <p class="small muted">Protótipo local. Use apenas dados fictícios. Os cadastros ficam neste navegador.</p>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ArrowRight, ShieldCheck } from '@lucide/vue'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

const { login, check, busy, error } = useSession()
definePageMeta({ layout: false })
const state = reactive({ username: '', password: '' })

const submit = async () => {
  if (await login(state.username, state.password)) {
    state.password = ''
    await navigateTo('/assistente')
  }
}

if (await check()) await navigateTo('/assistente')
</script>
