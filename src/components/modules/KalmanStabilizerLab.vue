<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Crosshair, Shield, Sparkles, Target, RotateCcw } from 'lucide-vue-next'
import { KalmanAntiTremorEngine2D } from '../../engines/rustBiomechBridge.js'
import { useSpring2D } from '../../composables/useSpringPhysics.js'

const props = defineProps({
  theme: { type: String, default: 'obsidian' },
  liveImuSample: { type: Object, default: () => ({ ax: 0, ay: 0, az: 0, active: false }) }
})

const injectedFreqHz = ref(5.5)
const tremorAmplitudeMm = ref(3.2)
const kalmanGainPct = ref(94)
const finePrintSizePx = ref(12)
const useLiveImuShake = ref(false)

const kalmanEngine = new KalmanAntiTremorEngine2D()
const rawShakePx = ref({ x: 0, y: 0 })
const residualSpring = useSpring2D(0, 0, { stiffness: 340, damping: 26, mass: 0.75 })
const liveTelemetry = ref({
  attenuationDb: -18.4,
  cancelledPct: 88,
  counterXMm: 0,
  counterYMm: 0
})

// Dexterity Micro-Target Trainer State
const targetPadKeys = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6']
const activeTargetKey = ref('B2')
const unstabilizedHits = ref(0)
const unstabilizedTries = ref(0)
const stabilizedHits = ref(0)
const stabilizedTries = ref(0)

const freqPresets = [
  { hz: 4.8, label: '4.8 Hz Parkinsonian' },
  { hz: 5.5, label: '5.5 Hz Postural/Rest' },
  { hz: 7.5, label: '7.5 Hz Essential' },
  { hz: 11.5, label: '11.5 Hz Fine Jitter' }
]

const unstabilizedAccuracyPct = computed(() =>
  unstabilizedTries.value === 0
    ? 0
    : Math.round((unstabilizedHits.value / unstabilizedTries.value) * 100)
)

const stabilizedAccuracyPct = computed(() =>
  stabilizedTries.value === 0
    ? 0
    : Math.round((stabilizedHits.value / stabilizedTries.value) * 100)
)

let rafId = null
let lastFrameMs = 0
let phaseTime = 0

function pickNextTarget() {
  const others = targetPadKeys.filter((k) => k !== activeTargetKey.value)
  activeTargetKey.value = others[Math.floor(Math.random() * others.length)]
}

function handlePadTap(pane, key) {
  if (pane === 'raw') {
    unstabilizedTries.value++
    if (key === activeTargetKey.value) {
      unstabilizedHits.value++
      pickNextTarget()
    }
  } else {
    stabilizedTries.value++
    if (key === activeTargetKey.value) {
      stabilizedHits.value++
      pickNextTarget()
    }
  }
}

function resetDexterityStats() {
  unstabilizedHits.value = 0
  unstabilizedTries.value = 0
  stabilizedHits.value = 0
  stabilizedTries.value = 0
}

function stepStabilizerLoop(now) {
  if (!lastFrameMs) lastFrameMs = now
  const dtSec = Math.min(0.033, Math.max(0.005, (now - lastFrameMs) / 1000))
  lastFrameMs = now
  phaseTime += dtSec

  let handXMm = 0
  let handYMm = 0

  if (useLiveImuShake.value && props.liveImuSample?.active) {
    handXMm = Math.max(-8, Math.min(8, props.liveImuSample.ax * 1.45))
    handYMm = Math.max(-8, Math.min(8, props.liveImuSample.ay * 1.45))
  } else {
    const w = 2 * Math.PI * injectedFreqHz.value
    const amp = tremorAmplitudeMm.value
    handXMm =
      amp * Math.sin(w * phaseTime) +
      amp * 0.24 * Math.sin(2 * w * phaseTime + 0.6) +
      0.18 * Math.cos(phaseTime * 29.0)
    handYMm =
      amp * 0.82 * Math.cos(w * phaseTime + 0.45) +
      amp * 0.19 * Math.sin(w * 1.5 * phaseTime)
  }

  const gain = kalmanGainPct.value / 100
  const kfOut = kalmanEngine.update(handXMm, handYMm, dtSec, gain)

  // Convert physical mm tremor to CSS pixels (~3.8 px per mm on typical display density)
  const MM_TO_PX = 3.8
  rawShakePx.value = {
    x: Number((kfOut.rawXMm * MM_TO_PX).toFixed(2)),
    y: Number((kfOut.rawYMm * MM_TO_PX).toFixed(2))
  }

  // Stabilized view experiences (raw hand tremor + inverse-phase Kalman counter-shift)
  residualSpring.setTarget2D(kfOut.residualXMm * MM_TO_PX, kfOut.residualYMm * MM_TO_PX)

  liveTelemetry.value = {
    attenuationDb: kfOut.attenuationDb,
    cancelledPct: kfOut.cancelledPct,
    counterXMm: Number(kfOut.counterXMm.toFixed(2)),
    counterYMm: Number(kfOut.counterYMm.toFixed(2))
  }

  rafId = requestAnimationFrame(stepStabilizerLoop)
}

onMounted(() => {
  rafId = requestAnimationFrame(stepStabilizerLoop)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <section class="space-y-4">
    <!-- Top Control Panel -->
    <div class="kg-glass-panel p-4 md:p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-400 border border-cyan-400/35">
              RUST WASM 2D KALMAN · INVERSE-PHASE (-Δx, -Δy)
            </span>
            <h2 class="text-base md:text-lg font-bold kg-text-primary">
              Kalman Active Anti-Tremor Assistive Reader &amp; Dexterity Trainer
            </h2>
          </div>
          <p class="text-xs kg-text-secondary mt-0.5">
            Predicts instantaneous 2D hand shake at 60 FPS and shifts the stabilized lens in exact opposite phase so fine print stays steady.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <div class="rounded-xl px-3 py-1.5 kg-subtle-surface text-xs font-mono">
            <span class="kg-text-muted mr-1.5">Attenuation:</span>
            <span class="font-bold text-emerald-400">
              {{ liveTelemetry.attenuationDb }} dB ({{ liveTelemetry.cancelledPct }}% Cancelled)
            </span>
          </div>

          <button
            type="button"
            class="kg-squish-card rounded-xl px-3 py-2 text-xs font-semibold border"
            :class="
              useLiveImuShake
                ? 'bg-cyan-500/25 text-cyan-300 border-cyan-400/45'
                : 'kg-subtle-surface kg-text-secondary'
            "
            @click="useLiveImuShake = !useLiveImuShake"
          >
            {{ useLiveImuShake ? 'Using Live IMU Shake' : 'Injected Tremor Generator' }}
          </button>
        </div>
      </div>

      <!-- Frequency Presets & Tuning Sliders -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <button
          v-for="fp in freqPresets"
          :key="fp.hz"
          type="button"
          class="kg-squish-card rounded-xl p-2.5 text-left border text-xs font-semibold transition-all"
          :class="
            injectedFreqHz === fp.hz && !useLiveImuShake
              ? 'bg-cyan-500/20 border-cyan-400/55 kg-text-primary'
              : 'kg-subtle-surface kg-text-secondary'
          "
          @click="
            useLiveImuShake = false;
            injectedFreqHz = fp.hz
          "
        >
          {{ fp.label }}
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div class="flex justify-between text-xs font-semibold mb-1">
            <span class="kg-text-secondary">Hand Shake Amplitude</span>
            <span class="font-mono kg-text-primary">{{ tremorAmplitudeMm.toFixed(1) }} mm</span>
          </div>
          <input
            v-model.number="tremorAmplitudeMm"
            type="range"
            min="0.4"
            max="5.5"
            step="0.1"
            class="kg-range w-full"
          />
        </div>

        <div>
          <div class="flex justify-between text-xs font-semibold mb-1">
            <span class="kg-text-secondary">Kalman Inverse-Phase Gain</span>
            <span class="font-mono text-emerald-400">{{ kalmanGainPct }}%</span>
          </div>
          <input
            v-model.number="kalmanGainPct"
            type="range"
            min="0"
            max="100"
            step="2"
            class="kg-range w-full"
          />
        </div>

        <div>
          <div class="flex justify-between text-xs font-semibold mb-1">
            <span class="kg-text-secondary">Fine-Print Clinical Typography</span>
            <span class="font-mono kg-text-primary">{{ finePrintSizePx }} px</span>
          </div>
          <input
            v-model.number="finePrintSizePx"
            type="range"
            min="10"
            max="16"
            step="1"
            class="kg-range w-full"
          />
        </div>
      </div>
    </div>

    <!-- Split-Screen Live Comparison: Unstabilized Shaking View vs. Kalman Active Stabilized View -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- LEFT PANE: Unstabilized Shaking View -->
      <div class="kg-glass-panel p-4 md:p-5 overflow-hidden">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Crosshair class="h-4 w-4 text-rose-400" />
            <h3 class="text-sm font-bold kg-text-primary">Unstabilized Shaking View</h3>
          </div>
          <span class="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-rose-400 border border-rose-400/30">
            RAW SHAKE ({{ injectedFreqHz }} Hz)
          </span>
        </div>

        <div class="relative rounded-2xl p-5 kg-subtle-surface min-h-[290px] flex flex-col justify-between overflow-hidden">
          <div
            class="space-y-3 will-change-transform"
            :style="{
              transform: `translate3d(${rawShakePx.x}px, ${rawShakePx.y}px, 0)`
            }"
          >
            <div class="rounded-xl p-3.5 kg-strong-surface border border-rose-400/25">
              <div class="text-[10px] font-mono uppercase tracking-wider text-rose-400 mb-1">
                Ophthalmic &amp; Neurologic Micro-Label · Rx #409-B
              </div>
              <p class="leading-relaxed kg-text-primary" :style="{ fontSize: `${finePrintSizePx}px` }">
                <strong>Carbidopa / Levodopa 25–100 mg:</strong> Administer 1 tablet orally every
                6 hours. Verify decimal micro-dosage carefully (`0.25 mg` vs `2.5 mg`) prior to
                dispensing. Without inverse-phase cancellation, `4–9 Hz` postural oscillation blurs
                retinal foveation on small glyphs.
              </p>
            </div>

            <!-- Precision Micro-Target Tap Matrix (Shaking) -->
            <div>
              <div class="flex items-center justify-between text-[11px] font-mono mb-1.5 kg-text-secondary">
                <span>Tap Highlighted Target: <strong class="text-amber-400">{{ activeTargetKey }}</strong></span>
                <span>Hits: {{ unstabilizedHits }}/{{ unstabilizedTries }} ({{ unstabilizedAccuracyPct }}%)</span>
              </div>
              <div class="grid grid-cols-6 gap-1.5">
                <button
                  v-for="k in targetPadKeys"
                  :key="`raw-${k}`"
                  type="button"
                  class="rounded-lg py-2 text-xs font-mono font-bold border transition-colors"
                  :class="
                    k === activeTargetKey
                      ? 'bg-amber-500/30 text-amber-300 border-amber-400/60'
                      : 'kg-strong-surface kg-text-secondary border-white/10'
                  "
                  :style="theme === 'daylight' && k === activeTargetKey ? 'color:#92400e' : ''"
                  @click="handlePadTap('raw', k)"
                >
                  {{ k }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT PANE: Kalman Active Stabilized View -->
      <div class="kg-glass-panel p-4 md:p-5 overflow-hidden">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Shield class="h-4 w-4 text-emerald-400" />
            <h3 class="text-sm font-bold kg-text-primary">Kalman Active Stabilized View</h3>
          </div>
          <span class="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-400/35">
            COUNTER-SHIFT ({{ liveTelemetry.counterXMm }}, {{ liveTelemetry.counterYMm }} mm)
          </span>
        </div>

        <div class="relative rounded-2xl p-5 kg-subtle-surface min-h-[290px] flex flex-col justify-between overflow-hidden">
          <div
            class="space-y-3 will-change-transform"
            :style="{
              transform: `translate3d(${residualSpring.x.value.toFixed(2)}px, ${residualSpring.y.value.toFixed(2)}px, 0)`
            }"
          >
            <div class="rounded-xl p-3.5 kg-strong-surface border border-emerald-400/35">
              <div class="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-emerald-400 mb-1">
                <span>Kalman Phase-Locked Stabilization Lens</span>
                <Sparkles class="h-3.5 w-3.5" />
              </div>
              <p class="leading-relaxed kg-text-primary" :style="{ fontSize: `${finePrintSizePx}px` }">
                <strong>Carbidopa / Levodopa 25–100 mg:</strong> Administer 1 tablet orally every
                6 hours. Verify decimal micro-dosage carefully (`0.25 mg` vs `2.5 mg`) prior to
                dispensing. Inverse-phase state estimation (`-Δx, -Δy`) locks glyph coordinates on
                the user's fovea during active hand tremor!
              </p>
            </div>

            <!-- Precision Micro-Target Tap Matrix (Kalman Stabilized) -->
            <div>
              <div class="flex items-center justify-between text-[11px] font-mono mb-1.5 kg-text-secondary">
                <span class="inline-flex items-center gap-1">
                  <Target class="h-3.5 w-3.5 text-emerald-400" />
                  Tap Target: <strong class="text-emerald-400">{{ activeTargetKey }}</strong>
                </span>
                <span class="inline-flex items-center gap-2">
                  <span>Hits: {{ stabilizedHits }}/{{ stabilizedTries }} ({{ stabilizedAccuracyPct }}%)</span>
                  <button
                    type="button"
                    class="opacity-75 hover:opacity-100"
                    title="Reset Tap Accuracy"
                    @click="resetDexterityStats"
                  >
                    <RotateCcw class="h-3 w-3" />
                  </button>
                </span>
              </div>
              <div class="grid grid-cols-6 gap-1.5">
                <button
                  v-for="k in targetPadKeys"
                  :key="`stab-${k}`"
                  type="button"
                  class="rounded-lg py-2 text-xs font-mono font-bold border transition-colors"
                  :class="
                    k === activeTargetKey
                      ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400/60'
                      : 'kg-strong-surface kg-text-secondary border-white/10'
                  "
                  :style="theme === 'daylight' && k === activeTargetKey ? 'color:#065f46' : ''"
                  @click="handlePadTap('stab', k)"
                >
                  {{ k }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
