<script setup>
import { watch, computed } from 'vue'
import {
  Activity,
  Bone,
  Compass,
  Crosshair,
  Code2,
  Download
} from 'lucide-vue-next'
import { useSpringValue } from '../../composables/useSpringPhysics.js'
import { triggerEmbeddedOneTapApkDownload } from '../../engines/apkSelfPackager.js'

const props = defineProps({
  activeTab: { type: String, default: 'tremor' },
  compactMobile: { type: Boolean, default: false },
  theme: { type: String, default: 'obsidian' }
})

const emit = defineEmits(['update:activeTab', 'open-apk-modal'])

const navModules = [
  {
    id: 'tremor',
    short: 'Tremor PSD',
    full: 'Tremor & Spiral Lab',
    sub: '2–16 Hz Welch FFT',
    icon: Activity
  },
  {
    id: 'cervical',
    short: 'Spine Load',
    full: 'Cervical Biomechanics',
    sub: 'Hansraj C1–C7 N/lbs',
    icon: Bone
  },
  {
    id: 'romberg',
    short: 'Romberg',
    full: 'Romberg Stabilometer',
    sub: 'PCA 95% Sway Ellipse',
    icon: Compass
  },
  {
    id: 'kalman',
    short: 'Stabilizer',
    full: 'Kalman Anti-Tremor',
    sub: 'Inverse-Phase Reader',
    icon: Crosshair
  },
  {
    id: 'polyglot',
    short: 'Polyglot',
    full: 'Polyglot & Vault',
    sub: 'Rust·Go·Java·IDB',
    icon: Code2
  }
]

const activeIndex = computed(() => {
  const idx = navModules.findIndex((m) => m.id === props.activeTab)
  return idx >= 0 ? idx : 0
})

const pillIndexSpring = useSpringValue(activeIndex.value, {
  stiffness: 320,
  damping: 25,
  mass: 0.8
})

const stretchScaleSpring = useSpringValue(1, {
  stiffness: 360,
  damping: 20,
  mass: 0.65
})

watch(activeIndex, (nextIdx, prevIdx) => {
  const distance = Math.min(2.2, Math.abs(nextIdx - prevIdx))
  stretchScaleSpring.setTarget(1 + distance * 0.24, true)
  requestAnimationFrame(() => {
    stretchScaleSpring.setTarget(1)
  })
  pillIndexSpring.setTarget(nextIdx)
})

const liquidPillStyle = computed(() => {
  const widthPct = 100 / navModules.length
  const leftPct = pillIndexSpring.current.value * widthPct
  const stretchX = stretchScaleSpring.current.value
  return {
    width: `${widthPct}%`,
    left: `${leftPct}%`,
    transform: `scaleX(${stretchX.toFixed(3)})`
  }
})
</script>

<template>
  <nav
    class="kg-glass-panel px-2 py-2 md:px-3 md:py-2.5"
    aria-label="Kinesio-Guard Biomechanical Modules"
  >
    <!-- Inline SVG Gooey Metaball Liquid Mercury Filter -->
    <svg class="sr-only" width="0" height="0" aria-hidden="true">
      <defs>
        <filter id="kinesio-gooey-metaball">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -8"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>

    <div class="flex items-center gap-2">
      <div class="relative flex-1 overflow-hidden rounded-xl p-1 kg-subtle-surface">
        <!-- Gooey Liquid Indicator Layer -->
        <div
          v-if="theme !== 'eco'"
          class="pointer-events-none absolute inset-y-1 left-0 right-0"
          style="filter: url(#kinesio-gooey-metaball)"
        >
          <div
            class="h-full rounded-xl bg-gradient-to-r from-cyan-500/35 via-teal-400/30 to-violet-500/35"
            :style="liquidPillStyle"
          />
        </div>
        <div
          v-else
          class="pointer-events-none absolute inset-y-1 left-0 right-0"
        >
          <div
            class="h-full rounded-xl bg-teal-500/25 border border-teal-400/40"
            :style="liquidPillStyle"
          />
        </div>

        <!-- Interactive Module Buttons -->
        <div class="relative z-10 grid grid-cols-5 gap-1">
          <button
            v-for="mod in navModules"
            :key="mod.id"
            type="button"
            class="group flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2.5 rounded-xl px-1.5 py-2 md:px-3 md:py-2.5 text-center md:text-left transition-colors"
            :class="
              activeTab === mod.id
                ? 'kg-text-primary font-semibold'
                : 'kg-text-secondary hover:opacity-95'
            "
            @click="emit('update:activeTab', mod.id)"
          >
            <component
              :is="mod.icon"
              class="h-4 w-4 md:h-4.5 md:w-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110"
              :class="activeTab === mod.id ? 'text-cyan-400' : 'opacity-75'"
              :style="theme === 'daylight' && activeTab === mod.id ? 'color: #0284c7' : ''"
            />
            <div class="min-w-0 leading-tight">
              <div class="truncate text-[10px] sm:text-xs">
                {{ compactMobile ? mod.short : mod.full }}
              </div>
              <div
                v-if="!compactMobile"
                class="hidden xl:block truncate text-[10px] font-mono opacity-70"
              >
                {{ mod.sub }}
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Mobile / APK Chassis Dock Self-Packaged One-Tap Download Button -->
      <button
        type="button"
        class="kg-squish-card flex lg:hidden shrink-0 flex-col items-center justify-center rounded-xl px-2.5 py-2 text-[10px] font-bold text-white bg-gradient-to-br from-cyan-500 to-violet-600 shadow-md"
        title="One-Tap Self-Packaged Android .APK Download"
        @click="
          triggerEmbeddedOneTapApkDownload();
          emit('open-apk-modal')
        "
      >
        <Download class="h-4 w-4 mb-0.5" />
        <span>.APK</span>
      </button>
    </div>
  </nav>
</template>
