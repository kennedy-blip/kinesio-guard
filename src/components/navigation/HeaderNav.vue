<script setup>
import { ref } from 'vue'
import {
  Activity,
  Download,
  CheckCircle2,
  Monitor,
  Smartphone,
  ShieldCheck,
  Sparkles,
  Sun,
  Flame,
  Zap
} from 'lucide-vue-next'
import { triggerEmbeddedOneTapApkDownload } from '../../engines/apkSelfPackager.js'

const props = defineProps({
  theme: { type: String, default: 'obsidian' },
  viewportMode: { type: String, default: 'desktop' },
  roleTier: { type: String, default: 'STANDARD' },
  activeSensorCount: { type: Number, default: 2 },
  stressLevel: { type: Number, default: 0.12 }
})

const emit = defineEmits([
  'update:theme',
  'update:viewportMode',
  'open-privileges',
  'open-apk-modal'
])

const themeOptions = [
  { id: 'obsidian', label: 'Obsidian', full: 'Neuro Obsidian (Dark Glass)', icon: Sparkles },
  { id: 'daylight', label: 'Daylight', full: 'Rehab Daylight Frost (Clinic)', icon: Sun },
  { id: 'amber', label: 'Amber', full: 'Ergonomic Warm Amber (Evening)', icon: Flame },
  { id: 'eco', label: 'Eco 60fps', full: 'Eco-Glass / Low-GPU Mode', icon: Zap }
]

const roleDisplayMap = {
  STANDARD: { short: 'DAILY USER', badgeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-400/35' },
  PRO: { short: 'CLINICIAN PRO', badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-400/40' },
  ADMIN: { short: 'LAB DIRECTOR', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' }
}

const apkJustPackaged = ref(false)

function handleDirectApkAction() {
  triggerEmbeddedOneTapApkDownload()
  apkJustPackaged.value = true
  setTimeout(() => {
    apkJustPackaged.value = false
  }, 2600)
  emit('open-apk-modal')
}
</script>

<template>
  <header class="kg-glass-panel px-4 py-3 md:px-6 md:py-3.5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <!-- Brand Identity & Polyglot Status -->
      <div class="flex items-center gap-3">
        <div
          class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/25 via-emerald-500/20 to-violet-500/25 border border-cyan-400/40 shadow-inner"
        >
          <Activity class="h-6 w-6 text-cyan-400" />
          <span
            class="absolute -right-1 -top-1 h-3 w-3 rounded-full ring-2 ring-slate-950"
            :class="{
              'bg-emerald-400': stressLevel < 0.38,
              'bg-amber-400': stressLevel >= 0.38 && stressLevel < 0.72,
              'bg-rose-500 animate-ping': stressLevel >= 0.72
            }"
          />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-base md:text-lg font-bold tracking-tight kg-text-primary">
              KINESIO-GUARD
            </h1>
            <span
              class="hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider bg-cyan-500/15 text-cyan-400 border border-cyan-400/30"
            >
              0% TypeScript · Polyglot v1.0
            </span>
          </div>
          <p class="text-xs kg-text-secondary hidden md:block">
            3-Axis Welch PSD Tremor Lab · Hansraj C1–C7 Cervical Load · Romberg Stabilometer · Kalman Anti-Shake
          </p>
        </div>
      </div>

      <!-- Controls Cluster -->
      <div class="flex flex-wrap items-center gap-2">
        <!-- Dual Viewport Switcher: Desktop Clinical Station | Mobile APK Preview -->
        <div
          class="hidden lg:inline-flex items-center rounded-xl p-1 kg-subtle-surface"
          role="group"
          aria-label="Viewport Form-Factor Switcher"
        >
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
            :class="
              viewportMode === 'desktop'
                ? 'bg-cyan-500/25 text-cyan-300 shadow-sm border border-cyan-400/35'
                : 'kg-text-secondary hover:opacity-90'
            "
            :style="theme === 'daylight' && viewportMode === 'desktop' ? 'color: #0369a1' : ''"
            @click="emit('update:viewportMode', 'desktop')"
          >
            <Monitor class="h-3.5 w-3.5" />
            <span>Desktop Clinical Station</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
            :class="
              viewportMode === 'mobile'
                ? 'bg-violet-500/25 text-violet-300 shadow-sm border border-violet-400/35'
                : 'kg-text-secondary hover:opacity-90'
            "
            :style="theme === 'daylight' && viewportMode === 'mobile' ? 'color: #6d28d9' : ''"
            @click="emit('update:viewportMode', 'mobile')"
          >
            <Smartphone class="h-3.5 w-3.5" />
            <span>Mobile APK Preview</span>
          </button>
        </div>

        <!-- 4-Mode Clinical Environment & GPU Theme Switcher -->
        <div
          class="inline-flex items-center rounded-xl p-1 kg-subtle-surface"
          role="group"
          aria-label="Clinical Theme Switcher"
        >
          <button
            v-for="opt in themeOptions"
            :key="opt.id"
            type="button"
            :title="opt.full"
            class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all"
            :class="
              theme === opt.id
                ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 shadow-sm'
                : 'kg-text-secondary hover:opacity-90'
            "
            :style="theme === 'daylight' && opt.id === 'daylight' ? 'color: #047857; background: rgba(16,185,129,0.18)' : ''"
            @click="emit('update:theme', opt.id)"
          >
            <component :is="opt.icon" class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">{{ opt.label }}</span>
          </button>
        </div>

        <!-- Privileges, RBAC & Hardware Sensor Matrix Trigger -->
        <button
          type="button"
          class="kg-squish-card inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold kg-subtle-surface"
          @click="emit('open-privileges')"
        >
          <ShieldCheck class="h-4 w-4 text-cyan-400" />
          <span
            class="rounded-md px-1.5 py-0.5 text-[10px] font-mono border"
            :class="roleDisplayMap[roleTier]?.badgeClass"
            :style="theme === 'daylight' ? 'color: #0f172a' : ''"
          >
            {{ roleDisplayMap[roleTier]?.short }}
          </span>
          <span class="hidden xl:inline kg-text-secondary font-mono text-[11px]">
            {{ activeSensorCount }}/4 Sensors
          </span>
        </button>

        <!-- Prominent Self-Packaged One-Tap Android .APK Download + Distribution Center Trigger -->
        <button
          type="button"
          class="kg-squish-card inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-cyan-500 via-teal-500 to-violet-600 shadow-lg shadow-cyan-500/25 border border-white/25"
          @click="handleDirectApkAction"
        >
          <CheckCircle2 v-if="apkJustPackaged" class="h-4 w-4 text-emerald-200" />
          <Download v-else class="h-4 w-4" />
          <span>{{ apkJustPackaged ? 'APK Packaged & Saved!' : 'Download Android .APK' }}</span>
        </button>
      </div>
    </div>
  </header>
</template>
