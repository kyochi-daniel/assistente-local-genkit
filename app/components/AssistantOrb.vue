<template>
  <div class="assistant-orb" :class="{ 'orb-active': active }" :data-active="active" aria-hidden="true">
    <svg viewBox="0 0 180 180" fill="none" focusable="false">
      <defs>
        <radialGradient :id="`${id}-aura`"><stop stop-color="#55F69C" stop-opacity=".32" /><stop offset="1" stop-color="#55F69C" stop-opacity="0" /></radialGradient>
        <radialGradient :id="`${id}-body`" cx=".32" cy=".22" r=".9"><stop stop-color="#85FFE2" /><stop offset=".3" stop-color="#13EF6D" /><stop offset=".64" stop-color="#00D938" /><stop offset="1" stop-color="#047C49" /></radialGradient>
        <radialGradient :id="`${id}-blue`"><stop stop-color="#44F4EF" /><stop offset=".5" stop-color="#07BBD0" stop-opacity=".85" /><stop offset="1" stop-color="#079C9F" stop-opacity="0" /></radialGradient>
        <radialGradient :id="`${id}-lime`"><stop stop-color="#F0FF9C" /><stop offset=".42" stop-color="#B5FF69" /><stop offset="1" stop-color="#5EF17F" stop-opacity="0" /></radialGradient>
        <radialGradient :id="`${id}-white`"><stop stop-color="#F3FFF3" stop-opacity=".94" /><stop offset=".45" stop-color="#D5FFE4" stop-opacity=".64" /><stop offset="1" stop-color="#DAFFF0" stop-opacity="0" /></radialGradient>
        <radialGradient :id="`${id}-edge`" cx=".46" cy=".4" r=".64"><stop offset=".52" stop-color="#003C32" stop-opacity="0" /><stop offset=".87" stop-color="#007C36" stop-opacity=".08" /><stop offset="1" stop-color="#005C35" stop-opacity=".6" /></radialGradient>
        <linearGradient :id="`${id}-ribbon`" x1="40" y1="70" x2="139" y2="139" gradientUnits="userSpaceOnUse"><stop stop-color="#49FCBF" stop-opacity="0" /><stop offset=".52" stop-color="#91FFB4" stop-opacity=".72" /><stop offset="1" stop-color="#E5FFA0" stop-opacity=".95" /></linearGradient>
        <clipPath :id="`${id}-clip`"><circle cx="90" cy="86" r="76" /></clipPath>
        <filter :id="`${id}-blur`" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" /></filter>
        <filter :id="`${id}-soft`" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
        <filter :id="`${id}-shadow`" x="-50%" y="-50%" width="200%" height="220%"><feDropShadow dx="0" dy="9" stdDeviation="7" flood-color="#048F51" flood-opacity=".22" /></filter>
      </defs>
      <ellipse cx="90" cy="107" rx="90" ry="72" :fill="`url(#${id}-aura)`" />
      <g :filter="`url(#${id}-shadow)`"><circle cx="90" cy="86" r="76" :fill="`url(#${id}-body)`" /></g>
      <g :clip-path="`url(#${id}-clip)`">
        <g class="orb-mist" :filter="`url(#${id}-blur)`"><ellipse cx="58" cy="64" rx="40" ry="48" :fill="`url(#${id}-blue)`" transform="rotate(-24 58 64)" /><ellipse cx="122" cy="119" rx="49" ry="43" :fill="`url(#${id}-lime)`" /></g>
        <g class="orb-core" :filter="`url(#${id}-soft)`"><path d="M29 103C49 77 70 100 86 87C101 75 105 38 121 42C142 47 149 79 137 99C124 125 97 116 88 131C77 146 50 141 29 103Z" :fill="`url(#${id}-ribbon)`" opacity=".74" /></g>
        <g class="orb-caustic" :filter="`url(#${id}-blur)`"><ellipse cx="83" cy="66" rx="15" ry="41" transform="rotate(-33 83 66)" :fill="`url(#${id}-white)`" opacity=".7" /><ellipse cx="139" cy="83" rx="19" ry="31" :fill="`url(#${id}-lime)`" opacity=".86" /></g>
        <circle cx="90" cy="86" r="76" :fill="`url(#${id}-edge)`" />
        <g class="orb-highlight" :filter="`url(#${id}-soft)`"><path d="M29 54C34 35 49 23 66 23" stroke="#CAFFE2" stroke-opacity=".46" stroke-width="5" stroke-linecap="round" /><path d="M111 151C133 143 148 122 152 106" stroke="#76FFD1" stroke-opacity=".55" stroke-width="4" stroke-linecap="round" /></g>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'

const props = defineProps({ active: { type: Boolean, default: false } })
const id = useId()
</script>
