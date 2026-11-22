<script setup>
import {
  ShieldCheck,
  Cpu,
  Smartphone,
  Camera,
  Vibrate,
  X,
  Check
} from 'lucide-vue-next'

const props = defineProps({
  open: { type: Boolean, default: false },
  roleTier: { type: String, default: 'STANDARD' },
  sensors: { type: Object, required: true },
  theme: { type: String, default: 'obsidian' }
})

const emit = defineEmits(['close', 'update:roleTier', 'toggle-sensor'])

const roles = [
  {
    id: 'STANDARD',
    name: 'DAILY USER & ATHLETE',
    subtitle: 'Standard Tier',
    features: [
      'Hand Tremor Frequency Scanner (2–16 Hz)',
      'Cervical Spine Posture Guardian & Hansraj Load',
      'Romberg Balance Stabilometer & Kalman Anti-Shake Reader'
    ]
  },
  {
    id: 'PRO',
    name: 'NEURO & PT CLINICIAN PRO',
    subtitle: 'Clinician Pro Tier',
    features: [
      'Pre- vs. Post-Medication / Therapy Tremor PSD Overlay',
      '3D Cervical C1–C7 Segmental Disc Shear & MPa Modeling',
      'Archimedes Spiral Outer-Turn Dysmetria Overshoot Index'
    ]
  },
  {
    id: 'ADMIN',
    name: 'BIOMECHANICS LAB DIRECTOR',
    subtitle: 'Systems Admin Tier',
    features: [
      '5-Language Polyglot Source & WASM/Go Live Benchmark Lab',
      'Raw 200Hz 3-Axis Accelerometer CSV & JSON Exporter',
      'Full IndexedDB Offline-to-Online Sync Queue Controller'
    ]
  }
]
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/60 backdrop-blur-sm p-3 md:p-5"
      @click.self="emit('close')"
    >
      <aside
        class="kg-glass-panel kg-strong-surface w-full max-w-xl max-h-[92vh] overflow-y-auto p-5 md:p-6 space-y-5"
        role="dialog"
        aria-modal="true"
        aria-label="Privileges and Hardware Sensor Permissions"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <ShieldCheck class="h-5 w-5 text-cyan-400" />
            <div>
              <h2 class="text-base md:text-lg font-bold kg-text-primary">
                Privileges, RBAC &amp; Hardware Sensor Matrix
              </h2>
              <p class="text-xs kg-text-secondary">
                Switch clinical authorization tiers and configure hardware IMU / Bio-Haptic permissions.
              </p>
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

        <!-- A. Role-Based Access Control (RBAC) Switcher -->
        <div class="space-y-2.5">
          <h3 class="text-xs font-mono font-bold uppercase tracking-wider kg-text-muted">
            A. Role-Based Access Control (RBAC) Tier
          </h3>
          <div class="space-y-2.5">
            <button
              v-for="r in roles"
              :key="r.id"
              type="button"
              class="w-full text-left rounded-2xl p-3.5 border transition-all"
              :class="
                roleTier === r.id
                  ? 'bg-cyan-500/20 border-cyan-400/60 shadow-md'
                  : 'kg-subtle-surface opacity-85 hover:opacity-100'
              "
              @click="emit('update:roleTier', r.id)"
            >
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-xs font-mono font-bold text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
                    {{ r.name }}
                  </span>
                  <span class="ml-2 text-[11px] kg-text-secondary">({{ r.subtitle }})</span>
                </div>
                <span
                  v-if="roleTier === r.id"
                  class="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400"
                >
                  <Check class="h-3 w-3" /> ACTIVE
                </span>
              </div>
              <ul class="mt-2 space-y-1 text-xs kg-text-secondary">
                <li v-for="feat in r.features" :key="feat">• {{ feat }}</li>
              </ul>
            </button>
          </div>
        </div>

        <!-- B. Hardware & OS Sensor Permission Matrix -->
        <div class="space-y-2.5">
          <h3 class="text-xs font-mono font-bold uppercase tracking-wider kg-text-muted">
            B. Hardware &amp; OS Sensor Permission Matrix
          </h3>

          <div class="space-y-2.5">
            <!-- 1. Linear Accelerometer -->
            <div class="rounded-2xl p-3.5 kg-subtle-surface flex items-center justify-between gap-3">
              <div class="flex items-start gap-2.5">
                <Cpu class="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
                <div>
                  <div class="text-xs font-bold kg-text-primary">
                    High-Rate 3-Axis Linear Accelerometer (200 Hz)
                  </div>
                  <div class="text-[11px] kg-text-secondary">
                    DeviceMotionEvent / Java <span class="font-mono">TYPE_LINEAR_ACCELERATION</span>
                  </div>
                  <span class="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-mono bg-cyan-500/20 text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
                    {{ sensors.linearImu.statusLabel }}
                  </span>
                </div>
              </div>
              <button
                type="button"
                class="rounded-xl px-3 py-1.5 text-xs font-semibold border"
                :class="
                  sensors.linearImu.enabled
                    ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/45'
                    : 'kg-subtle-surface kg-text-secondary'
                "
                :style="theme === 'daylight' && sensors.linearImu.enabled ? 'color:#065f46' : ''"
                @click="emit('toggle-sensor', 'linearImu')"
              >
                {{ sensors.linearImu.enabled ? 'Enabled' : 'Restricted' }}
              </button>
            </div>

            <!-- 2. 3-Axis Gyroscope & Spine Clinometer -->
            <div class="rounded-2xl p-3.5 kg-subtle-surface flex items-center justify-between gap-3">
              <div class="flex items-start gap-2.5">
                <Smartphone class="h-4 w-4 text-violet-400 mt-0.5 shrink-0" />
                <div>
                  <div class="text-xs font-bold kg-text-primary">
                    3-Axis Gyroscope &amp; Spine Clinometer
                  </div>
                  <div class="text-[11px] kg-text-secondary">
                    DeviceOrientationEvent / Java <span class="font-mono">TYPE_ROTATION_VECTOR</span>
                  </div>
                  <span class="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-mono bg-violet-500/20 text-violet-300" :style="theme === 'daylight' ? 'color:#5b21b6' : ''">
                    {{ sensors.gyroClinometer.statusLabel }}
                  </span>
                </div>
              </div>
              <button
                type="button"
                class="rounded-xl px-3 py-1.5 text-xs font-semibold border"
                :class="
                  sensors.gyroClinometer.enabled
                    ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/45'
                    : 'kg-subtle-surface kg-text-secondary'
                "
                :style="theme === 'daylight' && sensors.gyroClinometer.enabled ? 'color:#065f46' : ''"
                @click="emit('toggle-sensor', 'gyroClinometer')"
              >
                {{ sensors.gyroClinometer.enabled ? 'Enabled' : 'Restricted' }}
              </button>
            </div>

            <!-- 3. Optical Posture Webcam -->
            <div class="rounded-2xl p-3.5 kg-subtle-surface flex items-center justify-between gap-3">
              <div class="flex items-start gap-2.5">
                <Camera class="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div class="text-xs font-bold kg-text-primary">
                    Optical Posture Webcam (On-Device ROI)
                  </div>
                  <div class="text-[11px] kg-text-secondary">
                    <span class="font-mono">getUserMedia</span> cranial pitch estimator (zero cloud upload)
                  </div>
                  <span class="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-mono bg-amber-500/20 text-amber-300" :style="theme === 'daylight' ? 'color:#92400e' : ''">
                    {{ sensors.opticalWebcam.statusLabel }}
                  </span>
                </div>
              </div>
              <button
                type="button"
                class="rounded-xl px-3 py-1.5 text-xs font-semibold border"
                :class="
                  sensors.opticalWebcam.enabled
                    ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/45'
                    : 'kg-subtle-surface kg-text-secondary'
                "
                :style="theme === 'daylight' && sensors.opticalWebcam.enabled ? 'color:#065f46' : ''"
                @click="emit('toggle-sensor', 'opticalWebcam')"
              >
                {{ sensors.opticalWebcam.enabled ? 'Authorized' : 'Restricted' }}
              </button>
            </div>

            <!-- 4. Phase-Inverted Haptic Engine -->
            <div class="rounded-2xl p-3.5 kg-subtle-surface flex items-center justify-between gap-3">
              <div class="flex items-start gap-2.5">
                <Vibrate class="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div class="text-xs font-bold kg-text-primary">
                    Phase-Inverted Haptic Engine (180° Counter-Pulse)
                  </div>
                  <div class="text-[11px] kg-text-secondary">
                    Java <span class="font-mono">BioHapticStabilizerPlugin</span> + Web Audio Chime
                  </div>
                  <span class="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-mono bg-emerald-500/20 text-emerald-400">
                    {{ sensors.bioHaptic.statusLabel }}
                  </span>
                </div>
              </div>
              <button
                type="button"
                class="rounded-xl px-3 py-1.5 text-xs font-semibold border"
                :class="
                  sensors.bioHaptic.enabled
                    ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/45'
                    : 'kg-subtle-surface kg-text-secondary'
                "
                :style="theme === 'daylight' && sensors.bioHaptic.enabled ? 'color:#065f46' : ''"
                @click="emit('toggle-sensor', 'bioHaptic')"
              >
                {{ sensors.bioHaptic.enabled ? 'Enabled' : 'Muted' }}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
