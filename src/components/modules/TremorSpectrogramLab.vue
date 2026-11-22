<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  Activity,
  Radio,
  Layers,
  Save,
  Maximize2,
  Lock,
  Vibrate,
  CheckCircle2
} from 'lucide-vue-next'
import {
  TREMOR_PRESETS,
  synthesizeTremorWaveform3Axis,
  computeWelchTremorSpectrum
} from '../../engines/rustBiomechBridge.js'
import { emitBioHapticFeedback } from '../../engines/sensorFusionEngine.js'
import ArchimedesSpiralCard from './ArchimedesSpiralCard.vue'

const props = defineProps({
  roleTier: { type: String, default: 'STANDARD' },
  theme: { type: String, default: 'obsidian' },
  liveImuSample: { type: Object, default: () => ({ ax: 0, ay: 0, az: 0, active: false }) }
})

const emit = defineEmits([
  'spectrum-updated',
  'open-clinical-report',
  'save-to-vault',
  'elevate-role'
])

const selectedPresetId = ref('essential')
const inputMode = ref('simulator') // 'simulator' | 'live-scan'
const scanCountdownSec = ref(0)
const isScanning10s = ref(false)
const savedToast = ref(false)
const hapticPulseNotice = ref('')

// Pre- vs Post-Medication Overlay (Pro/Admin Tier)
const baselineOverlaySpectrum = ref(null)
const baselineOverlayLabel = ref('')

const oscCanvasRef = ref(null)
const psdCanvasRef = ref(null)

const currentSpectrum = ref(null)
const spiralSummary = ref(null)

const activePreset = computed(
  () => TREMOR_PRESETS.find((p) => p.id === selectedPresetId.value) || TREMOR_PRESETS[0]
)

// Rolling 3-axis oscilloscope buffers (240 frames)
const RING_LEN = 240
const oscAx = new Float64Array(RING_LEN)
const oscAy = new Float64Array(RING_LEN)
const oscAz = new Float64Array(RING_LEN)
let oscHead = 0

// 10-second live IMU / pointer tremor capture buffers
let liveCaptureAx = []
let liveCaptureAy = []
let liveCaptureAz = []
let scanTimerId = null
let rafId = null
let phaseClock = 0
let lastTrackpadVel = { x: 0, y: 0, prevX: 0, prevY: 0, t: 0 }

function runPresetAnalysis(preset) {
  const synth = synthesizeTremorWaveform3Axis(preset, 1024, 200, phaseClock * 0.25)
  const report = computeWelchTremorSpectrum(synth.ax, synth.ay, synth.az, 200)
  currentSpectrum.value = report
  emit('spectrum-updated', {
    dominantFreqHz: report.dominantFreqHz,
    rmsDisplacementMm: report.rmsDisplacementMm,
    mdsUpdrsScore: report.mdsUpdrsScore,
    phenotypeCode: report.classification.code,
    rawSeries: synth
  })
}

function selectPreset(presetId) {
  inputMode.value = 'simulator'
  selectedPresetId.value = presetId
  runPresetAnalysis(activePreset.value)
}

function start10SecondLiveScan() {
  inputMode.value = 'live-scan'
  isScanning10s.value = true
  scanCountdownSec.value = 10.0
  liveCaptureAx = []
  liveCaptureAy = []
  liveCaptureAz = []

  if (scanTimerId) clearInterval(scanTimerId)
  scanTimerId = setInterval(() => {
    scanCountdownSec.value = Number(Math.max(0, scanCountdownSec.value - 0.1).toFixed(1))
    if (scanCountdownSec.value <= 0) {
      clearInterval(scanTimerId)
      scanTimerId = null
      isScanning10s.value = false
      finalizeLiveScan()
    }
  }, 100)
}

function finalizeLiveScan() {
  if (liveCaptureAx.length >= 64) {
    const report = computeWelchTremorSpectrum(
      Float64Array.from(liveCaptureAx),
      Float64Array.from(liveCaptureAy),
      Float64Array.from(liveCaptureAz),
      60
    )
    currentSpectrum.value = report
    emit('spectrum-updated', {
      dominantFreqHz: report.dominantFreqHz,
      rmsDisplacementMm: report.rmsDisplacementMm,
      mdsUpdrsScore: report.mdsUpdrsScore,
      phenotypeCode: report.classification.code
    })
  } else {
    runPresetAnalysis(activePreset.value)
  }
}

function onTrackpadOscillate(e) {
  if (inputMode.value !== 'live-scan') return
  const now = performance.now() / 1000
  const dt = Math.max(0.008, now - (lastTrackpadVel.t || now - 0.016))
  const vx = (e.clientX - lastTrackpadVel.prevX) / dt
  const vy = (e.clientY - lastTrackpadVel.prevY) / dt
  const ax = Math.max(-18, Math.min(18, ((vx - lastTrackpadVel.x) / dt) * 0.0025))
  const ay = Math.max(-18, Math.min(18, ((vy - lastTrackpadVel.y) / dt) * 0.0025))
  lastTrackpadVel = { x: vx, y: vy, prevX: e.clientX, prevY: e.clientY, t: now }
  liveCaptureAx.push(ax)
  liveCaptureAy.push(ay)
  liveCaptureAz.push((ax + ay) * 0.25)
}

function lockPreMedicationBaseline() {
  if (!currentSpectrum.value) return
  baselineOverlaySpectrum.value = {
    psdTotal: [...currentSpectrum.value.psdTotal],
    dominantFreqHz: currentSpectrum.value.dominantFreqHz,
    rmsDisplacementMm: currentSpectrum.value.rmsDisplacementMm
  }
  baselineOverlayLabel.value = `Pre-Rx (${currentSpectrum.value.dominantFreqHz} Hz · ${currentSpectrum.value.rmsDisplacementMm} mm)`
}

function clearMedicationOverlay() {
  baselineOverlaySpectrum.value = null
  baselineOverlayLabel.value = ''
}

const overlayDeltaPct = computed(() => {
  if (!baselineOverlaySpectrum.value || !currentSpectrum.value) return null
  const pre = Math.max(0.02, baselineOverlaySpectrum.value.rmsDisplacementMm)
  const post = currentSpectrum.value.rmsDisplacementMm
  return Math.round(((post - pre) / pre) * 100)
})

async function triggerPhaseInvertedHaptics() {
  const hz = currentSpectrum.value?.dominantFreqHz || 5.5
  const res = await emitBioHapticFeedback('tremor-pacing', hz)
  hapticPulseNotice.value = `180° Phase-Locked Pacing @ ${hz} Hz (${res.channel})`
  setTimeout(() => {
    hapticPulseNotice.value = ''
  }, 3200)
}

function handleSaveSession() {
  if (!currentSpectrum.value) return
  const sp = currentSpectrum.value
  emit('save-to-vault', {
    category: 'TREMOR_PSD',
    title: `${sp.classification.label}`,
    primaryMetric: `${sp.dominantFreqHz} Hz · ${sp.rmsDisplacementMm} mm RMS`,
    secondaryMetric: `MDS-UPDRS: ${sp.mdsUpdrsScore} · Q=${sp.narrowbandQ}`,
    notes: `Band shares — Park: ${sp.bandShares.parkinsonianPct}%, Ess: ${sp.bandShares.essentialPct}%, Cer: ${sp.bandShares.cerebellarPct}%.`,
    payload: {
      dominantFreqHz: sp.dominantFreqHz,
      rmsDisplacementMm: sp.rmsDisplacementMm,
      mdsUpdrsScore: sp.mdsUpdrsScore,
      narrowbandQ: sp.narrowbandQ,
      spiral: spiralSummary.value
    }
  })
  savedToast.value = true
  setTimeout(() => {
    savedToast.value = false
  }, 2200)
}

function openDetailedReport() {
  if (!currentSpectrum.value) return
  emit('open-clinical-report', {
    module: 'TREMOR_SPECTROGRAM',
    title: '3-Axis Neuromuscular Tremor Welch PSD Report',
    spectrum: currentSpectrum.value,
    spiral: spiralSummary.value,
    presetTitle: activePreset.value.title
  })
}

function drawOscilloscopeCanvas() {
  const canvas = oscCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const isLight = props.theme === 'daylight'
  ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.12)'
  ctx.lineWidth = 1
  for (let row = 1; row <= 3; row++) {
    const y = (h / 4) * row
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  const drawChannel = (ring, color, yCenterOffset) => {
    ctx.beginPath()
    for (let i = 0; i < RING_LEN; i++) {
      const idx = (oscHead + i) % RING_LEN
      const x = (i / (RING_LEN - 1)) * w
      const clamped = Math.max(-5.5, Math.min(5.5, ring[idx]))
      const y = h * 0.5 + yCenterOffset - clamped * (h * 0.068)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 1.8
    ctx.stroke()
  }

  drawChannel(oscAx, '#06b6d4', -26)
  drawChannel(oscAy, '#10b981', 0)
  drawChannel(oscAz, '#8b5cf6', 26)
}

function drawSpectrogramCanvas() {
  const canvas = psdCanvasRef.value
  const sp = currentSpectrum.value
  if (!canvas || !sp) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const padL = 38
  const padR = 14
  const padT = 22
  const padB = 28
  const plotW = w - padL - padR
  const plotH = h - padT - padB

  const hzToX = (hz) => padL + ((hz - 1.0) / 15.0) * plotW

  // Clinical neurological frequency gate backdrops
  const gates = [
    { min: 2.5, max: 4.0, label: 'Cerebellar', fill: 'rgba(244, 63, 94, 0.11)', text: '#fb7185' },
    { min: 4.0, max: 6.0, label: 'Parkinsonian', fill: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24' },
    { min: 6.0, max: 10.0, label: 'Essential', fill: 'rgba(139, 92, 246, 0.12)', text: '#a78bfa' },
    { min: 10.0, max: 14.5, label: 'Physiological', fill: 'rgba(16, 185, 129, 0.11)', text: '#34d399' }
  ]

  const isLight = props.theme === 'daylight'
  for (const g of gates) {
    const x0 = hzToX(g.min)
    const x1 = hzToX(g.max)
    ctx.fillStyle = g.fill
    ctx.fillRect(x0, padT, x1 - x0, plotH)
    ctx.fillStyle = isLight ? '#334155' : g.text
    ctx.font = '600 10px ui-monospace, monospace'
    ctx.fillText(g.label, x0 + 4, padT + 12)
  }

  const maxPsd = Math.max(
    0.002,
    ...sp.psdTotal,
    ...(baselineOverlaySpectrum.value ? baselineOverlaySpectrum.value.psdTotal : [0])
  )

  // Optional Pro Pre-Medication Overlay Curve
  if (baselineOverlaySpectrum.value) {
    ctx.save()
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    const baseArr = baselineOverlaySpectrum.value.psdTotal
    for (let i = 0; i < sp.frequencies.length; i++) {
      const hz = sp.frequencies[i]
      if (hz > 16.0) break
      const x = hzToX(hz)
      const y = padT + plotH - Math.min(1, (baseArr[i] || 0) / maxPsd) * (plotH - 18)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = '#f43f5e'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }

  // Filled PSD Area + Crisp Primary Curve
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH)
  grad.addColorStop(0, 'rgba(6, 182, 212, 0.50)')
  grad.addColorStop(1, 'rgba(6, 182, 212, 0.02)')

  ctx.beginPath()
  for (let i = 0; i < sp.frequencies.length; i++) {
    const hz = sp.frequencies[i]
    if (hz > 16.0) break
    const x = hzToX(hz)
    const y = padT + plotH - Math.min(1, sp.psdTotal[i] / maxPsd) * (plotH - 18)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  const endX = hzToX(16.0)
  ctx.lineTo(endX, padT + plotH)
  ctx.lineTo(padL, padT + plotH)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  ctx.beginPath()
  for (let i = 0; i < sp.frequencies.length; i++) {
    const hz = sp.frequencies[i]
    if (hz > 16.0) break
    const x = hzToX(hz)
    const y = padT + plotH - Math.min(1, sp.psdTotal[i] / maxPsd) * (plotH - 18)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = isLight ? '#0284c7' : '#22d3ee'
  ctx.lineWidth = 2.4
  ctx.stroke()

  // Dominant Peak Vertical Beacon
  const peakX = hzToX(Math.min(16, Math.max(1, sp.dominantFreqHz)))
  ctx.save()
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(peakX, padT)
  ctx.lineTo(peakX, padT + plotH)
  ctx.strokeStyle = '#10b981'
  ctx.lineWidth = 1.6
  ctx.stroke()
  ctx.restore()

  ctx.fillStyle = '#10b981'
  ctx.beginPath()
  ctx.arc(peakX, padT + 20, 4.5, 0, Math.PI * 2)
  ctx.fill()

  // Frequency Axis Ticks (2 Hz steps)
  ctx.fillStyle = isLight ? '#475569' : '#94a3b8'
  ctx.font = '10px ui-monospace, monospace'
  for (let hz = 2; hz <= 16; hz += 2) {
    const tx = hzToX(hz)
    ctx.fillText(`${hz}Hz`, tx - 12, h - 8)
  }
}

function tick60Fps() {
  phaseClock += 1 / 60
  let axSample = 0
  let aySample = 0
  let azSample = 0

  if (inputMode.value === 'live-scan' && props.liveImuSample?.active) {
    axSample = props.liveImuSample.ax
    aySample = props.liveImuSample.ay
    azSample = props.liveImuSample.az
    if (isScanning10s.value) {
      liveCaptureAx.push(axSample)
      liveCaptureAy.push(aySample)
      liveCaptureAz.push(azSample)
    }
  } else {
    const p = activePreset.value
    const w = 2 * Math.PI * p.dominantHz
    const scale = Math.min(4.8, Math.max(0.12, (p.targetAmpMm / 1000) * w * w * 0.45))
    axSample = scale * Math.sin(w * phaseClock) + p.broadbandNoise * 0.7 * Math.sin(phaseClock * 43)
    aySample = scale * 0.74 * Math.cos(w * phaseClock + 0.5) + p.broadbandNoise * 0.5 * Math.cos(phaseClock * 37)
    azSample = scale * 0.42 * Math.sin(w * 2 * phaseClock)
    if (isScanning10s.value && liveCaptureAx.length < 40) {
      liveCaptureAx.push(axSample)
      liveCaptureAy.push(aySample)
      liveCaptureAz.push(azSample)
    }
  }

  oscAx[oscHead] = axSample
  oscAy[oscHead] = aySample
  oscAz[oscHead] = azSample
  oscHead = (oscHead + 1) % RING_LEN

  drawOscilloscopeCanvas()
  drawSpectrogramCanvas()
  rafId = requestAnimationFrame(tick60Fps)
}

watch(
  () => props.theme,
  () => {
    drawOscilloscopeCanvas()
    drawSpectrogramCanvas()
  }
)

onMounted(() => {
  runPresetAnalysis(activePreset.value)
  rafId = requestAnimationFrame(tick60Fps)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (scanTimerId) clearInterval(scanTimerId)
})
</script>

<template>
  <section class="space-y-4">
    <!-- Top Preset & Live 10s IMU Scan Bar -->
    <div class="kg-glass-panel p-4 md:p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3.5">
        <div>
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-400 border border-cyan-400/30">
              RUST WELCH PSD · 0.1 HZ BIN
            </span>
            <h2 class="text-base md:text-lg font-bold kg-text-primary">
              3-Axis Neuromuscular Tremor Frequency Classifier (2–16 Hz)
            </h2>
          </div>
          <p class="text-xs kg-text-secondary mt-0.5">
            Select any clinical neuromuscular simulator for instant FFT analysis or run a 10-second live 3-axis IMU / trackpad capture.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-all"
            :class="
              isScanning10s
                ? 'bg-rose-500/25 text-rose-300 border-rose-400/45 animate-pulse'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
            "
            :style="theme === 'daylight' ? 'color:#065f46' : ''"
            @click="start10SecondLiveScan"
          >
            <Radio class="h-3.5 w-3.5" />
            <span v-if="isScanning10s">Scanning IMU/Trackpad: {{ scanCountdownSec }}s</span>
            <span v-else>10s Live IMU / Trackpad Scan</span>
          </button>

          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold kg-subtle-surface kg-text-primary"
            @click="triggerPhaseInvertedHaptics"
          >
            <Vibrate class="h-3.5 w-3.5 text-cyan-400" />
            <span>180° Haptic Pace</span>
          </button>

          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-400/35"
            :style="theme === 'daylight' ? 'color:#0369a1' : ''"
            @click="handleSaveSession"
          >
            <CheckCircle2 v-if="savedToast" class="h-3.5 w-3.5 text-emerald-400" />
            <Save v-else class="h-3.5 w-3.5" />
            <span>{{ savedToast ? 'Saved to Vault' : 'Log Scan' }}</span>
          </button>
        </div>
      </div>

      <p v-if="hapticPulseNotice" class="mb-2.5 text-xs font-mono text-cyan-400">
        {{ hapticPulseNotice }}
      </p>

      <!-- 5 Neuromuscular Tremor Presets -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <button
          v-for="preset in TREMOR_PRESETS"
          :key="preset.id"
          type="button"
          class="kg-squish-card text-left rounded-xl p-2.5 transition-all border"
          :class="
            selectedPresetId === preset.id && inputMode === 'simulator'
              ? 'bg-cyan-500/20 border-cyan-400/55 shadow-md'
              : 'kg-subtle-surface opacity-85 hover:opacity-100'
          "
          @click="selectPreset(preset.id)"
        >
          <div class="flex items-center justify-between gap-1">
            <span class="font-mono text-[10px] font-bold text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
              {{ preset.dominantHz }} Hz
            </span>
            <span class="truncate rounded px-1.5 py-0.5 text-[9px] font-mono bg-white/10 kg-text-secondary">
              {{ preset.targetAmpMm }} mm
            </span>
          </div>
          <div class="mt-1 text-xs font-semibold leading-snug kg-text-primary line-clamp-2">
            {{ preset.shortLabel }}
          </div>
        </button>
      </div>
    </div>

    <!-- Main Diagnostic Split: Left = Welch PSD + 3-Axis Oscilloscope + KPIs, Right = Archimedes Spiral -->
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-4">
      <div class="xl:col-span-8 space-y-4">
        <!-- KPI Summary Strip (Clickable Shared-Element Morph Trigger) -->
        <div
          v-if="currentSpectrum"
          class="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <button
            type="button"
            class="kg-glass-panel kg-squish-card p-3.5 text-left"
            @click="openDetailedReport"
          >
            <div class="flex items-center justify-between text-[10px] font-mono uppercase kg-text-muted">
              <span>Dominant Peak f_peak</span>
              <Maximize2 class="h-3 w-3 opacity-60" />
            </div>
            <div class="mt-1 font-mono text-2xl font-extrabold text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
              {{ currentSpectrum.dominantFreqHz }} <span class="text-xs font-normal">Hz</span>
            </div>
            <div class="mt-0.5 text-[11px] kg-text-secondary truncate">
              Q-Factor: {{ currentSpectrum.narrowbandQ }}
            </div>
          </button>

          <button
            type="button"
            class="kg-glass-panel kg-squish-card p-3.5 text-left"
            @click="openDetailedReport"
          >
            <div class="text-[10px] font-mono uppercase kg-text-muted">RMS Amplitude</div>
            <div class="mt-1 font-mono text-2xl font-extrabold kg-text-primary">
              {{ currentSpectrum.rmsDisplacementMm }} <span class="text-xs font-normal">mm</span>
            </div>
            <div class="mt-0.5 text-[11px] kg-text-secondary">
              {{ currentSpectrum.rmsAccelMps2 }} m/s² kinetic
            </div>
          </button>

          <button
            type="button"
            class="kg-glass-panel kg-squish-card p-3.5 text-left"
            @click="openDetailedReport"
          >
            <div class="text-[10px] font-mono uppercase kg-text-muted">MDS-UPDRS Log Grade</div>
            <div
              class="mt-1 font-mono text-2xl font-extrabold"
              :class="{
                'text-emerald-400': currentSpectrum.mdsUpdrsScore < 0.8,
                'text-amber-400': currentSpectrum.mdsUpdrsScore >= 0.8 && currentSpectrum.mdsUpdrsScore < 2.2,
                'text-rose-400': currentSpectrum.mdsUpdrsScore >= 2.2
              }"
            >
              {{ currentSpectrum.mdsUpdrsScore }} <span class="text-xs font-normal">/ 4.0</span>
            </div>
            <div class="mt-0.5 text-[11px] kg-text-secondary">Weber-Fechner scale</div>
          </button>

          <button
            type="button"
            class="kg-glass-panel kg-squish-card p-3.5 text-left"
            @click="openDetailedReport"
          >
            <div class="text-[10px] font-mono uppercase kg-text-muted">Classified Signature</div>
            <div class="mt-1 text-xs font-bold leading-snug kg-text-primary line-clamp-2">
              {{ currentSpectrum.classification.label }}
            </div>
            <div class="mt-1 text-[10px] font-mono text-violet-400" :style="theme === 'daylight' ? 'color:#6d28d9' : ''">
              {{ currentSpectrum.classification.bandRange }}
            </div>
          </button>
        </div>

        <!-- Frequency Band Gate Spectrogram Canvas -->
        <div
          class="kg-glass-panel p-4 md:p-5"
          @pointermove="onTrackpadOscillate"
        >
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <div>
              <h3 class="text-sm font-bold kg-text-primary flex items-center gap-2">
                <Activity class="h-4 w-4 text-cyan-400" />
                <span>Welch Power Spectral Density Gate Graph (1.0 – 16.0 Hz)</span>
              </h3>
              <p class="text-[11px] kg-text-secondary">
                Click graph to inspect full Polyglot Clinical Report. During 10s Live Scan, oscillate mouse/finger here or hold phone steady.
              </p>
            </div>

            <!-- Clinician Pro Pre- vs Post-Medication Overlay Controls -->
            <div class="flex items-center gap-2">
              <template v-if="roleTier !== 'STANDARD'">
                <button
                  type="button"
                  class="kg-squish-card inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-400/35"
                  :style="theme === 'daylight' ? 'color:#5b21b6' : ''"
                  @click="lockPreMedicationBaseline"
                >
                  <Layers class="h-3.5 w-3.5" />
                  <span>Pin Pre-Rx Overlay</span>
                </button>
                <button
                  v-if="baselineOverlaySpectrum"
                  type="button"
                  class="rounded-lg px-2 py-1.5 text-[11px] kg-subtle-surface kg-text-secondary"
                  @click="clearMedicationOverlay"
                >
                  Clear ({{ overlayDeltaPct }}%)
                </button>
              </template>
              <button
                v-else
                type="button"
                class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold kg-subtle-surface text-violet-400"
                @click="emit('elevate-role', 'PRO')"
              >
                <Lock class="h-3 w-3" />
                <span>Pro: Pre/Post Rx Overlay</span>
              </button>
            </div>
          </div>

          <div
            class="rounded-xl overflow-hidden kg-subtle-surface cursor-pointer"
            title="Click to morph into Full Biomechanical Clinical Report"
            @click="openDetailedReport"
          >
            <canvas ref="psdCanvasRef" width="760" height="225" class="w-full h-[205px] block" />
          </div>

          <!-- 3-Axis Real-Time Kinematic Oscilloscope -->
          <div class="mt-3">
            <div class="flex items-center justify-between text-[11px] font-mono mb-1.5 kg-text-secondary">
              <span>60 FPS 3-Axis Linear Acceleration Oscilloscope (Gravity Detrended &gt; 1.0 Hz)</span>
              <div class="flex items-center gap-3">
                <span class="text-cyan-400">● X-Axis</span>
                <span class="text-emerald-400">● Y-Axis</span>
                <span class="text-violet-400">● Z-Axis</span>
              </div>
            </div>
            <div class="rounded-xl overflow-hidden kg-subtle-surface">
              <canvas ref="oscCanvasRef" width="760" height="108" class="w-full h-[98px] block" />
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Interactive Archimedes Spiral Drawing & Ataxia Lab -->
      <div class="xl:col-span-4">
        <ArchimedesSpiralCard
          :active-preset="activePreset"
          :role-tier="roleTier"
          :theme="theme"
          @spiral-analyzed="(m) => (spiralSummary = m)"
          @elevate-pro="emit('elevate-role', 'PRO')"
        />
      </div>
    </div>
  </section>
</template>
