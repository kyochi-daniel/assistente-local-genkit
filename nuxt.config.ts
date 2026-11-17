import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-13',
  devtools: { enabled: false },
  modules: ['shadcn-nuxt'],
  shadcn: { prefix: '', componentDir: './app/components/ui' },
  css: ['~/assets/css/tailwind.css', '~/assets/sass/main.sass'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: {
    loginUser: '', loginPassword: '', sessionSecret: '',
    allowedOrigin: 'http://localhost:3000',
    openrouterApiKey: '',
    openrouterModel: 'baidu/ernie-5.5-flash-preview:free',
    openrouterFallbackModel: '',
  },
  app: { head: { title: 'Nexo — Seu espaço de trabalho', htmlAttrs: { lang: 'pt-BR' }, meta: [{ name: 'description', content: 'Clientes, contratos e um assistente para cuidar do próximo passo.' }] } },
})
