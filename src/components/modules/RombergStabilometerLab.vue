<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  Compass,
  Eye,
  EyeOff,
  Play,
  Save,
  Maximize2,
  AlertTriangle,
  CheckCircle2
} from 'lucide-vue-next'
import { useSpring2D } from '../../composables/useSpringPhysics.js'
import { emitBioHapticFeedback } from '../../engines/sensorFusionEngine.js'
import {
  ROMBERG_PRESETS,
  generateRombergSwaySeries,
  computeRombergPcaMetrics
} from '../../engines/rustBiomechBridge.js'

const props = defineProps({
  theme: { type: String, default: 'obsidian' },
  deviceRollDeg: { type: Number, default: null },
  devicePitchDeg: { type: Number, default: null }
})

const emit = defineEmits([
  'romberg-updated',
  'open-clinical-report',
  'save-to-vault'
])

const selectedPresetId = ref('healthy')
const viewLayer = ref('both') // 'both' | 'open' | 'closed'
const protocolPhase = ref('idle') // 'idle' | 'eyes-open-15s' | 'eyes-closed-15s'
const phaseTimerSec = ref(0)
const savedToast = ref(false)

const polarCanvasRef = ref(null)
const crosshairSpring = useSpring2D(0, 0, { stiffness: 320, damping: 25, mass: 0.8 })

const openSeries = ref({ ml: new Float64Array(0), ap: new Float64Array(0) })
const closedSeries = ref({ ml: new Float64Array(0), ap: new Float64Array(0) })
const openMetrics = ref(null)
const closedMetrics = ref(null)

const activePreset = computed(
  () => ROMBERG_PRESETS.find((p) => p.id === selectedPresetId.value) || ROMBERG_PRESETS[0]
)

const rombergQuotient = computed(() => {
  if (!openMetrics.value || !closedMetrics.value) return 1.35
  const rq = closedMetrics.value.areaMm2 / Math.max(4, openMetrics.value.areaMm2)
  return Number(rq.toFixed(2))
})

const clinicalAlertStatus = computed(() => {
  const closedArea = closedMetrics.value?.areaMm2 || 0
  const rq = rombergQuotient.value
  if (closedArea > 260 || rq > 3.2) {
    return {
      tier: 'SIDELINE CONCUSSION / FALL-RISK ALERT',
      color: 'rose',
      detail: 'Elevated 95% CoP sway ellipse (>260 mm²) or Romberg Quotient >3.20.'
    }
  }
  if (closedArea > 125 || rq > 2.1) {
    return {
      tier: 'GUARDED SENSORY STABILITY',
      color: 'amber',
      detail: 'Moderate visual-proprioceptive sway amplification; monitor postural recovery.'
    }
  }
  return {
    tier: 'LOW FALL RISK · INTEGRATED EQUILIBRIUM',
    color: 'emerald',
    detail: 'Center-of-Pressure excursion remains tightly bounded within 15 mm radius.'
  }
})

let rafId = null
let protocolTimer = null
let animStep = 0

function applyRombergPreset(presetId) {
  selectedPresetId.value = presetId
  const p = ROMBERG_PRESETS.find((item) => item.id === presetId) || ROMBERG_PRESETS[0]
  const open = generateRombergSwaySeries(p, false, 450, 15)
  const closed = generateRombergSwaySeries(p, true, 450, 15)
  openSeries.value = open
  closedSeries.value = closed
  openMetrics.value = computeRombergPcaMetrics(open.ml, open.ap, 15)
  closedMetrics.value = computeRombergPcaMetrics(closed.ml, closed.ap, 15)

  emit('romberg-updated', {
    eyesOpenAreaMm2: openMetrics.value.areaMm2,
    eyesClosedAreaMm2: closedMetrics.value.areaMm2,
    rombergQuotient: Number(
      (closedMetrics.value.areaMm2 / Math.max(4, openMetrics.value.areaMm2)).toFixed(2)
    )
  })
}

function startGuided30sRombergProtocol() {
  if (protocolTimer) clearInterval(protocolTimer)
  protocolPhase.value = 'eyes-open-15s'
  phaseTimerSec.value = 15.0
  const liveOpenMl = []
  const liveOpenAp = []
  const liveClosedMl = []
  const liveClosedAp = []

  protocolTimer = setInterval(() => {
    phaseTimerSec.value = Number(Math.max(0, phaseTimerSec.value - 0.1).toFixed(1))

    // Sample sternum tilt IMU if present, otherwise sample active preset kinematics
    const t = 15 - phaseTimerSec.value
    const p = activePreset.value
    const hasDeviceTilt = props.deviceRollDeg !== null && props.devicePitchDeg !== null

    if (protocolPhase.value === 'eyes-open-15s') {
      const mlVal = hasDeviceTilt
        ? 210 * Math.sin((props.deviceRollDeg * Math.PI) / 180)
        : p.openRmsMl * 1.25 * Math.sin(2 * Math.PI * p.freqMl * t)
      const apVal = hasDeviceTilt
        ? 210 * Math.sin(((props.devicePitchDeg - 15) * Math.PI) / 180)
        : p.openRmsAp * 1.25 * Math.cos(2 * Math.PI * p.freqAp * t)
      liveOpenMl.push(mlVal)
      liveOpenAp.push(apVal)

      if (phaseTimerSec.value <= 0) {
        protocolPhase.value = 'eyes-closed-15s'
        phaseTimerSec.value = 15.0
        emitBioHapticFeedback('romberg-transition')
      }
    } else if (protocolPhase.value === 'eyes-closed-15s') {
      const mlVal = hasDeviceTilt
        ? 210 * Math.sin((props.deviceRollDeg * Math.PI) / 180)
        : p.closedRmsMl * 1.25 * Math.sin(2 * Math.PI * p.freqMl * t) + p.driftMl * (t / 15)
      const apVal = hasDeviceTilt
        ? 210 * Math.sin(((props.devicePitchDeg - 15) * Math.PI) / 180)
        : p.closedRmsAp * 1.25 * Math.cos(2 * Math.PI * p.freqAp * t) + p.driftAp * (t / 15)
      liveClosedMl.push(mlVal)
      liveClosedAp.push(apVal)

      if (phaseTimerSec.value <= 0) {
        clearInterval(protocolTimer)
        protocolTimer = null
        protocolPhase.value = 'idle'
        emitBioHapticFeedback('romberg-complete')
        if (liveOpenMl.length >= 20 && liveClosedMl.length >= 20) {
          openSeries.value = { ml: Float64Array.from(liveOpenMl), ap: Float64Array.from(liveOpenAp) }
          closedSeries.value = { ml: Float64Array.from(liveClosedMl), ap: Float64Array.from(liveClosedAp) }
          openMetrics.value = computeRombergPcaMetrics(openSeries.value.ml, openSeries.value.ap, 15)
          closedMetrics.value = computeRombergPcaMetrics(closedSeries.value.ml, closedSeries.value.ap, 15)
        }
      }
    }
  }, 100)
}

function saveRombergLog() {
  if (!openMetrics.value || !closedMetrics.value) return
  emit('save-to-vault', {
    category: 'ROMBERG_SWAY',
    title: `Romberg Stabilometry — ${activePreset.value.shortLabel}`,
    primaryMetric: `${closedMetrics.value.areaMm2} mm² Closed · RQ ${rombergQuotient.value}`,
    secondaryMetric: `Open: ${openMetrics.value.areaMm2} mm² · Vel: ${closedMetrics.value.velocityMmPerS} mm/s`,
    notes: clinicalAlertStatus.value.detail,
    payload: {
      eyesOpenAreaMm2: openMetrics.value.areaMm2,
      eyesClosedAreaMm2: closedMetrics.value.areaMm2,
      rombergQuotient: rombergQuotient.value,
      velocityMmPerS: closedMetrics.value.velocityMmPerS
    }
  })
  savedToast.value = true
  setTimeout(() => {
    savedToast.value = false
  }, 2200)
}

function openDetailedReport() {
  emit('open-clinical-report', {
    module: 'ROMBERG_STABILOMETER',
    title: 'Vestibular Romberg PCA 95% Confidence Ellipse Report',
    openMetrics: openMetrics.value,
    closedMetrics: closedMetrics.value,
    rombergQuotient: rombergQuotient.value,
    alertStatus: clinicalAlertStatus.value
  })
}

function drawPolarStatokinesigram() {
  const canvas = polarCanvasRef.value
  if (!canvas || !openMetrics.value || !closedMetrics.value) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  const cx = w / 2
  const cy = h / 2
  const mmToPx = Math.min(w, h) / 62 // +/- 31 mm range

  ctx.clearRect(0, 0, w, h)
  const isLight = props.theme === 'daylight'

  // Polar concentric target rings (10mm, 20mm, 28mm)
  for (const rMm of [8, 16, 24]) {
    ctx.beginPath()
    ctx.arc(cx, cy, rMm * mmToPx, 0, Math.PI * 2)
    ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.11)' : 'rgba(148, 163, 184, 0.16)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = isLight ? '#64748b' : '#94a3b8'
    ctx.font = '9px ui-monospace, monospace'
    ctx.fillText(`${rMm}mm`, cx + rMm * mmToPx + 3, cy - 3)
  }

  // Orthogonal AP / ML axes
  ctx.beginPath()
  ctx.moveTo(cx, 12)
  ctx.lineTo(cx, h - 12)
  ctx.moveTo(12, cy)
  ctx.lineTo(w - 12, cy)
  ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(148, 163, 184, 0.18)'
  ctx.stroke()

  ctx.fillStyle = isLight ? '#334155' : '#cbd5e1'
  ctx.font = 'bold 10px ui-monospace, monospace'
  ctx.fillText('ANTERIOR (+AP)', cx - 42, 20)
  ctx.fillText('POSTERIOR (-AP)', cx - 44, h - 10)
  ctx.fillText('-ML', 14, cy - 5)
  ctx.fillText('+ML', w - 34, cy - 5)

  const renderTraceAndEllipse = (series, pca, traceColor, fillAlpha, strokeColor) => {
    const len = series.ml.length
    if (len < 3) return

    ctx.beginPath()
    for (let i = 0; i < len; i++) {
      const px = cx + series.ml[i] * mmToPx
      const py = cy - series.ap[i] * mmToPx
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.strokeStyle = traceColor
    ctx.lineWidth = 1.45
    ctx.stroke()

    // PCA 95% Confidence Ellipse
    ctx.save()
    ctx.translate(cx + pca.centroidMlMm * mmToPx, cy - pca.centroidApMm * mmToPx)
    ctx.rotate((-pca.orientationDeg * Math.PI) / 180)
    ctx.beginPath()
    ctx.ellipse(
      0,
      0,
      Math.max(2, pca.semiMajorMm * mmToPx),
      Math.max(2, pca.semiMinorMm * mmToPx),
      0,
      0,
      Math.PI * 2
    )
    ctx.fillStyle = fillAlpha
    ctx.fill()
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 2.2
    ctx.stroke()
    ctx.restore()
  }

  if (viewLayer.value === 'both' || viewLayer.value === 'closed') {
    renderTraceAndEllipse(
      closedSeries.value,
      closedMetrics.value,
      'rgba(244, 63, 94, 0.48)',
      'rgba(244, 63, 94, 0.14)',
      '#f43f5e'
    )
  }

  if (viewLayer.value === 'both' || viewLayer.value === 'open') {
    renderTraceAndEllipse(
      openSeries.value,
      openMetrics.value,
      'rgba(6, 182, 212, 0.62)',
      'rgba(6, 182, 212, 0.16)',
      '#06b6d4'
    )
  }

  // Live Spring-Physics Center-of-Pressure Crosshair
  const liveX = cx + crosshairSpring.x.value * mmToPx
  const liveY = cy - crosshairSpring.y.value * mmToPx
  ctx.fillStyle = '#10b981'
  ctx.beginPath()
  ctx.arc(liveX, liveY, 5.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.8
  ctx.stroke()
}

function loop60Fps() {
  animStep = (animStep + 1) % 450
  const activeTrace = viewLayer.value === 'open' ? openSeries.value : closedSeries.value
  if (activeTrace.ml.length > 0) {
    const idx = animStep % activeTrace.ml.length
    crosshairSpring.setTarget2D(activeTrace.ml[idx], activeTrace.ap[idx])
  }
  drawPolarStatokinesigram()
  rafId = requestAnimationFrame(loop60Fps)
}

watch(
  () => props.theme,
  () => drawPolarStatokinesigram()
)

onMounted(() => {
  applyRombergPreset('healthy')
  rafId = requestAnimationFrame(loop60Fps)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (protocolTimer) clearInterval(protocolTimer)
})
</script>

<template>
  <section class="space-y-4">
    <!-- Header & 4 Instant Clinical Posturography Presets -->
    <div class="kg-glass-panel p-4 md:p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3.5">
        <div>
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-violet-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-violet-300 border border-violet-400/35" :style="theme === 'daylight' ? 'color:#5b21b6' : ''">
              RUST WASM PCA · 95% ELLIPSE
            </span>
            <h2 class="text-base md:text-lg font-bold kg-text-primary">
              Vestibular Concussion &amp; Fall-Risk Romberg Stabilometer
            </h2>
          </div>
          <p class="text-xs kg-text-secondary mt-0.5">
            Hold phone against sternum for 15s Eyes-Open vs. 15s Eyes-Closed or inspect clinical posturography presets.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border"
            :class="
              protocolPhase !== 'idle'
                ? 'bg-amber-500/25 text-amber-300 border-amber-400/45 animate-pulse'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
            "
            :style="theme === 'daylight' ? 'color:#065f46' : ''"
            @click="startGuided30sRombergProtocol"
          >
            <Play class="h-3.5 w-3.5" />
            <span v-if="protocolPhase === 'eyes-open-15s'">Eyes Open Sternum Hold: {{ phaseTimerSec }}s</span>
            <span v-else-if="protocolPhase === 'eyes-closed-15s'">Eyes Closed Sternum Hold: {{ phaseTimerSec }}s</span>
            <span v-else>Start 2×15s Romberg Protocol</span>
          </button>

          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-400/35"
            :style="theme === 'daylight' ? 'color:#0369a1' : ''"
            @click="saveRombergLog"
          >
            <CheckCircle2 v-if="savedToast" class="h-3.5 w-3.5 text-emerald-400" />
            <Save v-else class="h-3.5 w-3.5" />
            <span>{{ savedToast ? 'Saved' : 'Log Balance' }}</span>
          </button>
        </div>
      </div>

      <!-- 4 Clinical Presets -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <button
          v-for="p in ROMBERG_PRESETS"
          :key="p.id"
          type="button"
          class="kg-squish-card rounded-xl p-2.5 text-left border transition-all"
          :class="
            selectedPresetId === p.id
              ? 'bg-violet-500/20 border-violet-400/55 shadow-md'
              : 'kg-subtle-surface opacity-85 hover:opacity-100'
          "
          @click="applyRombergPreset(p.id)"
        >
          <div class="flex items-center justify-between text-[10px] font-mono">
            <span class="font-bold text-violet-400" :style="theme === 'daylight' ? 'color:#6d28d9' : ''">{{ p.badge }}</span>
          </div>
          <div class="mt-1 text-xs font-semibold kg-text-primary">{{ p.title }}</div>
        </button>
      </div>
    </div>

    <!-- Main Stabilometry Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <!-- Polar 2D Statokinesigram Canvas -->
      <div class="lg:col-span-6 kg-glass-panel p-4 md:p-5">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div class="flex items-center gap-2">
            <Compass class="h-4 w-4 text-cyan-400" />
            <h3 class="text-sm font-bold kg-text-primary">2D Statokinesigram (CoP X/Y Sway mm)</h3>
          </div>

          <div class="inline-flex rounded-lg p-0.5 kg-subtle-surface text-[11px]">
            <button
              type="button"
              class="rounded-md px-2 py-1 font-medium"
              :class="viewLayer === 'both' ? 'bg-cyan-500/25 text-cyan-300' : 'kg-text-secondary'"
              :style="theme === 'daylight' && viewLayer === 'both' ? 'color:#0369a1' : ''"
              @click="viewLayer = 'both'"
            >
              Overlay Both
            </button>
            <button
              type="button"
              class="rounded-md px-2 py-1 font-medium inline-flex items-center gap-1"
              :class="viewLayer === 'open' ? 'bg-cyan-500/25 text-cyan-300' : 'kg-text-secondary'"
              :style="theme === 'daylight' && viewLayer === 'open' ? 'color:#0369a1' : ''"
              @click="viewLayer = 'open'"
            >
              <Eye class="h-3 w-3" /> Open
            </button>
            <button
              type="button"
              class="rounded-md px-2 py-1 font-medium inline-flex items-center gap-1"
              :class="viewLayer === 'closed' ? 'bg-rose-500/25 text-rose-300' : 'kg-text-secondary'"
              :style="theme === 'daylight' && viewLayer === 'closed' ? 'color:#be123c' : ''"
              @click="viewLayer = 'closed'"
            >
              <EyeOff class="h-3 w-3" /> Closed
            </button>
          </div>
        </div>

        <div
          class="mx-auto max-w-[380px] aspect-square rounded-2xl overflow-hidden kg-subtle-surface cursor-pointer"
          @click="openDetailedReport"
        >
          <canvas ref="polarCanvasRef" width="420" height="420" class="h-full w-full block" />
        </div>

        <div class="mt-2.5 flex items-center justify-between text-[11px] font-mono kg-text-secondary">
          <span><span class="text-cyan-400">●</span> Eyes-Open 95% Ellipse</span>
          <span><span class="text-rose-400">●</span> Eyes-Closed 95% Ellipse</span>
        </div>
      </div>

      <!-- Right Column: Romberg Quotient, PCA Metrics & Clinical Alert -->
      <div v-if="openMetrics && closedMetrics" class="lg:col-span-6 space-y-4">
        <!-- Clinical Fall-Risk / Concussion Banner -->
        <div
          class="kg-glass-panel p-4 border-l-4"
          :class="{
            'border-l-emerald-400': clinicalAlertStatus.color === 'emerald',
            'border-l-amber-400': clinicalAlertStatus.color === 'amber',
            'border-l-rose-500': clinicalAlertStatus.color === 'rose'
          }"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono font-bold flex items-center gap-1.5 kg-text-primary">
              <AlertTriangle
                v-if="clinicalAlertStatus.color !== 'emerald'"
                class="h-4 w-4 text-rose-400"
              />
              <span>{{ clinicalAlertStatus.tier }}</span>
            </span>
            <button
              type="button"
              class="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:underline"
              @click="openDetailedReport"
            >
              <span>Inspect Report</span>
              <Maximize2 class="h-3 w-3" />
            </button>
          </div>
          <p class="mt-1 text-xs kg-text-secondary">{{ clinicalAlertStatus.detail }}</p>
        </div>

        <!-- 4 Posturography KPI Cards -->
        <div class="grid grid-cols-2 gap-3">
          <div class="kg-glass-panel p-4">
            <div class="text-[10px] font-mono uppercase kg-text-muted">Eyes-Open 95% Area</div>
            <div class="mt-1 font-mono text-2xl font-extrabold text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
              {{ openMetrics.areaMm2 }} <span class="text-xs font-normal">mm²</span>
            </div>
            <div class="mt-0.5 text-[11px] kg-text-secondary">
              Mean Velocity: {{ openMetrics.velocityMmPerS }} mm/s
            </div>
          </div>

          <div class="kg-glass-panel p-4">
            <div class="text-[10px] font-mono uppercase kg-text-muted">Eyes-Closed 95% Area</div>
            <div class="mt-1 font-mono text-2xl font-extrabold text-rose-400" :style="theme === 'daylight' ? 'color:#e11d48' : ''">
              {{ closedMetrics.areaMm2 }} <span class="text-xs font-normal">mm²</span>
            </div>
            <div class="mt-0.5 text-[11px] kg-text-secondary">
              Mean Velocity: {{ closedMetrics.velocityMmPerS }} mm/s
            </div>
          </div>

          <div class="kg-glass-panel p-4">
            <div class="text-[10px] font-mono uppercase kg-text-muted">Romberg Quotient (RQ)</div>
            <div
              class="mt-1 font-mono text-2xl font-extrabold"
              :class="rombergQuotient > 2.8 ? 'text-rose-400' : 'text-emerald-400'"
            >
              {{ rombergQuotient }} <span class="text-xs font-normal">Closed/Open</span>
            </div>
            <div class="mt-0.5 text-[11px] kg-text-secondary">
              Nominal threshold &lt; 2.10
            </div>
          </div>

          <div class="kg-glass-panel p-4">
            <div class="text-[10px] font-mono uppercase kg-text-muted">AP / ML Sway Ratio</div>
            <div class="mt-1 font-mono text-2xl font-extrabold kg-text-primary">
              {{ closedMetrics.apMlRatio }} <span class="text-xs font-normal">ratio</span>
            </div>
            <div class="mt-0.5 text-[11px] kg-text-secondary">
              Axis Tilt: {{ closedMetrics.orientationDeg }}°
            </div>
          </div>
        </div>

        <!-- Directional Centroid Asymmetry Card -->
        <div class="kg-glass-panel p-4">
          <h4 class="text-xs font-bold uppercase tracking-wider kg-text-primary mb-2">
            Principal Eigenvalue &amp; Labyrinthine Vector Bias
          </h4>
          <div class="grid grid-cols-3 gap-2 text-xs font-mono">
            <div class="rounded-xl p-2.5 kg-subtle-surface">
              <div class="text-[10px] kg-text-muted">Semi-Major Axis</div>
              <div class="mt-0.5 font-bold kg-text-primary">{{ closedMetrics.semiMajorMm }} mm</div>
            </div>
            <div class="rounded-xl p-2.5 kg-subtle-surface">
              <div class="text-[10px] kg-text-muted">Semi-Minor Axis</div>
              <div class="mt-0.5 font-bold kg-text-primary">{{ closedMetrics.semiMinorMm }} mm</div>
            </div>
            <div class="rounded-xl p-2.5 kg-subtle-surface">
              <div class="text-[10px] kg-text-muted">CoP Drift (ML / AP)</div>
              <div class="mt-0.5 font-bold text-amber-400" :style="theme === 'daylight' ? 'color:#b45309' : ''">
                {{ closedMetrics.centroidMlMm }} / {{ closedMetrics.centroidApMm }} mm
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
