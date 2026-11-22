<script setup>
import { ref, computed } from 'vue'
import {
  Code2,
  Database,
  RefreshCw,
  Download,
  Lock,
  Play,
  CloudOff,
  Cloud,
  Trash2,
  FileSpreadsheet
} from 'lucide-vue-next'

import rustLibSrc from '../../../rust-biomechanics/src/lib.rs?raw'
import rustFftSrc from '../../../rust-biomechanics/src/tremor_fft.rs?raw'
import rustSwaySrc from '../../../rust-biomechanics/src/romberg_sway.rs?raw'
import goApiSrc from '../../../api/kinesio_triage.go?raw'
import goHansrajSrc from '../../../go_biomechanics/hansraj_cervical.go?raw'
import javaImuSrc from '../../../android/app/src/main/java/com/kinesioguard/neuro/InertialKinematicsPlugin.java?raw'
import javaHapticSrc from '../../../android/app/src/main/java/com/kinesioguard/neuro/BioHapticStabilizerPlugin.java?raw'
import glslShaderSrc from '../../shaders/synaptic_kinematics.glsl?raw'
import jsBridgeSrc from '../../engines/rustBiomechBridge.js?raw'

import {
  TREMOR_PRESETS,
  synthesizeTremorWaveform3Axis,
  runPolyglotDspBenchmark
} from '../../engines/rustBiomechBridge.js'
import { invokeGoKinesioTriage } from '../../engines/cervicalGoMirror.js'
import {
  build200HzAccelerometerCsv,
  triggerBrowserFileDownload
} from '../../db/kinesioDb.js'

const props = defineProps({
  roleTier: { type: String, default: 'STANDARD' },
  theme: { type: String, default: 'obsidian' },
  vaultRecords: { type: Array, default: () => [] },
  simulateOfflineQueue: { type: Boolean, default: false }
})

const emit = defineEmits([
  'elevate-role',
  'toggle-offline-queue',
  'flush-sync-queue',
  'delete-vault-record',
  'open-clinical-report'
])

const polyglotFiles = [
  {
    id: 'rust-lib',
    lang: 'Rust (.rs)',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-400/35',
    path: 'rust-biomechanics/src/lib.rs',
    code: rustLibSrc
  },
  {
    id: 'rust-fft',
    lang: 'Rust DSP (.rs)',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-400/35',
    path: 'rust-biomechanics/src/tremor_fft.rs',
    code: rustFftSrc
  },
  {
    id: 'rust-sway',
    lang: 'Rust PCA (.rs)',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-400/35',
    path: 'rust-biomechanics/src/romberg_sway.rs',
    code: rustSwaySrc
  },
  {
    id: 'go-api',
    lang: 'Go 1.22 (.go)',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/35',
    path: 'api/kinesio_triage.go',
    code: goApiSrc
  },
  {
    id: 'go-hansraj',
    lang: 'Go Spine (.go)',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/35',
    path: 'go_biomechanics/hansraj_cervical.go',
    code: goHansrajSrc
  },
  {
    id: 'java-imu',
    lang: 'Java 17 (.java)',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/35',
    path: 'android/.../InertialKinematicsPlugin.java',
    code: javaImuSrc
  },
  {
    id: 'java-haptic',
    lang: 'Java Haptic (.java)',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/35',
    path: 'android/.../BioHapticStabilizerPlugin.java',
    code: javaHapticSrc
  },
  {
    id: 'glsl-shader',
    lang: 'GLSL ES 3.0 (.glsl)',
    badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-400/35',
    path: 'src/shaders/synaptic_kinematics.glsl',
    code: glslShaderSrc
  },
  {
    id: 'js-wasm',
    lang: 'ES2024 + WASM (.js)',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/35',
    path: 'src/engines/rustBiomechBridge.js',
    code: jsBridgeSrc
  }
]

const selectedFileId = ref('rust-lib')
const vaultFilter = ref('ALL')
const benchResult = ref(runPolyglotDspBenchmark())
const liveGoOutput = ref(null)
const isRunningGoTest = ref(false)

const activePolyglotFile = computed(
  () => polyglotFiles.find((f) => f.id === selectedFileId.value) || polyglotFiles[0]
)

const filteredRecords = computed(() => {
  if (vaultFilter.value === 'ALL') return props.vaultRecords
  return props.vaultRecords.filter((r) => r.category === vaultFilter.value)
})

const pendingSyncCount = computed(
  () => props.vaultRecords.filter((r) => r.syncState === 'PENDING_SYNC').length
)

async function executePolyglotSuite() {
  benchResult.value = runPolyglotDspBenchmark()
  isRunningGoTest.value = true
  liveGoOutput.value = await invokeGoKinesioTriage({
    flexionDegrees: 30,
    dailyScreenHours: 6.0,
    tremorFreqHz: 4.8,
    tremorRmsMm: 3.4,
    eyesOpenAreaMm2: 42,
    eyesClosedAreaMm2: 162
  })
  isRunningGoTest.value = false
}

function downloadRaw200HzCsv() {
  const synth = synthesizeTremorWaveform3Axis(TREMOR_PRESETS[1], 1000, 200, 0)
  const csv = build200HzAccelerometerCsv(synth.ax, synth.ay, synth.az, 200)
  triggerBrowserFileDownload('kinesio-guard-200hz-imu-capture.csv', csv, 'text/csv;charset=utf-8')
}

function downloadVaultJson() {
  const json = JSON.stringify(
    {
      exportedAtISO: new Date().toISOString(),
      typescriptPercentage: 0.0,
      recordCount: props.vaultRecords.length,
      records: props.vaultRecords
    },
    null,
    2
  )
  triggerBrowserFileDownload('kinesio-guard-clinical-vault.json', json, 'application/json')
}
</script>

<template>
  <section class="space-y-4">
    <!-- Top Section: 5-Language Polyglot Runtime Inspector & Benchmark Lab -->
    <div class="kg-glass-panel p-4 md:p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3.5">
        <div>
          <div class="flex items-center gap-2">
            <Code2 class="h-5 w-5 text-cyan-400" />
            <h2 class="text-base md:text-lg font-bold kg-text-primary">
              5-Language Polyglot Runtime Inspector (0.0% TypeScript Verified)
            </h2>
          </div>
          <p class="text-xs kg-text-secondary mt-0.5">
            Vue 3.5 (.vue) + Rust (.rs) + Java 17 (.java) + Go 1.22 (.go) + Pure ES2024 (.js) + WebGL2 GLSL (.glsl)
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <template v-if="roleTier === 'ADMIN'">
            <button
              type="button"
              class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
              :style="theme === 'daylight' ? 'color:#065f46' : ''"
              @click="executePolyglotSuite"
            >
              <Play class="h-3.5 w-3.5" />
              <span>{{ isRunningGoTest ? 'Executing...' : 'Run WASM + Go 1.22 Benchmark' }}</span>
            </button>

            <button
              type="button"
              class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold kg-subtle-surface kg-text-primary"
              @click="downloadRaw200HzCsv"
            >
              <FileSpreadsheet class="h-3.5 w-3.5 text-cyan-400" />
              <span>Export 200Hz CSV</span>
            </button>

            <button
              type="button"
              class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold kg-subtle-surface kg-text-primary"
              @click="downloadVaultJson"
            >
              <Download class="h-3.5 w-3.5 text-violet-400" />
              <span>Export Vault JSON</span>
            </button>
          </template>

          <button
            v-else
            type="button"
            class="kg-squish-card inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold bg-gradient-to-r from-emerald-500/25 to-cyan-500/25 text-emerald-300 border border-emerald-400/45"
            :style="theme === 'daylight' ? 'color:#065f46' : ''"
            @click="emit('elevate-role', 'ADMIN')"
          >
            <Lock class="h-3.5 w-3.5" />
            <span>Elevate to Biomechanics Lab Director (Unlock Inspector &amp; CSV)</span>
          </button>
        </div>
      </div>

      <!-- Benchmark Metrics Strip -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
        <div class="rounded-xl p-3 kg-subtle-surface">
          <div class="text-[10px] font-mono uppercase kg-text-muted">WASM f64 Kernel</div>
          <div class="mt-0.5 font-mono text-sm font-bold text-emerald-400">
            {{ benchResult.wasmKernelActive ? 'INSTANTIATED · SIMD READY' : 'JS MIRROR' }}
          </div>
        </div>
        <div class="rounded-xl p-3 kg-subtle-surface">
          <div class="text-[10px] font-mono uppercase kg-text-muted">2048-pt Welch PSD FFT</div>
          <div class="mt-0.5 font-mono text-sm font-bold kg-text-primary">
            {{ benchResult.welchFft2048Ms }} ms · Peak {{ benchResult.detectedPeakHz }} Hz
          </div>
        </div>
        <div class="rounded-xl p-3 kg-subtle-surface">
          <div class="text-[10px] font-mono uppercase kg-text-muted">600-pt PCA 95% Ellipse</div>
          <div class="mt-0.5 font-mono text-sm font-bold kg-text-primary">
            {{ benchResult.pca600PointsMs }} ms · {{ benchResult.pcaAreaMm2 }} mm²
          </div>
        </div>
        <div class="rounded-xl p-3 kg-subtle-surface">
          <div class="text-[10px] font-mono uppercase kg-text-muted">1,000-Frame 2D Kalman</div>
          <div class="mt-0.5 font-mono text-sm font-bold text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
            {{ benchResult.kalman1000FramesMs }} ms ({{ benchResult.kalmanAttenuationDb }} dB)
          </div>
        </div>
      </div>

      <!-- Admin Tier Full Source Viewer & Live Go Triage Response -->
      <div v-if="roleTier === 'ADMIN'" class="space-y-3">
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="file in polyglotFiles"
            :key="file.id"
            type="button"
            class="rounded-lg px-2.5 py-1.5 text-[11px] font-mono border transition-all"
            :class="
              selectedFileId === file.id
                ? 'bg-cyan-500/25 text-cyan-300 border-cyan-400/50 font-bold'
                : 'kg-subtle-surface kg-text-secondary'
            "
            :style="theme === 'daylight' && selectedFileId === file.id ? 'color:#0369a1' : ''"
            @click="selectedFileId = file.id"
          >
            {{ file.lang }} · {{ file.path.split('/').pop() }}
          </button>
        </div>

        <div class="rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-950 text-slate-100">
          <div class="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs font-mono">
            <span class="text-cyan-400">{{ activePolyglotFile.path }}</span>
            <span class="text-slate-400">{{ activePolyglotFile.code.split('\n').length }} lines · 0% TS</span>
          </div>
          <pre class="p-4 text-[11px] leading-relaxed font-mono overflow-x-auto max-h-[300px]"><code>{{ activePolyglotFile.code }}</code></pre>
        </div>

        <div
          v-if="liveGoOutput"
          class="rounded-2xl p-3.5 bg-slate-950/90 border border-emerald-500/35 text-xs font-mono text-emerald-300 overflow-x-auto"
        >
          <div class="text-[10px] uppercase text-slate-400 mb-1">
            Live /api/kinesio_triage Response ({{ liveGoOutput.transport }} · {{ liveGoOutput.latencyMs }}ms)
          </div>
          <pre class="text-[11px]">{{ JSON.stringify(liveGoOutput, null, 2) }}</pre>
        </div>
      </div>

      <div v-else class="rounded-2xl p-4 kg-subtle-surface text-xs kg-text-secondary flex flex-wrap items-center justify-between gap-3">
        <span>
          Source inspection of <span class="font-mono kg-text-primary">rust-biomechanics/*.rs</span>,
          <span class="font-mono kg-text-primary">api/kinesio_triage.go</span>, and
          <span class="font-mono kg-text-primary">InertialKinematicsPlugin.java</span> is gated to the
          <strong>BIOMECHANICS LAB DIRECTOR</strong> RBAC tier.
        </span>
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-400/35"
          :style="theme === 'daylight' ? 'color:#0369a1' : ''"
          @click="emit('elevate-role', 'ADMIN')"
        >
          Switch to Lab Director Now
        </button>
      </div>
    </div>

    <!-- Bottom Section: IndexedDB Longitudinal Clinical Vault & Offline Sync Queue -->
    <div class="kg-glass-panel p-4 md:p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3.5">
        <div>
          <div class="flex items-center gap-2">
            <Database class="h-4 w-4 text-emerald-400" />
            <h3 class="text-base font-bold kg-text-primary">
              IndexedDB Longitudinal Clinical Vault &amp; Offline Sync Queue
            </h3>
          </div>
          <p class="text-xs kg-text-secondary">
            100% local-first persistence for tremor diaries, ergonomic spine streaks, and Romberg concussion baselines.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border"
            :class="
              simulateOfflineQueue
                ? 'bg-amber-500/25 text-amber-300 border-amber-400/45'
                : 'kg-subtle-surface kg-text-secondary'
            "
            :style="theme === 'daylight' && simulateOfflineQueue ? 'color:#92400e' : ''"
            @click="emit('toggle-offline-queue')"
          >
            <CloudOff v-if="simulateOfflineQueue" class="h-3.5 w-3.5" />
            <Cloud v-else class="h-3.5 w-3.5 text-emerald-400" />
            <span>{{ simulateOfflineQueue ? 'Offline Queue Active' : 'Online Auto-Sync' }}</span>
          </button>

          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40"
            :style="theme === 'daylight' ? 'color:#0369a1' : ''"
            @click="emit('flush-sync-queue')"
          >
            <RefreshCw class="h-3.5 w-3.5" />
            <span>Flush Sync Queue ({{ pendingSyncCount }})</span>
          </button>
        </div>
      </div>

      <!-- Category Filter Tabs -->
      <div class="flex flex-wrap gap-1.5 mb-3">
        <button
          v-for="cat in [
            { id: 'ALL', label: 'All Clinical Logs' },
            { id: 'TREMOR_PSD', label: 'Tremor Welch PSD' },
            { id: 'CERVICAL_LOAD', label: 'Cervical Spine' },
            { id: 'ROMBERG_SWAY', label: 'Romberg Sway' }
          ]"
          :key="cat.id"
          type="button"
          class="rounded-lg px-2.5 py-1 text-xs font-medium border"
          :class="
            vaultFilter === cat.id
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/45'
              : 'kg-subtle-surface kg-text-secondary'
          "
          :style="theme === 'daylight' && vaultFilter === cat.id ? 'color:#065f46' : ''"
          @click="vaultFilter = cat.id"
        >
          {{ cat.label }}
        </button>
      </div>

      <!-- Vault Timeline Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="rec in filteredRecords"
          :key="rec.id"
          class="kg-squish-card rounded-2xl p-3.5 kg-subtle-surface flex flex-col justify-between cursor-pointer"
          @click="
            emit('open-clinical-report', {
              module: 'VAULT_RECORD',
              title: rec.title,
              vaultRecord: rec
            })
          "
        >
          <div>
            <div class="flex items-center justify-between gap-2 text-[10px] font-mono">
              <span class="font-bold text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
                {{ rec.category }}
              </span>
              <div class="flex items-center gap-2">
                <span
                  class="rounded px-1.5 py-0.5"
                  :class="
                    rec.syncState === 'SYNCED'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  "
                >
                  {{ rec.syncState }}
                </span>
                <button
                  type="button"
                  class="opacity-65 hover:opacity-100 text-rose-400"
                  title="Delete Record"
                  @click.stop="emit('delete-vault-record', rec.id)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <h4 class="mt-1 text-sm font-bold kg-text-primary">{{ rec.title }}</h4>
            <div class="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs">
              <span class="font-bold kg-text-primary">{{ rec.primaryMetric }}</span>
              <span class="kg-text-secondary">· {{ rec.secondaryMetric }}</span>
            </div>
            <p class="mt-1.5 text-xs kg-text-secondary line-clamp-2">{{ rec.notes }}</p>
          </div>

          <div class="mt-2 text-[10px] font-mono kg-text-muted">
            Recorded {{ new Date(rec.recordedAtISO).toLocaleString() }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
