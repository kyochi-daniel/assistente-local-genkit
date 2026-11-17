<template>
  <p role="status">Abrindo seu espaço…</p>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })
const session = useSession()
await navigateTo(await session.check() ? '/assistente' : '/login')
</script>
