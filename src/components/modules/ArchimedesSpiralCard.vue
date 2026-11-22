<script setup>
import { ref, onMounted, watch } from 'vue'
import { PenTool, Play, RotateCcw, Lock } from 'lucide-vue-next'
import { analyzeArchimedesSpiral } from '../../engines/rustBiomechBridge.js'

const props = defineProps({
  activePreset: { type: Object, required: true },
  roleTier: { type: String, default: 'STANDARD' },
  theme: { type: String, default: 'obsidian' }
})

const emit = defineEmits(['spiral-analyzed', 'elevate-pro'])

const spiralCanvas = ref(null)
const isDrawing = ref(false)
const isAutoTracing = ref(false)
const tracePoints = ref([])
const metrics = ref({
  radialRmsErrorMm: 0.14,
  maxDeviationMm: 0.31,
  oscillationAxisDeg: 42,
  sparcSmoothness: -1.46,
  dysmetriaOvershoot: 0.98
})

const SPIRAL_A_MM = 4.0
const SPIRAL_B_MM = 2.65
const MAX_THETA = Math.PI * 6.5

function drawSpiralBoard() {
  const canvas = spiralCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  const cx = w / 2
  const cy = h / 2
  const mmToPx = Math.min(w, h) / 138

  ctx.clearRect(0, 0, w, h)

  const isLight = props.theme === 'daylight'
  const gridStroke = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.12)'
  const guideStroke = isLight ? 'rgba(2, 132, 199, 0.42)' : 'rgba(34, 211, 238, 0.38)'

  // Polar millimeter reference rings
  for (const rMm of [15, 30, 45, 60]) {
    ctx.beginPath()
    ctx.arc(cx, cy, rMm * mmToPx, 0, Math.PI * 2)
    ctx.strokeStyle = gridStroke
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Principal tremor axis line if points exist
  if (tracePoints.value.length > 15) {
    const rad = (metrics.value.oscillationAxisDeg * Math.PI) / 180
    const span = 62 * mmToPx
    ctx.save()
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(cx - Math.cos(rad) * span, cy - Math.sin(rad) * span)
    ctx.lineTo(cx + Math.cos(rad) * span, cy + Math.sin(rad) * span)
    ctx.strokeStyle = isLight ? 'rgba(124, 58, 237, 0.45)' : 'rgba(167, 139, 250, 0.45)'
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.restore()
  }

  // Ideal Archimedes Spiral guide path: r = a + b * theta
  ctx.beginPath()
  for (let th = 0; th <= MAX_THETA; th += 0.04) {
    const rMm = SPIRAL_A_MM + SPIRAL_B_MM * th
    const x = cx + rMm * Math.cos(th) * mmToPx
    const y = cy + rMm * Math.sin(th) * mmToPx
    if (th === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = guideStroke
  ctx.lineWidth = 3.2
  ctx.lineCap = 'round'
  ctx.stroke()

  // Start & Outer Target Markers
  const startX = cx + SPIRAL_A_MM * mmToPx
  ctx.fillStyle = '#10b981'
  ctx.beginPath()
  ctx.arc(startX, cy, 4.5, 0, Math.PI * 2)
  ctx.fill()

  const endR = SPIRAL_A_MM + SPIRAL_B_MM * MAX_THETA
  const endX = cx + endR * Math.cos(MAX_THETA) * mmToPx
  const endY = cy + endR * Math.sin(MAX_THETA) * mmToPx
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.arc(endX, endY, 5, 0, Math.PI * 2)
  ctx.fill()

  // User or Simulated Neuromuscular Trace
  const pts = tracePoints.value
  if (pts.length > 1) {
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]
      const p1 = pts[i]
      const x0 = cx + p0.xMm * mmToPx
      const y0 = cy + p0.yMm * mmToPx
      const x1 = cx + p1.xMm * mmToPx
      const y1 = cy + p1.yMm * mmToPx

      const errMag = Math.abs(p1.errMm || 0)
      let segColor = '#10b981'
      if (errMag > 2.6) segColor = '#ef4444'
      else if (errMag > 1.1) segColor = '#f59e0b'
      else if (errMag > 0.45) segColor = '#8b5cf6'

      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.strokeStyle = segColor
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.stroke()
    }
  }
}

function pointerToMm(event) {
  const canvas = spiralCanvas.value
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const px = (event.clientX - rect.left) * scaleX
  const py = (event.clientY - rect.top) * scaleY
  const mmToPx = Math.min(canvas.width, canvas.height) / 138
  const xMm = (px - canvas.width / 2) / mmToPx
  const yMm = (py - canvas.height / 2) / mmToPx
  return { xMm, yMm }
}

function onPointerDown(e) {
  if (isAutoTracing.value) return
  isDrawing.value = true
  tracePoints.value = []
  const { xMm, yMm } = pointerToMm(e)
  tracePoints.value.push({ xMm, yMm, tSec: performance.now() / 1000, errMm: 0 })
  drawSpiralBoard()
}

function onPointerMove(e) {
  if (!isDrawing.value || isAutoTracing.value) return
  const { xMm, yMm } = pointerToMm(e)
  const pts = tracePoints.value
  const tSec = performance.now() / 1000
  const rActual = Math.hypot(xMm, yMm)
  // Approximate nearest spiral turn for instantaneous color feedback
  const rawTheta = Math.atan2(yMm, xMm)
  const baseTheta = rawTheta < 0 ? rawTheta + Math.PI * 2 : rawTheta
  let bestErr = 999
  for (let turn = 0; turn <= 3; turn++) {
    const th = baseTheta + turn * Math.PI * 2
    const rIdeal = SPIRAL_A_MM + SPIRAL_B_MM * th
    if (Math.abs(rActual - rIdeal) < Math.abs(bestErr)) {
      bestErr = rActual - rIdeal
    }
  }
  pts.push({ xMm, yMm, tSec, errMm: bestErr })
  if (pts.length % 4 === 0) {
    metrics.value = analyzeArchimedesSpiral(pts, SPIRAL_A_MM, SPIRAL_B_MM)
    emit('spiral-analyzed', metrics.value)
  }
  drawSpiralBoard()
}

function onPointerUp() {
  if (!isDrawing.value) return
  isDrawing.value = false
  if (tracePoints.value.length >= 10) {
    metrics.value = analyzeArchimedesSpiral(tracePoints.value, SPIRAL_A_MM, SPIRAL_B_MM)
    emit('spiral-analyzed', metrics.value)
  }
}

function simulatePresetSpiral() {
  isAutoTracing.value = true
  const preset = props.activePreset
  const totalSteps = 260
  const generated = []
  const axisAngleRad = 0.72 // ~41° dominant tremor axis

  for (let i = 0; i <= totalSteps; i++) {
    const progress = i / totalSteps
    const theta = progress * MAX_THETA
    const tSec = progress * 5.2
    const rIdeal = SPIRAL_A_MM + SPIRAL_B_MM * theta

    // Intention dysmetria amplifies oscillation near outer target approach
    const approachGain = 1 + preset.dysmetriaBoost * Math.pow(progress, 2.2)
    const oscMm =
      preset.targetAmpMm *
      0.88 *
      approachGain *
      Math.sin(2 * Math.PI * preset.dominantHz * tSec) +
      preset.broadbandNoise * 0.65 * Math.cos(2 * Math.PI * 12.3 * tSec + i * 0.4)

    const baseX = rIdeal * Math.cos(theta)
    const baseY = rIdeal * Math.sin(theta)
    const xMm = baseX + oscMm * Math.cos(axisAngleRad)
    const yMm = baseY + oscMm * Math.sin(axisAngleRad)
    const rActual = Math.hypot(xMm, yMm)
    generated.push({ xMm, yMm, tSec, errMm: rActual - rIdeal })
  }

  tracePoints.value = generated
  metrics.value = analyzeArchimedesSpiral(generated, SPIRAL_A_MM, SPIRAL_B_MM)
  emit('spiral-analyzed', metrics.value)
  drawSpiralBoard()
  isAutoTracing.value = false
}

function clearSpiral() {
  tracePoints.value = []
  drawSpiralBoard()
}

watch(
  () => [props.activePreset.id, props.theme],
  () => {
    simulatePresetSpiral()
  }
)

onMounted(() => {
  simulatePresetSpiral()
})
</script>

<template>
  <div class="kg-glass-panel p-4 md:p-5 flex flex-col justify-between">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div>
        <div class="flex items-center gap-2">
          <PenTool class="h-4 w-4 text-violet-400" />
          <h3 class="text-sm font-bold kg-text-primary">
            Archimedes Spiral Ataxia &amp; Kinetic Analyzer
          </h3>
        </div>
        <p class="text-[11px] kg-text-secondary">
          Draw along <span class="font-mono">r = a + bθ</span> with mouse/finger or simulate active tremor preset
        </p>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="kg-squish-card inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-400/35"
          :style="theme === 'daylight' ? 'color: #5b21b6' : ''"
          @click="simulatePresetSpiral"
        >
          <Play class="h-3 w-3" />
          <span>Auto-Trace</span>
        </button>
        <button
          type="button"
          class="kg-squish-card inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] kg-subtle-surface kg-text-secondary"
          title="Clear Spiral Canvas"
          @click="clearSpiral"
        >
          <RotateCcw class="h-3 w-3" />
          <span>Clear</span>
        </button>
      </div>
    </div>

    <!-- Interactive Touch/Pointer Drawing Canvas -->
    <div class="relative mx-auto w-full max-w-[310px] aspect-square rounded-2xl overflow-hidden kg-subtle-surface">
      <canvas
        ref="spiralCanvas"
        width="360"
        height="360"
        class="h-full w-full cursor-crosshair touch-none"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
      />
      <div
        class="pointer-events-none absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[10px] font-mono kg-text-secondary"
      >
        <span><span class="inline-block h-2 w-2 rounded-full bg-emerald-400 mr-1" />Origin</span>
        <span>Axis: {{ metrics.oscillationAxisDeg }}°</span>
        <span><span class="inline-block h-2 w-2 rounded-full bg-amber-400 mr-1" />Target</span>
      </div>
    </div>

    <!-- Rust Spiral Metrics Readout -->
    <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div class="rounded-xl p-2.5 kg-subtle-surface">
        <div class="text-[10px] uppercase tracking-wider kg-text-muted">Radial Error RMS</div>
        <div class="mt-0.5 font-mono text-base font-bold kg-text-primary">
          {{ metrics.radialRmsErrorMm }} <span class="text-xs font-normal">mm</span>
        </div>
      </div>

      <div class="rounded-xl p-2.5 kg-subtle-surface">
        <div class="text-[10px] uppercase tracking-wider kg-text-muted">Tremor Axis Angle</div>
        <div class="mt-0.5 font-mono text-base font-bold text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
          {{ metrics.oscillationAxisDeg }}° <span class="text-[11px] font-normal kg-text-secondary">polar</span>
        </div>
      </div>

      <div class="rounded-xl p-2.5 kg-subtle-surface">
        <div class="text-[10px] uppercase tracking-wider kg-text-muted">SPARC Smoothness</div>
        <div class="mt-0.5 font-mono text-sm font-bold kg-text-primary">
          {{ metrics.sparcSmoothness }}
          <span class="text-[10px] font-normal kg-text-secondary">arc-len</span>
        </div>
      </div>

      <div class="rounded-xl p-2.5 kg-subtle-surface relative">
        <div class="text-[10px] uppercase tracking-wider kg-text-muted">Dysmetria Overshoot</div>
        <div v-if="roleTier !== 'STANDARD'" class="mt-0.5 font-mono text-sm font-bold text-amber-400" :style="theme === 'daylight' ? 'color:#b45309' : ''">
          {{ metrics.dysmetriaOvershoot }}x <span class="text-[10px] font-normal kg-text-secondary">outer</span>
        </div>
        <button
          v-else
          type="button"
          class="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-400 hover:underline"
          @click="emit('elevate-pro')"
        >
          <Lock class="h-3 w-3" />
          <span>Unlock Pro Ataxia</span>
        </button>
      </div>
    </div>
  </div>
</template>
