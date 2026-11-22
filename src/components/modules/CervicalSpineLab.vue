<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  Bone,
  Camera,
  CameraOff,
  BellRing,
  Save,
  Maximize2,
  Lock,
  CheckCircle2,
  Smartphone
} from 'lucide-vue-next'
import { useSpringValue } from '../../composables/useSpringPhysics.js'
import {
  evaluateCervicalLoadOffline,
  invokeGoKinesioTriage
} from '../../engines/cervicalGoMirror.js'
import {
  playPostureHarmonicChime,
  emitBioHapticFeedback,
  estimateWebcamHeadFlexionDeg
} from '../../engines/sensorFusionEngine.js'

const props = defineProps({
  roleTier: { type: String, default: 'STANDARD' },
  theme: { type: String, default: 'obsidian' },
  devicePitchDeg: { type: Number, default: null }
})

const emit = defineEmits([
  'cervical-updated',
  'open-clinical-report',
  'save-to-vault',
  'elevate-role'
])

const flexionAngleDeg = ref(15)
const dailyScreenHours = ref(5.5)
const safeThresholdDeg = ref(25)
const guardianEnabled = ref(true)
const useDeviceClinometer = ref(false)
const slouchSeconds = ref(0)
const chimeAlertTriggered = ref(false)
const savedToast = ref(false)
const goEndpointBadge = ref('Go 1.22 Ready')

// Optical Webcam Head-Tilt Tracking
const webcamActive = ref(false)
const webcamError = ref('')
const videoRef = ref(null)
const neutralWebcamY = ref(null)
let mediaStream = null
let scratchCanvas = null

const spineCanvasRef = ref(null)
const springFlexion = useSpringValue(15, { stiffness: 320, damping: 25, mass: 0.8 })

const hansrajPresets = [
  { deg: 0, lbs: 11, newtons: 49, tag: 'Neutral 0°' },
  { deg: 15, lbs: 27, newtons: 120, tag: 'Mild 15°' },
  { deg: 30, lbs: 40, newtons: 178, tag: 'Tech-Neck 30°' },
  { deg: 45, lbs: 49, newtons: 218, tag: 'Strain 45°' },
  { deg: 60, lbs: 60, newtons: 267, tag: 'Overload 60°' }
]

const cervicalMetrics = computed(() =>
  evaluateCervicalLoadOffline(flexionAngleDeg.value, 4.9895, dailyScreenHours.value)
)

let rafId = null
let slouchIntervalId = null
let goSyncDebounce = null

function setAnglePreset(deg) {
  useDeviceClinometer.value = false
  flexionAngleDeg.value = deg
}

watch(
  flexionAngleDeg,
  (nextDeg) => {
    springFlexion.setTarget(nextDeg)
    emit('cervical-updated', {
      flexionDegrees: nextDeg,
      effectiveLoadLbs: cervicalMetrics.value.effectiveLoadLbs,
      compressiveForceNewtons: cervicalMetrics.value.compressiveForceNewtons
    })

    if (goSyncDebounce) clearTimeout(goSyncDebounce)
    goSyncDebounce = setTimeout(async () => {
      const res = await invokeGoKinesioTriage({
        flexionDegrees: nextDeg,
        dailyScreenHours: dailyScreenHours.value
      })
      goEndpointBadge.value = `${res.goRuntimeVersion} · ${res.latencyMs}ms`
    }, 260)
  },
  { immediate: true }
)

watch(
  () => props.devicePitchDeg,
  (pitch) => {
    if (useDeviceClinometer.value && pitch !== null && !webcamActive.value) {
      flexionAngleDeg.value = Math.max(0, Math.min(60, Math.round(pitch * 10) / 10))
    }
  }
)

async function toggleOpticalWebcam() {
  webcamError.value = ''
  if (webcamActive.value) {
    stopWebcam()
    return
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    webcamError.value = 'Camera API unavailable in this browser context; use angle slider or IMU tilt.'
    return
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
      audio: false
    })
    webcamActive.value = true
    useDeviceClinometer.value = false
    scratchCanvas = document.createElement('canvas')
    requestAnimationFrame(() => {
      if (videoRef.value) {
        videoRef.value.srcObject = mediaStream
        videoRef.value.play().catch(() => {})
      }
    })
  } catch {
    webcamError.value = 'Webcam permission declined — interactive slider & IMU remain active.'
    webcamActive.value = false
  }
}

function calibrateWebcamNeutral() {
  if (!videoRef.value || !scratchCanvas) return
  const est = estimateWebcamHeadFlexionDeg(videoRef.value, scratchCanvas, 0.4)
  if (est) {
    neutralWebcamY.value = est.centroidY
  }
}

function stopWebcam() {
  webcamActive.value = false
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop())
    mediaStream = null
  }
}

async function triggerBiofeedbackAlert() {
  const severity = flexionAngleDeg.value >= 45 ? 'critical' : 'moderate'
  playPostureHarmonicChime(severity)
  await emitBioHapticFeedback('posture', 5.5)
  chimeAlertTriggered.value = true
  setTimeout(() => {
    chimeAlertTriggered.value = false
  }, 2400)
}

function saveCervicalSession() {
  const m = cervicalMetrics.value
  emit('save-to-vault', {
    category: 'CERVICAL_LOAD',
    title: `Cervical Spine Audit (${m.flexionDegrees}° Flexion)`,
    primaryMetric: `${m.effectiveLoadLbs} lbs (${Math.round(m.compressiveForceNewtons)} N)`,
    secondaryMetric: `Torque ${m.cervicalTorqueNm} N·m · ${m.dailyCompressionTonHrs} Ton-Hrs/Day`,
    notes: m.clinicalAdvisory,
    payload: m
  })
  savedToast.value = true
  setTimeout(() => {
    savedToast.value = false
  }, 2200)
}

function openDetailedReport() {
  emit('open-clinical-report', {
    module: 'CERVICAL_BIOMECHANICS',
    title: 'Hansraj C1–C7 Cervical Disc Compression & Shear Report',
    cervical: cervicalMetrics.value
  })
}

function drawAnatomicalCervicalCanvas() {
  const canvas = spineCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const deg = springFlexion.current.value
  const rad = (deg * Math.PI) / 180
  const isLight = props.theme === 'daylight'

  // Base C7-T1 anchor near bottom-left-center
  const baseX = w * 0.38
  const baseY = h * 0.84

  // Reference vertical neutral plumb line (0°)
  ctx.save()
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.moveTo(baseX, baseY)
  ctx.lineTo(baseX, h * 0.11)
  ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.22)' : 'rgba(148, 163, 184, 0.28)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()

  // Color progression from Synaptic Cyan -> Violet/Amber -> Crimson Overload
  let spineColor = '#06b6d4'
  let discGlow = 'rgba(16, 185, 129, 0.45)'
  if (deg >= 42) {
    spineColor = '#ef4444'
    discGlow = 'rgba(239, 68, 68, 0.55)'
  } else if (deg >= 22) {
    spineColor = '#f59e0b'
    discGlow = 'rgba(139, 92, 246, 0.50)'
  }

  // Compute articulated C7 -> C1 vertebral chain with progressive lordotic-to-kyphotic bending
  const labels = ['C7', 'C6', 'C5', 'C4', 'C3', 'C2', 'C1']
  const segLen = 28
  const coords = []
  let curX = baseX
  let curY = baseY

  for (let i = 0; i < labels.length; i++) {
    const frac = (i + 1) / labels.length
    // Natural mild lordosis at 0°, progressively flexing forward with theta
    const lordoticOffset = -0.10 * Math.sin(Math.PI * frac) * (1 - Math.min(1, deg / 25))
    const segAngle = rad * Math.pow(frac, 0.88) + lordoticOffset
    coords.push({ x: curX, y: curY, angle: segAngle, label: labels[i] })
    curX += Math.sin(segAngle) * segLen
    curY -= Math.cos(segAngle) * segLen
  }

  // Posterior nuchal ligament tension arc
  ctx.beginPath()
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i]
    const px = c.x - Math.cos(c.angle) * 18
    const py = c.y - Math.sin(c.angle) * 18
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.strokeStyle = deg >= 28 ? 'rgba(244, 63, 94, 0.68)' : 'rgba(20, 184, 166, 0.55)'
  ctx.lineWidth = 2.5
  ctx.stroke()

  // Draw Intervertebral Discs & Vertebral Bodies (C7 -> C1)
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i]
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(c.angle)

    // Intervertebral disc cushion below C6..C1
    if (i > 0) {
      ctx.fillStyle = discGlow
      ctx.beginPath()
      ctx.roundRect(-13, 9, 26, 7, 3)
      ctx.fill()
    }

    // Spinous process (posterior left)
    ctx.fillStyle = isLight ? 'rgba(51, 65, 85, 0.55)' : 'rgba(148, 163, 184, 0.42)'
    ctx.beginPath()
    ctx.moveTo(-12, -4)
    ctx.lineTo(-24, 2)
    ctx.lineTo(-12, 6)
    ctx.closePath()
    ctx.fill()

    // Vertebral body block
    ctx.fillStyle = isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.92)'
    ctx.strokeStyle = spineColor
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(-14, -8, 28, 16, 5)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = isLight ? '#0f172a' : '#e2e8f0'
    ctx.font = 'bold 9px ui-monospace, monospace'
    ctx.fillText(c.label, -7, 3)
    ctx.restore()
  }

  // Cranial Skull Silhouette atop C1
  const top = coords[coords.length - 1]
  const headX = top.x + Math.sin(rad) * 26
  const headY = top.y - Math.cos(rad) * 26

  ctx.save()
  ctx.translate(headX, headY)
  ctx.rotate(rad)
  ctx.beginPath()
  ctx.ellipse(4, -8, 30, 35, 0.15, 0, Math.PI * 2)
  ctx.fillStyle = isLight ? 'rgba(14, 165, 233, 0.14)' : 'rgba(6, 182, 212, 0.16)'
  ctx.strokeStyle = spineColor
  ctx.lineWidth = 2.4
  ctx.fill()
  ctx.stroke()

  // Eye-line gaze ray
  ctx.beginPath()
  ctx.moveTo(32, -6)
  ctx.lineTo(92, -6)
  ctx.strokeStyle = spineColor
  ctx.lineWidth = 1.6
  ctx.setLineDash([4, 4])
  ctx.stroke()
  ctx.restore()

  // Downward Gravitational Load Vector Arrow from Cranial COM
  const arrowLen = 36 + (deg / 60) * 52
  ctx.beginPath()
  ctx.moveTo(headX + 8, headY)
  ctx.lineTo(headX + 8, headY + arrowLen)
  ctx.strokeStyle = '#f43f5e'
  ctx.lineWidth = 2.8
  ctx.stroke()

  ctx.fillStyle = '#f43f5e'
  ctx.beginPath()
  ctx.moveTo(headX + 8, headY + arrowLen + 7)
  ctx.lineTo(headX + 3, headY + arrowLen - 2)
  ctx.lineTo(headX + 13, headY + arrowLen - 2)
  ctx.closePath()
  ctx.fill()

  // Flexion Angle Arc & Readout Callout
  ctx.beginPath()
  ctx.arc(baseX, baseY, 64, -Math.PI / 2, -Math.PI / 2 + rad, false)
  ctx.strokeStyle = spineColor
  ctx.lineWidth = 2.2
  ctx.stroke()

  ctx.fillStyle = isLight ? '#0f172a' : '#f8fafc'
  ctx.font = 'bold 13px ui-monospace, monospace'
  ctx.fillText(`θ = ${deg.toFixed(1)}°`, baseX + 18, h * 0.18)
  ctx.font = 'bold 12px ui-monospace, monospace'
  ctx.fillStyle = spineColor
  ctx.fillText(
    `${cervicalMetrics.value.effectiveLoadLbs} lbs (${Math.round(cervicalMetrics.value.compressiveForceNewtons)} N)`,
    headX + 20,
    headY + arrowLen * 0.65
  )
}

function renderFrameLoop() {
  if (webcamActive.value && videoRef.value && scratchCanvas) {
    const est = estimateWebcamHeadFlexionDeg(videoRef.value, scratchCanvas, neutralWebcamY.value)
    if (est) {
      flexionAngleDeg.value = Number(
        (flexionAngleDeg.value * 0.82 + est.flexionDegrees * 0.18).toFixed(1)
      )
    }
  }
  drawAnatomicalCervicalCanvas()
  rafId = requestAnimationFrame(renderFrameLoop)
}

onMounted(() => {
  rafId = requestAnimationFrame(renderFrameLoop)
  slouchIntervalId = setInterval(() => {
    if (guardianEnabled.value && flexionAngleDeg.value > safeThresholdDeg.value) {
      slouchSeconds.value = Number((slouchSeconds.value + 0.25).toFixed(2))
      if (slouchSeconds.value >= 10.0) {
        triggerBiofeedbackAlert()
        slouchSeconds.value = 0
      }
    } else {
      slouchSeconds.value = Math.max(0, Number((slouchSeconds.value - 0.5).toFixed(2)))
    }
  }, 250)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (slouchIntervalId) clearInterval(slouchIntervalId)
  stopWebcam()
})
</script>

<template>
  <section class="space-y-4">
    <!-- Top Header & Hansraj Knot Presets -->
    <div class="kg-glass-panel p-4 md:p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3.5">
        <div>
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-400/35">
              GO 1.22 HANSRAJ ENGINE · {{ goEndpointBadge }}
            </span>
            <h2 class="text-base md:text-lg font-bold kg-text-primary">
              Cervical Spine &ldquo;Tech-Neck&rdquo; C1–C7 Disc Load Lab
            </h2>
          </div>
          <p class="text-xs kg-text-secondary mt-0.5">
            Computes C5–C7 compressive force (lbs &amp; Newtons), cervical bending torque, and cumulative daily disc load.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border"
            :class="
              webcamActive
                ? 'bg-rose-500/25 text-rose-300 border-rose-400/40'
                : 'kg-subtle-surface kg-text-primary'
            "
            @click="toggleOpticalWebcam"
          >
            <CameraOff v-if="webcamActive" class="h-3.5 w-3.5" />
            <Camera v-else class="h-3.5 w-3.5 text-cyan-400" />
            <span>{{ webcamActive ? 'Stop Posture Webcam' : 'Optical Head-Tilt Webcam' }}</span>
          </button>

          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold kg-subtle-surface"
            :class="useDeviceClinometer ? 'text-cyan-400 border-cyan-400/45' : 'kg-text-secondary'"
            @click="useDeviceClinometer = !useDeviceClinometer"
          >
            <Smartphone class="h-3.5 w-3.5" />
            <span>{{ useDeviceClinometer ? 'Phone Tilt Active' : 'Use Phone Pitch' }}</span>
          </button>

          <button
            type="button"
            class="kg-squish-card inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-400/35"
            :style="theme === 'daylight' ? 'color:#0369a1' : ''"
            @click="saveCervicalSession"
          >
            <CheckCircle2 v-if="savedToast" class="h-3.5 w-3.5 text-emerald-400" />
            <Save v-else class="h-3.5 w-3.5" />
            <span>{{ savedToast ? 'Logged' : 'Log Posture' }}</span>
          </button>
        </div>
      </div>

      <p v-if="webcamError" class="mb-2.5 text-xs font-mono text-amber-400">
        {{ webcamError }}
      </p>

      <!-- 5 Clinical Hansraj Angle Benchmarks -->
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <button
          v-for="knot in hansrajPresets"
          :key="knot.deg"
          type="button"
          class="kg-squish-card rounded-xl p-2.5 text-left border transition-all"
          :class="
            Math.abs(flexionAngleDeg - knot.deg) < 2.5
              ? 'bg-emerald-500/20 border-emerald-400/55 shadow-md'
              : 'kg-subtle-surface opacity-85 hover:opacity-100'
          "
          @click="setAnglePreset(knot.deg)"
        >
          <div class="text-[11px] font-semibold kg-text-primary">{{ knot.tag }}</div>
          <div class="mt-0.5 font-mono text-xs font-bold text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
            {{ knot.lbs }} lbs · {{ knot.newtons }} N
          </div>
        </button>
      </div>
    </div>

    <!-- Main Anatomical Vector Diagram + Spinal Physics Controls -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <!-- Left: 60fps Articulated C1-C7 Spine Vector Canvas -->
      <div class="lg:col-span-5 kg-glass-panel p-4 md:p-5 flex flex-col justify-between">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <Bone class="h-4 w-4 text-cyan-400" />
            <h3 class="text-sm font-bold kg-text-primary">C1–C7 Articulated Spine Vector</h3>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:underline"
            @click="openDetailedReport"
          >
            <span>Full Report</span>
            <Maximize2 class="h-3 w-3" />
          </button>
        </div>

        <div
          class="relative rounded-2xl overflow-hidden kg-subtle-surface cursor-pointer"
          @click="openDetailedReport"
        >
          <canvas ref="spineCanvasRef" width="420" height="340" class="w-full h-[310px] block" />

          <!-- Optional Live Webcam PiP Preview -->
          <div
            v-if="webcamActive"
            class="absolute bottom-2.5 right-2.5 w-28 rounded-xl overflow-hidden border border-cyan-400/50 bg-slate-950/90 shadow-lg"
          >
            <video ref="videoRef" muted playsinline class="w-full h-20 object-cover scale-x-[-1]" />
            <button
              type="button"
              class="w-full py-1 text-[9px] font-mono font-bold text-cyan-300 bg-cyan-500/20"
              @click.stop="calibrateWebcamNeutral"
            >
              Calibrate 0° Neutral
            </button>
          </div>
        </div>

        <p class="mt-2.5 text-xs kg-text-secondary">
          {{ cervicalMetrics.clinicalAdvisory }}
        </p>
      </div>

      <!-- Right: Sliders, Physics Readout, Posture Guardian & Pro C1-C7 Shear Vectors -->
      <div class="lg:col-span-7 space-y-4">
        <!-- 4 Core Biomechanical KPIs -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="kg-glass-panel p-3.5">
            <div class="text-[10px] font-mono uppercase kg-text-muted">Effective Disc Load</div>
            <div
              class="mt-1 font-mono text-2xl font-extrabold"
              :class="{
                'text-emerald-400': cervicalMetrics.effectiveLoadLbs < 25,
                'text-amber-400': cervicalMetrics.effectiveLoadLbs >= 25 && cervicalMetrics.effectiveLoadLbs < 45,
                'text-rose-400': cervicalMetrics.effectiveLoadLbs >= 45
              }"
            >
              {{ cervicalMetrics.effectiveLoadLbs }} <span class="text-xs font-normal">lbs</span>
            </div>
            <div class="text-[11px] font-mono kg-text-secondary">
              {{ Math.round(cervicalMetrics.compressiveForceNewtons) }} Newtons
            </div>
          </div>

          <div class="kg-glass-panel p-3.5">
            <div class="text-[10px] font-mono uppercase kg-text-muted">Bending Torque τ</div>
            <div class="mt-1 font-mono text-2xl font-extrabold kg-text-primary">
              {{ cervicalMetrics.cervicalTorqueNm }} <span class="text-xs font-normal">N·m</span>
            </div>
            <div class="text-[11px] kg-text-secondary">
              {{ cervicalMetrics.loadMultiplier }}x neutral head
            </div>
          </div>

          <div class="kg-glass-panel p-3.5">
            <div class="text-[10px] font-mono uppercase kg-text-muted">C5–C7 Shear Force</div>
            <div class="mt-1 font-mono text-2xl font-extrabold text-violet-400" :style="theme === 'daylight' ? 'color:#6d28d9' : ''">
              {{ Math.round(cervicalMetrics.anteriorShearC5C7N) }} <span class="text-xs font-normal">N</span>
            </div>
            <div class="text-[11px] kg-text-secondary">Anterior translation</div>
          </div>

          <div class="kg-glass-panel p-3.5">
            <div class="text-[10px] font-mono uppercase kg-text-muted">Daily Disc Dose</div>
            <div class="mt-1 font-mono text-2xl font-extrabold text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
              {{ cervicalMetrics.dailyCompressionTonHrs }}
            </div>
            <div class="text-[11px] kg-text-secondary">Ton-Hours / Day</div>
          </div>
        </div>

        <!-- Interactive Cranial Flexion & Screen Hours Sliders + Active Biofeedback Guardian -->
        <div class="kg-glass-panel p-4 md:p-5 space-y-4">
          <div>
            <div class="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span class="kg-text-primary">Cranial Flexion Viewing Angle (θ: 0° – 60°)</span>
              <span class="font-mono text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
                {{ flexionAngleDeg }}°
              </span>
            </div>
            <input
              v-model.number="flexionAngleDeg"
              type="range"
              min="0"
              max="60"
              step="0.5"
              class="kg-range w-full"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div class="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span class="kg-text-secondary">Daily Device Screen Exposure</span>
                <span class="font-mono kg-text-primary">{{ dailyScreenHours }} hrs/day</span>
              </div>
              <input
                v-model.number="dailyScreenHours"
                type="range"
                min="1"
                max="14"
                step="0.5"
                class="kg-range w-full"
              />
            </div>

            <div>
              <div class="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span class="kg-text-secondary">Safe Posture Guardian Alert Angle</span>
                <span class="font-mono text-amber-400" :style="theme === 'daylight' ? 'color:#b45309' : ''">
                  &gt; {{ safeThresholdDeg }}°
                </span>
              </div>
              <input
                v-model.number="safeThresholdDeg"
                type="range"
                min="12"
                max="45"
                step="1"
                class="kg-range w-full"
              />
            </div>
          </div>

          <!-- Active Biofeedback Posture Guardian Bar -->
          <div class="rounded-xl p-3 kg-subtle-surface flex flex-wrap items-center justify-between gap-3">
            <div class="flex-1 min-w-[200px]">
              <div class="flex items-center gap-2 text-xs font-bold kg-text-primary">
                <BellRing class="h-4 w-4" :class="chimeAlertTriggered ? 'text-rose-400 animate-bounce' : 'text-emerald-400'" />
                <span>Active Biofeedback Posture Guardian (10s Dwell Trigger)</span>
              </div>
              <div class="mt-1.5 h-2 w-full rounded-full bg-slate-700/40 overflow-hidden">
                <div
                  class="h-full transition-all duration-200 rounded-full"
                  :class="slouchSeconds > 6 ? 'bg-rose-500' : 'bg-cyan-400'"
                  :style="{ width: `${Math.min(100, (slouchSeconds / 10) * 100)}%` }"
                />
              </div>
              <div class="mt-1 text-[10px] font-mono kg-text-secondary">
                Slouch Dwell: {{ slouchSeconds.toFixed(1) }}s / 10.0s
                <span v-if="chimeAlertTriggered" class="text-rose-400 font-bold ml-2">
                  ● HARMONIC CHIME + HAPTIC PULSE EMITTED!
                </span>
              </div>
            </div>

            <button
              type="button"
              class="kg-squish-card rounded-xl px-3 py-2 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/35"
              :style="theme === 'daylight' ? 'color:#92400e' : ''"
              @click="triggerBiofeedbackAlert"
            >
              Test Chime &amp; Haptic
            </button>
          </div>
        </div>

        <!-- Clinician Pro Unlock: 3D Segmental C1-C7 Disc Shear & Pressure Modeling -->
        <div class="kg-glass-panel p-4">
          <div class="flex items-center justify-between mb-2.5">
            <h3 class="text-xs font-bold uppercase tracking-wider kg-text-primary">
              Segmental C1–C7 Intervertebral Shear &amp; Hydrostatic Pressure
            </h3>
            <button
              v-if="roleTier === 'STANDARD'"
              type="button"
              class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-400/35"
              :style="theme === 'daylight' ? 'color:#5b21b6' : ''"
              @click="emit('elevate-role', 'PRO')"
            >
              <Lock class="h-3 w-3" />
              <span>Unlock Clinician Pro C1–C7 Vectors</span>
            </button>
          </div>

          <div v-if="roleTier !== 'STANDARD'" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div
              v-for="seg in cervicalMetrics.segmentVectors"
              :key="seg.level"
              class="rounded-xl p-2.5 kg-subtle-surface flex items-center justify-between text-xs"
            >
              <div>
                <div class="font-semibold kg-text-primary">{{ seg.level }}</div>
                <div class="font-mono text-[10px] kg-text-secondary">
                  Comp: {{ seg.compressiveForceN }} N · Shear: {{ seg.anteriorShearN }} N
                </div>
              </div>
              <span
                class="rounded-md px-2 py-0.5 font-mono text-[11px] font-bold"
                :class="{
                  'bg-emerald-500/20 text-emerald-400': seg.strainStatus === 'NOMINAL',
                  'bg-amber-500/20 text-amber-400': seg.strainStatus === 'ELEVATED',
                  'bg-rose-500/20 text-rose-400': seg.strainStatus === 'HIGH_SHEAR'
                }"
              >
                {{ seg.discPressureMPa }} MPa
              </span>
            </div>
          </div>
          <p v-else class="text-xs kg-text-secondary">
            Switch to <strong class="kg-text-primary">NEURO &amp; PT CLINICIAN PRO</strong> tier to inspect C1–C2 through C6–C7 segmental shear vectors (N) and intradiscal pressure (MPa).
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
