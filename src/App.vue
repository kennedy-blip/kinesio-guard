<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import SynapticShaderUnderlay from './components/visuals/SynapticShaderUnderlay.vue'
import HeaderNav from './components/navigation/HeaderNav.vue'
import MetaballDock from './components/navigation/MetaballDock.vue'
import TremorSpectrogramLab from './components/modules/TremorSpectrogramLab.vue'
import CervicalSpineLab from './components/modules/CervicalSpineLab.vue'
import RombergStabilometerLab from './components/modules/RombergStabilometerLab.vue'
import KalmanStabilizerLab from './components/modules/KalmanStabilizerLab.vue'
import PolyglotVaultLab from './components/modules/PolyglotVaultLab.vue'
import PrivilegesSensorDrawer from './components/modals/PrivilegesSensorDrawer.vue'
import ApkDownloadModal from './components/modals/ApkDownloadModal.vue'
import ClinicalReportModal from './components/modals/ClinicalReportModal.vue'

import {
  requestMotionOrientationPermissions
} from './engines/sensorFusionEngine.js'
import { invokeGoKinesioTriage } from './engines/cervicalGoMirror.js'
import {
  loadAllVaultRecords,
  saveVaultRecord,
  deleteVaultRecord,
  flushPendingVaultSync
} from './db/kinesioDb.js'

const activeTab = ref('tremor')
const theme = ref('obsidian')
const viewportMode = ref('desktop') // 'desktop' | 'mobile'
const roleTier = ref('STANDARD') // 'STANDARD' | 'PRO' | 'ADMIN'

const privilegesOpen = ref(false)
const apkModalOpen = ref(false)
const activeClinicalReport = ref(null)

// Specular cursor & gyroscope coordinates (0..1)
const pointerX = ref(0.5)
const pointerY = ref(0.3)

// Live Kinematic State feeding GLSL Synaptic Shader Underlay
const liveTelemetry = reactive({
  tremorHz: 7.4,
  tremorRmsMm: 2.1,
  updrsScore: 1.9,
  cervicalFlexionDeg: 15,
  cervicalLoadLbs: 27,
  rombergQuotient: 1.35
})

// Live Browser / Native Java IMU state
const liveImuSample = reactive({
  ax: 0,
  ay: 0,
  az: 0,
  active: false
})
const devicePitchDeg = ref(null)
const deviceRollDeg = ref(null)

// Hardware & OS Sensor Permission Matrix
const sensors = reactive({
  linearImu: {
    enabled: true,
    statusLabel: 'SIMULATOR / WEB IMU READY'
  },
  gyroClinometer: {
    enabled: true,
    statusLabel: 'SIMULATOR / CLINOMETER READY'
  },
  opticalWebcam: {
    enabled: true,
    statusLabel: 'ON-DEMAND LOCAL ROI'
  },
  bioHaptic: {
    enabled: true,
    statusLabel: 'WEB AUDIO + LRA HAPTIC READY'
  }
})

// IndexedDB Clinical Vault & Offline Sync State
const vaultRecords = ref([])
const simulateOfflineQueue = ref(false)

const activeSensorCount = computed(
  () => Object.values(sensors).filter((s) => s.enabled).length
)

const isAnyModalOpen = computed(
  () => privilegesOpen.value || apkModalOpen.value || Boolean(activeClinicalReport.value)
)

// Composite biomechanical stress index (0.0 -> 1.0) modulating GLSL shader colors & ripples
const shaderStressLevel = computed(() => {
  const tremorNorm = Math.min(1, liveTelemetry.updrsScore / 3.2)
  const spineNorm = Math.min(1, Math.max(0, (liveTelemetry.cervicalFlexionDeg - 10) / 50))
  const rombergNorm = Math.min(1, Math.max(0, (liveTelemetry.rombergQuotient - 1.4) / 3.2))
  return Math.max(tremorNorm, spineNorm, rombergNorm)
})

const flexionRatio = computed(() =>
  Math.min(1, Math.max(0, liveTelemetry.cervicalFlexionDeg / 60))
)

watch(
  theme,
  (nextTheme) => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', nextTheme)
    }
  },
  { immediate: true }
)

function updateSpecularCssVars(normX, normY) {
  pointerX.value = normX
  pointerY.value = normY
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--spec-x', `${Math.round(normX * 100)}%`)
    document.documentElement.style.setProperty('--spec-y', `${Math.round(normY * 100)}%`)
  }
}

function handlePointerMove(e) {
  if (!window.innerWidth || !window.innerHeight) return
  updateSpecularCssVars(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
}

function handleDeviceMotion(event) {
  if (!sensors.linearImu.enabled) return
  const acc = event.acceleration || event.accelerationIncludingGravity
  if (acc && (acc.x !== null || acc.y !== null)) {
    liveImuSample.ax = Number(acc.x || 0)
    liveImuSample.ay = Number(acc.y || 0)
    liveImuSample.az = Number(acc.z || 0)
    liveImuSample.active = true
    sensors.linearImu.statusLabel = 'WEB IMU 3-AXIS ACTIVE'
  }
}

function handleDeviceOrientation(event) {
  if (!sensors.gyroClinometer.enabled) return
  if (event.beta !== null && event.gamma !== null) {
    // Convert phone beta tilt (90° upright -> 0°, 30° tilted -> 60° cranial flexion)
    const uprightOffset = Math.max(0, Math.min(60, 85 - Math.abs(event.beta)))
    devicePitchDeg.value = uprightOffset
    deviceRollDeg.value = event.gamma
    sensors.gyroClinometer.statusLabel = 'WEB GYRO CLINOMETER ACTIVE'

    const gx = Math.min(1, Math.max(0, 0.5 + (event.gamma || 0) / 90))
    const gy = Math.min(1, Math.max(0, 0.5 + ((event.beta || 45) - 45) / 90))
    updateSpecularCssVars(gx, gy)
  }
}

async function handleToggleSensor(sensorKey) {
  const item = sensors[sensorKey]
  if (!item) return
  item.enabled = !item.enabled

  if (!item.enabled) {
    item.statusLabel = 'RESTRICTED BY USER'
    if (sensorKey === 'linearImu') liveImuSample.active = false
    return
  }

  if (sensorKey === 'linearImu' || sensorKey === 'gyroClinometer') {
    const perm = await requestMotionOrientationPermissions()
    if (perm.nativeJavaActive) {
      item.statusLabel = 'JAVA NATIVE 200HZ ACTIVE'
    } else if (perm.motionGranted || perm.orientationGranted) {
      item.statusLabel = 'WEB IMU / SIMULATOR ACTIVE'
    } else {
      item.statusLabel = 'SIMULATOR ACTIVE'
    }
  } else if (sensorKey === 'opticalWebcam') {
    item.statusLabel = 'ON-DEMAND LOCAL ROI'
  } else if (sensorKey === 'bioHaptic') {
    item.statusLabel = 'WEB AUDIO + LRA HAPTIC READY'
  }
}

function onSpectrumUpdated(summary) {
  liveTelemetry.tremorHz = summary.dominantFreqHz
  liveTelemetry.tremorRmsMm = summary.rmsDisplacementMm
  liveTelemetry.updrsScore = summary.mdsUpdrsScore
}

function onCervicalUpdated(summary) {
  liveTelemetry.cervicalFlexionDeg = summary.flexionDegrees
  liveTelemetry.cervicalLoadLbs = summary.effectiveLoadLbs
}

function onRombergUpdated(summary) {
  liveTelemetry.rombergQuotient = summary.rombergQuotient
}

async function handleSaveToVault(entry) {
  await saveVaultRecord(entry, simulateOfflineQueue.value)
  vaultRecords.value = await loadAllVaultRecords()
}

async function handleDeleteVaultRecord(id) {
  await deleteVaultRecord(id)
  vaultRecords.value = await loadAllVaultRecords()
}

async function handleFlushSyncQueue() {
  const res = await flushPendingVaultSync((payload) => invokeGoKinesioTriage(payload))
  vaultRecords.value = res.records
}

function handleJumpToPolyglot() {
  activeClinicalReport.value = null
  roleTier.value = 'ADMIN'
  activeTab.value = 'polyglot'
}

onMounted(async () => {
  vaultRecords.value = await loadAllVaultRecords()
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('devicemotion', handleDeviceMotion, { passive: true })
  window.addEventListener('deviceorientation', handleDeviceOrientation, { passive: true })

  // Listen to Native Android Capacitor Java 17 InertialKinematicsPlugin if inside APK
  const nativeImu = window.Capacitor?.Plugins?.InertialKinematics
  if (nativeImu && typeof nativeImu.addListener === 'function') {
    sensors.linearImu.statusLabel = 'JAVA NATIVE 200HZ ACTIVE'
    sensors.gyroClinometer.statusLabel = 'JAVA NATIVE ROTATION ACTIVE'
    nativeImu.addListener('inertialFrame', (frame) => {
      if (sensors.linearImu.enabled) {
        liveImuSample.ax = Number(frame.ax || 0)
        liveImuSample.ay = Number(frame.ay || 0)
        liveImuSample.az = Number(frame.az || 0)
        liveImuSample.active = true
      }
      if (sensors.gyroClinometer.enabled) {
        devicePitchDeg.value = Number(frame.cranialFlexionDeg || 0)
        deviceRollDeg.value = Number(frame.sternumRollDeg || 0)
      }
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('devicemotion', handleDeviceMotion)
  window.removeEventListener('deviceorientation', handleDeviceOrientation)
})
</script>

<template>
  <div class="relative min-h-screen w-full">
    <!-- Kinematic-Reactive WebGL2 GLSL Synaptic Tensor Field + Frosted Quartz Grain -->
    <SynapticShaderUnderlay
      :stress-level="shaderStressLevel"
      :tremor-hz="liveTelemetry.tremorHz"
      :flexion-ratio="flexionRatio"
      :theme="theme"
      :pointer-x="pointerX"
      :pointer-y="pointerY"
    />

    <!-- Main Depth-Push App Shell -->
    <div
      class="kg-app-shell relative z-10 min-h-screen flex flex-col"
      :class="{ 'kg-depth-pushed': isAnyModalOpen }"
    >
      <div class="mx-auto w-full max-w-[1440px] px-3 py-3 md:px-6 md:py-4 flex-1 flex flex-col gap-4">
        <!-- Global Navigation & Theme / Viewport / RBAC / APK Bar -->
        <HeaderNav
          v-model:theme="theme"
          v-model:viewport-mode="viewportMode"
          :role-tier="roleTier"
          :active-sensor-count="activeSensorCount"
          :stress-level="shaderStressLevel"
          @open-privileges="privilegesOpen = true"
          @open-apk-modal="apkModalOpen = true"
        />

        <!-- DESKTOP CLINICAL STATION LAYOUT -->
        <template v-if="viewportMode === 'desktop'">
          <MetaballDock
            v-model:active-tab="activeTab"
            :theme="theme"
            @open-apk-modal="apkModalOpen = true"
          />

          <main class="flex-1 pb-6">
            <KeepAlive>
              <TremorSpectrogramLab
                v-if="activeTab === 'tremor'"
                :role-tier="roleTier"
                :theme="theme"
                :live-imu-sample="liveImuSample"
                @spectrum-updated="onSpectrumUpdated"
                @open-clinical-report="(r) => (activeClinicalReport = r)"
                @save-to-vault="handleSaveToVault"
                @elevate-role="(tier) => (roleTier = tier)"
              />
              <CervicalSpineLab
                v-else-if="activeTab === 'cervical'"
                :role-tier="roleTier"
                :theme="theme"
                :device-pitch-deg="devicePitchDeg"
                @cervical-updated="onCervicalUpdated"
                @open-clinical-report="(r) => (activeClinicalReport = r)"
                @save-to-vault="handleSaveToVault"
                @elevate-role="(tier) => (roleTier = tier)"
              />
              <RombergStabilometerLab
                v-else-if="activeTab === 'romberg'"
                :theme="theme"
                :device-roll-deg="deviceRollDeg"
                :device-pitch-deg="devicePitchDeg"
                @romberg-updated="onRombergUpdated"
                @open-clinical-report="(r) => (activeClinicalReport = r)"
                @save-to-vault="handleSaveToVault"
              />
              <KalmanStabilizerLab
                v-else-if="activeTab === 'kalman'"
                :theme="theme"
                :live-imu-sample="liveImuSample"
              />
              <PolyglotVaultLab
                v-else
                :role-tier="roleTier"
                :theme="theme"
                :vault-records="vaultRecords"
                :simulate-offline-queue="simulateOfflineQueue"
                @elevate-role="(tier) => (roleTier = tier)"
                @toggle-offline-queue="simulateOfflineQueue = !simulateOfflineQueue"
                @flush-sync-queue="handleFlushSyncQueue"
                @delete-vault-record="handleDeleteVaultRecord"
                @open-clinical-report="(r) => (activeClinicalReport = r)"
              />
            </KeepAlive>
          </main>
        </template>

        <!-- INTERACTIVE MOBILE .APK REPLICA CHASSIS PREVIEW -->
        <template v-else>
          <div class="flex-1 flex flex-col items-center justify-center py-2">
            <div
              class="w-full max-w-[430px] rounded-[2.6rem] p-2.5 bg-slate-950/90 border-[3px] border-cyan-400/40 shadow-2xl"
            >
              <!-- Simulated Android Status Bar -->
              <div class="flex items-center justify-between px-5 pt-2 pb-2.5 text-[10px] font-mono text-slate-300">
                <span>KinesioGuard APK v1.0</span>
                <span class="h-3.5 w-20 rounded-full bg-black border border-slate-800" />
                <span class="text-emerald-400">200Hz IMU · OFFLINE</span>
              </div>

              <!-- Scrollable Mobile Viewport -->
              <div class="max-h-[68vh] overflow-y-auto px-2 py-2 space-y-3 rounded-2xl">
                <TremorSpectrogramLab
                  v-if="activeTab === 'tremor'"
                  :role-tier="roleTier"
                  :theme="theme"
                  :live-imu-sample="liveImuSample"
                  @spectrum-updated="onSpectrumUpdated"
                  @open-clinical-report="(r) => (activeClinicalReport = r)"
                  @save-to-vault="handleSaveToVault"
                  @elevate-role="(tier) => (roleTier = tier)"
                />
                <CervicalSpineLab
                  v-else-if="activeTab === 'cervical'"
                  :role-tier="roleTier"
                  :theme="theme"
                  :device-pitch-deg="devicePitchDeg"
                  @cervical-updated="onCervicalUpdated"
                  @open-clinical-report="(r) => (activeClinicalReport = r)"
                  @save-to-vault="handleSaveToVault"
                  @elevate-role="(tier) => (roleTier = tier)"
                />
                <RombergStabilometerLab
                  v-else-if="activeTab === 'romberg'"
                  :theme="theme"
                  :device-roll-deg="deviceRollDeg"
                  :device-pitch-deg="devicePitchDeg"
                  @romberg-updated="onRombergUpdated"
                  @open-clinical-report="(r) => (activeClinicalReport = r)"
                  @save-to-vault="handleSaveToVault"
                />
                <KalmanStabilizerLab
                  v-else-if="activeTab === 'kalman'"
                  :theme="theme"
                  :live-imu-sample="liveImuSample"
                />
                <PolyglotVaultLab
                  v-else
                  :role-tier="roleTier"
                  :theme="theme"
                  :vault-records="vaultRecords"
                  :simulate-offline-queue="simulateOfflineQueue"
                  @elevate-role="(tier) => (roleTier = tier)"
                  @toggle-offline-queue="simulateOfflineQueue = !simulateOfflineQueue"
                  @flush-sync-queue="handleFlushSyncQueue"
                  @delete-vault-record="handleDeleteVaultRecord"
                  @open-clinical-report="(r) => (activeClinicalReport = r)"
                />
              </div>

              <!-- Bottom Mobile Gooey Metaball Dock -->
              <div class="pt-2">
                <MetaballDock
                  v-model:active-tab="activeTab"
                  :compact-mobile="true"
                  :theme="theme"
                  @open-apk-modal="apkModalOpen = true"
                />
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Interactive Drawers & Glass Modals -->
    <PrivilegesSensorDrawer
      :open="privilegesOpen"
      :role-tier="roleTier"
      :sensors="sensors"
      :theme="theme"
      @close="privilegesOpen = false"
      @update:role-tier="(tier) => (roleTier = tier)"
      @toggle-sensor="handleToggleSensor"
    />

    <ApkDownloadModal
      :open="apkModalOpen"
      :theme="theme"
      @close="apkModalOpen = false"
    />

    <ClinicalReportModal
      :report-data="activeClinicalReport"
      :theme="theme"
      @close="activeClinicalReport = null"
      @jump-to-polyglot="handleJumpToPolyglot"
    />
  </div>
</template>
