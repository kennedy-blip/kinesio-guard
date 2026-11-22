/**
 * Hardware & OS Sensor Permission Matrix + Optical Head-Pitch Posture Estimator + Bio-Haptics
 * Bridges Native Android Java 17 Capacitor plugins, Browser IMU APIs, Webcam ROI, and Web Audio.
 */

let sharedAudioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!sharedAudioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx) sharedAudioCtx = new Ctx()
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {})
  }
  return sharedAudioCtx
}

/**
 * Emits a soothing clinical two-note harmonic chime (432 Hz + 648 Hz perfect fifth)
 * when the Cervical Spine Posture Guardian detects prolonged tech-neck slouching.
 */
export function playPostureHarmonicChime(severity = 'moderate') {
  const ctx = getAudioContext()
  if (!ctx) return false

  const now = ctx.currentTime
  const baseFreq = severity === 'critical' ? 528 : 432
  const fifthFreq = baseFreq * 1.5

  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.14, now + 0.03)
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.85)
  master.connect(ctx.destination)

  const osc1 = ctx.createOscillator()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(baseFreq, now)
  osc1.connect(master)

  const osc2 = ctx.createOscillator()
  osc2.type = 'triangle'
  osc2.frequency.setValueAtTime(fifthFreq, now + 0.09)
  const g2 = ctx.createGain()
  g2.gain.setValueAtTime(0.45, now)
  osc2.connect(g2)
  g2.connect(master)

  osc1.start(now)
  osc2.start(now + 0.09)
  osc1.stop(now + 0.88)
  osc2.stop(now + 0.88)
  return true
}

/**
 * Emits a phase-inverted haptic pulse train via Android BioHapticStabilizerPlugin or Web Vibration API.
 */
export async function emitBioHapticFeedback(mode = 'posture', frequencyHz = 5.5) {
  if (typeof window === 'undefined') return { emitted: false, channel: 'none' }

  const nativeHaptic = window.Capacitor?.Plugins?.BioHapticStabilizer
  if (nativeHaptic) {
    try {
      if (mode === 'tremor-pacing') {
        await nativeHaptic.startPhaseInvertedPacing({
          frequencyHz,
          phaseOffsetDeg: 180,
          amplitude: 165,
          cycles: 12
        })
      } else if (mode === 'romberg-transition' || mode === 'romberg-complete') {
        await nativeHaptic.emitRombergEyesClosedCue({
          stage: mode === 'romberg-complete' ? 'TRIAL_COMPLETE' : 'EYES_CLOSED_TRANSITION'
        })
      } else {
        await nativeHaptic.emitCervicalPostureAlert({ flexionDegrees: 38 })
      }
      return { emitted: true, channel: 'JAVA_NATIVE_LRA' }
    } catch {
      // Fall through to Web Vibration API
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    if (mode === 'tremor-pacing') {
      const periodMs = Math.max(50, Math.round(1000 / Math.max(2, frequencyHz)))
      const onMs = Math.round(periodMs * 0.3)
      const offMs = periodMs - onMs
      navigator.vibrate([onMs, offMs, onMs, offMs, onMs, offMs, onMs])
    } else if (mode === 'romberg-transition') {
      navigator.vibrate([55, 55, 55, 55, 85])
    } else if (mode === 'romberg-complete') {
      navigator.vibrate([90, 60, 140])
    } else {
      navigator.vibrate([45, 65, 85])
    }
    return { emitted: true, channel: 'WEB_VIBRATION_API' }
  }

  return { emitted: false, channel: 'AUDIO_BIOFEEDBACK_FALLBACK' }
}

/**
 * Probes the live Android Capacitor 6 Java 17 plugin bridge when running inside the installed .APK.
 */
export async function probeNativeAndroidBridge() {
  if (typeof window === 'undefined') {
    return { isNativeApk: false, platform: 'ssr', imuCaps: null, hapticCaps: null, ecoProfile: null }
  }
  const cap = window.Capacitor
  const isNativeApk = Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
  if (!isNativeApk) {
    return {
      isNativeApk: false,
      platform: 'web-browser',
      imuCaps: null,
      hapticCaps: null,
      ecoProfile: null
    }
  }

  let imuCaps = null
  let hapticCaps = null
  let ecoProfile = null

  try {
    if (cap.Plugins?.InertialKinematics?.getHardwareCapabilities) {
      imuCaps = await cap.Plugins.InertialKinematics.getHardwareCapabilities()
    }
  } catch {
    imuCaps = null
  }

  try {
    if (cap.Plugins?.BioHapticStabilizer?.getHapticStatus) {
      hapticCaps = await cap.Plugins.BioHapticStabilizer.getHapticStatus()
    }
    if (cap.Plugins?.BioHapticStabilizer?.getDeviceEcoGpuProfile) {
      ecoProfile = await cap.Plugins.BioHapticStabilizer.getDeviceEcoGpuProfile()
    }
  } catch {
    hapticCaps = null
  }

  return {
    isNativeApk: true,
    platform: cap.getPlatform ? cap.getPlatform() : 'android',
    imuCaps,
    hapticCaps,
    ecoProfile
  }
}

/**
 * Estimates cranial forward-lean flexion angle (0° - 60°) from a live webcam video frame
 * by tracking upper-frame facial skin/luminance centroid vertical drop relative to calibrated neutral.
 */
export function estimateWebcamHeadFlexionDeg(videoEl, scratchCanvas, neutralCentroidY = null) {
  if (!videoEl || videoEl.readyState < 2 || !scratchCanvas) {
    return null
  }
  const w = 96
  const h = 72
  if (scratchCanvas.width !== w) scratchCanvas.width = w
  if (scratchCanvas.height !== h) scratchCanvas.height = h

  const ctx = scratchCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(videoEl, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data

  let weightedY = 0
  let weightedX = 0
  let totalWeight = 0

  // Focus ROI on central cranial corridor (x: 20%..80%, y: 8%..88%)
  for (let y = 6; y < h - 8; y++) {
    for (let x = 18; x < w - 18; x++) {
      const idx = (y * w + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      // Warm skin-chrominance + mid-high luminance weighting
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      const warmth = Math.max(0, r - b * 0.85)
      if (luma > 42 && luma < 242) {
        const centerBias = 1 - Math.abs(x / w - 0.5) * 1.3
        const wgt = (luma * 0.35 + warmth * 0.95) * Math.max(0.2, centerBias)
        weightedY += y * wgt
        weightedX += x * wgt
        totalWeight += wgt
      }
    }
  }

  if (totalWeight < 100) return null
  const normY = weightedY / totalWeight / h
  const normX = weightedX / totalWeight / w
  const baselineY = neutralCentroidY ?? 0.40
  const deltaDown = Math.max(-0.08, normY - baselineY)
  const estimatedDeg = Math.max(0, Math.min(60, 8 + deltaDown * 185))

  return {
    flexionDegrees: Number(estimatedDeg.toFixed(1)),
    centroidX: Number(normX.toFixed(3)),
    centroidY: Number(normY.toFixed(3))
  }
}

export async function requestMotionOrientationPermissions() {
  let motionGranted = false
  let orientationGranted = false

  if (typeof window === 'undefined') {
    return { motionGranted, orientationGranted, nativeJavaActive: false }
  }

  if (window.Capacitor?.Plugins?.InertialKinematics) {
    try {
      const res = await window.Capacitor.Plugins.InertialKinematics.startHighRateStream({
        sampleRateHz: 200,
        bridgeFps: 60
      })
      return {
        motionGranted: Boolean(res?.started),
        orientationGranted: Boolean(res?.started),
        nativeJavaActive: true
      }
    } catch {
      // Fallback to standard browser sensors
    }
  }

  try {
    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function'
    ) {
      const p = await DeviceMotionEvent.requestPermission()
      motionGranted = p === 'granted'
    } else if (typeof window.DeviceMotionEvent !== 'undefined') {
      motionGranted = true
    }
  } catch {
    motionGranted = false
  }

  try {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      const p = await DeviceOrientationEvent.requestPermission()
      orientationGranted = p === 'granted'
    } else if (typeof window.DeviceOrientationEvent !== 'undefined') {
      orientationGranted = true
    }
  } catch {
    orientationGranted = false
  }

  return { motionGranted, orientationGranted, nativeJavaActive: false }
}
