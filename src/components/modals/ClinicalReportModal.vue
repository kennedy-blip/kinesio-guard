<script setup>
import { watch } from 'vue'
import { FileText, Download, Code2, X, Activity } from 'lucide-vue-next'
import { useSpringValue } from '../../composables/useSpringPhysics.js'
import { triggerBrowserFileDownload } from '../../db/kinesioDb.js'

const props = defineProps({
  reportData: { type: Object, default: null },
  theme: { type: String, default: 'obsidian' }
})

const emit = defineEmits(['close', 'jump-to-polyglot'])

const morphScale = useSpringValue(0.88, { stiffness: 320, damping: 25, mass: 0.8 })

watch(
  () => props.reportData,
  (val) => {
    if (val) {
      morphScale.setTarget(0.88, true)
      requestAnimationFrame(() => {
        morphScale.setTarget(1.0)
      })
    }
  }
)

function exportClinicalReportJson() {
  if (!props.reportData) return
  const payload = JSON.stringify(
    {
      generatedAtISO: new Date().toISOString(),
      system: 'KINESIO-GUARD Polyglot Biomechanics Lab v1.0.0',
      zeroTypeScriptVerified: true,
      report: props.reportData
    },
    null,
    2
  )
  triggerBrowserFileDownload('kinesio-guard-clinical-report.json', payload, 'application/json')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="reportData"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4"
      @click.self="emit('close')"
    >
      <div
        class="kg-glass-panel kg-strong-surface w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 md:p-6 space-y-4"
        :style="{ transform: `scale(${morphScale.current.value.toFixed(3)})` }"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 border border-cyan-400/40">
              <FileText class="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <span class="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
                {{ reportData.module }} · SHARED CONTAINER CLINICAL REPORT
              </span>
              <h2 class="text-base md:text-lg font-bold kg-text-primary">
                {{ reportData.title }}
              </h2>
            </div>
          </div>

          <button
            type="button"
            class="rounded-xl p-2 kg-subtle-surface kg-text-secondary hover:opacity-100"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- Module-Specific Biomechanical Readouts -->
        <div v-if="reportData.spectrum" class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div class="rounded-xl p-3 kg-subtle-surface">
            <div class="text-[10px] font-mono kg-text-muted">Dominant Peak</div>
            <div class="mt-0.5 font-mono text-base font-bold text-cyan-400">
              {{ reportData.spectrum.dominantFreqHz }} Hz
            </div>
          </div>
          <div class="rounded-xl p-3 kg-subtle-surface">
            <div class="text-[10px] font-mono kg-text-muted">RMS Amplitude</div>
            <div class="mt-0.5 font-mono text-base font-bold kg-text-primary">
              {{ reportData.spectrum.rmsDisplacementMm }} mm
            </div>
          </div>
          <div class="rounded-xl p-3 kg-subtle-surface">
            <div class="text-[10px] font-mono kg-text-muted">MDS-UPDRS Score</div>
            <div class="mt-0.5 font-mono text-base font-bold text-amber-400">
              {{ reportData.spectrum.mdsUpdrsScore }} / 4.0
            </div>
          </div>
          <div class="rounded-xl p-3 kg-subtle-surface">
            <div class="text-[10px] font-mono kg-text-muted">Narrowband Q</div>
            <div class="mt-0.5 font-mono text-base font-bold kg-text-primary">
              {{ reportData.spectrum.narrowbandQ }}
            </div>
          </div>
        </div>

        <div v-if="reportData.cervical" class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div class="rounded-xl p-3 kg-subtle-surface">
            <div class="text-[10px] font-mono kg-text-muted">Cranial Flexion θ</div>
            <div class="mt-0.5 font-mono text-base font-bold text-cyan-400">
              {{ reportData.cervical.flexionDegrees }}°
            </div>
          </div>
          <div class="rounded-xl p-3 kg-subtle-surface">
            <div class="text-[10px] font-mono kg-text-muted">C5–C7 Effective Load</div>
            <div class="mt-0.5 font-mono text-base font-bold kg-text-primary">
              {{ reportData.cervical.effectiveLoadLbs }} lbs ({{ Math.round(reportData.cervical.compressiveForceNewtons) }} N)
            </div>
          </div>
          <div class="rounded-xl p-3 kg-subtle-surface">
            <div class="text-[10px] font-mono kg-text-muted">Bending Torque</div>
            <div class="mt-0.5 font-mono text-base font-bold text-violet-400">
              {{ reportData.cervical.cervicalTorqueNm }} N·m
            </div>
          </div>
          <div class="rounded-xl p-3 kg-subtle-surface">
            <div class="text-[10px] font-mono kg-text-muted">Daily Disc Dose</div>
            <div class="mt-0.5 font-mono text-base font-bold text-emerald-400">
              {{ reportData.cervical.dailyCompressionTonHrs }} Ton-Hrs
            </div>
          </div>
        </div>

        <div v-if="reportData.openMetrics && reportData.closedMetrics" class="grid grid-cols-3 gap-2.5 text-xs">
          <div class="rounded-xl p-3 kg-subtle-surface">
            <div class="text-[10px] font-mono kg-text-muted">Eyes-Open 95% Area</div>
            <div class="mt-0.5 font-mono text-base font-bold text-cyan-400">
              {{ reportData.openMetrics.areaMm2 }} mm²
            </div>
          </div>
          <div class="rounded-xl p-3 kg-subtle-surface">
            <div class="text-[10px] font-mono kg-text-muted">Eyes-Closed 95% Area</div>
            <div class="mt-0.5 font-mono text-base font-bold text-rose-400">
              {{ reportData.closedMetrics.areaMm2 }} mm²
            </div>
          </div>
          <div class="rounded-xl p-3 kg-subtle-surface">
            <div class="text-[10px] font-mono kg-text-muted">Romberg Quotient</div>
            <div class="mt-0.5 font-mono text-base font-bold kg-text-primary">
              RQ {{ reportData.rombergQuotient }}
            </div>
          </div>
        </div>

        <div v-if="reportData.vaultRecord" class="rounded-2xl p-4 kg-subtle-surface text-xs space-y-1.5">
          <div class="font-mono font-bold text-cyan-400">{{ reportData.vaultRecord.primaryMetric }}</div>
          <div class="font-mono kg-text-secondary">{{ reportData.vaultRecord.secondaryMetric }}</div>
          <p class="kg-text-primary">{{ reportData.vaultRecord.notes }}</p>
        </div>

        <!-- 5-Language Polyglot Execution Pipeline Trace -->
        <div class="rounded-2xl p-4 kg-subtle-surface space-y-2">
          <div class="flex items-center gap-2 text-xs font-bold kg-text-primary">
            <Activity class="h-4 w-4 text-emerald-400" />
            <span>5-Language Polyglot Biomechanical Pipeline Execution Trace</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
            <div class="rounded-xl p-2.5 kg-strong-surface">
              <span class="text-amber-400">1. Java 17 IMU:</span> InertialKinematicsPlugin @ 200Hz
            </div>
            <div class="rounded-xl p-2.5 kg-strong-surface">
              <span class="text-orange-400">2. Rust + WASM:</span> Welch 2048-FFT · PCA χ²=5.991
            </div>
            <div class="rounded-xl p-2.5 kg-strong-surface">
              <span class="text-cyan-400">3. Go 1.22 API:</span> Hansraj C1–C7 N/lbs &amp; UPDRS
            </div>
            <div class="rounded-xl p-2.5 kg-strong-surface">
              <span class="text-violet-400">4. GLSL + Vue 3.5:</span> 60fps Tensor Shader &amp; Springs
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold kg-subtle-surface kg-text-primary"
            @click="emit('jump-to-polyglot')"
          >
            <Code2 class="h-4 w-4 text-cyan-400" />
            <span>Open 5-Language Polyglot Inspector</span>
          </button>

          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-emerald-500"
            @click="exportClinicalReportJson"
          >
            <Download class="h-4 w-4" />
            <span>Download Clinical JSON Report</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
