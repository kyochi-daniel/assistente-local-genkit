<template>
  <p class="message-content"><template v-for="(part, index) in parts" :key="index"><strong v-if="index % 2">{{ part.slice(2, -2) }}</strong><template v-else>{{ part }}</template></template></p>
</template>

<script setup lang="ts">
const props = defineProps({ text: { type: String, required: true } })
const parts = computed(() => props.text.split(/(\*\*[^*\n]+\*\*)/g))
</script>
