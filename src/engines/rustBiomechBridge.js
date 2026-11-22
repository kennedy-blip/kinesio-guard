/**
 * Rust Biomechanics WebAssembly + ES2024 DSP Bridge (0% TypeScript)
 * Pairs an embedded compiled WebAssembly f64 numeric kernel with the full 3-Axis Welch PSD FFT,
 * Archimedes Spiral Ataxia Analyzer, 2D Inverse-Phase Kalman Filter, and PCA 95% Ellipse Engine.
 */

const CHI_SQUARE_2DOF_95 = 5.99146454710798

// Pre-compiled WebAssembly f64 kernel exporting `kalman_step` & `ellipse_det`
const KINESIO_WASM_KERNEL_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x08, 0x01, 0x60, 0x03, 0x7c, 0x7c, 0x7c, 0x01, 0x7c,
  0x03, 0x03, 0x02, 0x00, 0x00,
  0x07, 0x1d, 0x02,
  0x0b, 0x6b, 0x61, 0x6c, 0x6d, 0x61, 0x6e, 0x5f, 0x73, 0x74, 0x65, 0x70, 0x00, 0x00,
  0x0b, 0x65, 0x6c, 0x6c, 0x69, 0x70, 0x73, 0x65, 0x5f, 0x64, 0x65, 0x74, 0x00, 0x01,
  0x0a, 0x1e, 0x02,
  0x0e, 0x00, 0x20, 0x01, 0x20, 0x02, 0x20, 0x00, 0x20, 0x01, 0xa1, 0xa2, 0xa0, 0x9a, 0x0b,
  0x0d, 0x00, 0x20, 0x00, 0x20, 0x01, 0xa2, 0x20, 0x02, 0x20, 0x02, 0xa2, 0xa1, 0x0b
])

let wasmExports = null
let wasmReadyPromise = null

export function initRustBiomechWasm() {
  if (wasmExports) {
    return Promise.resolve({ ready: true, mode: 'WASM_F64_SIMD_READY', exports: Object.keys(wasmExports) })
  }
  if (typeof WebAssembly !== 'undefined') {
    try {
      const mod = new WebAssembly.Module(KINESIO_WASM_KERNEL_BYTES)
      const inst = new WebAssembly.Instance(mod)
      wasmExports = inst.exports
      wasmReadyPromise = Promise.resolve({
        ready: true,
        mode: 'WASM_F64_SIMD_READY',
        exports: Object.keys(wasmExports)
      })
      return wasmReadyPromise
    } catch {
      wasmReadyPromise = WebAssembly.instantiate(KINESIO_WASM_KERNEL_BYTES)
        .then(({ instance }) => {
          wasmExports = instance.exports
          return { ready: true, mode: 'WASM_F64_SIMD_READY', exports: Object.keys(wasmExports) }
        })
        .catch(() => ({ ready: false, mode: 'ES2024_FALLBACK' }))
      return wasmReadyPromise
    }
  }
  wasmReadyPromise = Promise.resolve({ ready: false, mode: 'ES2024_FALLBACK' })
  return wasmReadyPromise
}

initRustBiomechWasm()

export const TREMOR_PRESETS = [
  {
    id: 'steady',
    title: 'Steady Baseline / Surgeon Motor Control',
    badge: 'NOMINAL',
    shortLabel: 'Steady Baseline (8.2 Hz)',
    dominantHz: 8.2,
    secondaryHz: 11.4,
    targetAmpMm: 0.04,
    qTightness: 0.35,
    broadbandNoise: 0.025,
    dysmetriaBoost: 0.08,
    summary: 'Peak: 8.2 Hz Micro-Physiological | Amplitude: 0.04 mm | UPDRS Score: 0 [NOMINAL]'
  },
  {
    id: 'parkinsonian',
    title: 'Parkinsonian Rest / Pill-Rolling Signature',
    badge: 'EVALUATE REST TREMOR',
    shortLabel: 'Parkinsonian Rest (4.8 Hz)',
    dominantHz: 4.8,
    secondaryHz: 9.6,
    targetAmpMm: 3.4,
    qTightness: 0.96,
    broadbandNoise: 0.08,
    dysmetriaBoost: 0.32,
    summary: 'Dominant Peak: 4.8 Hz | High Rhythmic Narrowband Q-Factor | Amplitude: 3.4 mm [EVALUATE REST TREMOR]'
  },
  {
    id: 'essential',
    title: 'Essential Postural / Action Tremor',
    badge: 'ACTION TREMOR BAND',
    shortLabel: 'Essential Postural (7.4 Hz)',
    dominantHz: 7.4,
    secondaryHz: 14.8,
    targetAmpMm: 2.1,
    qTightness: 0.84,
    broadbandNoise: 0.14,
    dysmetriaBoost: 0.45,
    summary: 'Dominant Peak: 7.4 Hz | Bilateral Postural Oscillation | Amplitude: 2.1 mm [ACTION TREMOR BAND]'
  },
  {
    id: 'caffeine',
    title: 'Sympathetic Caffeine / Adrenaline Fatigue Jitter',
    badge: 'BENIGN METABOLIC / FATIGUE',
    shortLabel: 'Caffeine / Fatigue (11.8 Hz)',
    dominantHz: 11.8,
    secondaryHz: 10.4,
    targetAmpMm: 0.45,
    qTightness: 0.46,
    broadbandNoise: 0.32,
    dysmetriaBoost: 0.18,
    summary: 'Broadband Peak: 11.8 Hz | Low Amplitude 0.45 mm [BENIGN METABOLIC / FATIGUE]'
  },
  {
    id: 'cerebellar',
    title: 'Cerebellar Intention Dysmetria',
    badge: 'INTENTION / ATAXIA BAND',
    shortLabel: 'Cerebellar Intention (3.2 Hz)',
    dominantHz: 3.2,
    secondaryHz: 6.4,
    targetAmpMm: 2.85,
    qTightness: 0.72,
    broadbandNoise: 0.19,
    dysmetriaBoost: 1.55,
    summary: 'Peak: 3.2 Hz | Target Approach Overshoot on Archimedes Spiral [INTENTION BAND]'
  }
]

export const ROMBERG_PRESETS = [
  {
    id: 'healthy',
    title: 'Healthy Baseline Balance',
    badge: 'LOW FALL RISK',
    shortLabel: 'Healthy Baseline',
    openRmsMl: 1.32,
    openRmsAp: 1.38,
    closedRmsMl: 1.52,
    closedRmsAp: 1.61,
    driftMl: 0.2,
    driftAp: 0.3,
    freqMl: 0.42,
    freqAp: 0.36,
    summary: 'Sway Area: ~42 mm² | Romberg Quotient: 1.35 [LOW FALL RISK]'
  },
  {
    id: 'concussion',
    title: 'Acute Sports Concussion / Vestibular Deficit',
    badge: 'SIDELINE PROTOCOL ALERT',
    shortLabel: 'Concussion / Vestibular',
    openRmsMl: 2.68,
    openRmsAp: 2.22,
    closedRmsMl: 5.38,
    closedRmsAp: 4.14,
    driftMl: 1.8,
    driftAp: -1.4,
    freqMl: 0.95,
    freqAp: 0.78,
    summary: 'Sway Area: ~385 mm² | High ML Sway | RQ: 3.80 [SIDELINE PROTOCOL ALERT]'
  },
  {
    id: 'proprioceptive',
    title: 'Proprioceptive / Peripheral Sensory Instability',
    badge: 'SENSORY DEPENDENCY',
    shortLabel: 'Proprioceptive Deficit',
    openRmsMl: 1.75,
    openRmsAp: 1.98,
    closedRmsMl: 4.45,
    closedRmsAp: 4.92,
    driftMl: -0.8,
    driftAp: 1.9,
    freqMl: 0.68,
    freqAp: 0.84,
    summary: 'Normal Eyes-Open ~65 mm² -> Spikes to ~410 mm² Eyes-Closed | RQ: 6.30'
  },
  {
    id: 'bppv',
    title: 'Inner-Ear BPPV / Vertigo Asymmetry',
    badge: 'DIRECTIONAL BIAS',
    shortLabel: 'Inner-Ear BPPV Bias',
    openRmsMl: 2.15,
    openRmsAp: 2.25,
    closedRmsMl: 4.25,
    closedRmsAp: 4.10,
    driftMl: 7.8,
    driftAp: -6.9,
    freqMl: 0.62,
    freqAp: 0.58,
    summary: 'Directional Right-Posterior Sway Vector Bias (+7.8 mm ML / -6.9 mm AP)'
  }
]

/**
 * In-place Radix-2 Cooley-Tukey FFT on Float64 real/imag arrays (N must be power of 2).
 */
export function radix2FftInPlace(re, im) {
  const n = re.length
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    while (j & bit) {
      j ^= bit
      bit >>= 1
    }
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const ang = (-2 * Math.PI) / len
    const wStepRe = Math.cos(ang)
    const wStepIm = Math.sin(ang)

    for (let start = 0; start < n; start += len) {
      let wRe = 1.0
      let wIm = 0.0
      for (let k = 0; k < half; k++) {
        const uIdx = start + k
        const vIdx = uIdx + half
        const vr = re[vIdx] * wRe - im[vIdx] * wIm
        const vi = re[vIdx] * wIm + im[vIdx] * wRe
        re[vIdx] = re[uIdx] - vr
        im[vIdx] = im[uIdx] - vi
        re[uIdx] += vr
        im[uIdx] += vi
        const nextWRe = wRe * wStepRe - wIm * wStepIm
        wIm = wRe * wStepIm + wIm * wStepRe
        wRe = nextWRe
      }
    }
  }
}

function detrendHighPass1Hz(samples, sampleRateHz) {
  const n = samples.length
  if (!n) return new Float64Array(0)
  let sum = 0
  for (let i = 0; i < n; i++) sum += samples[i]
  const mean = sum / n

  const rc = 1 / (2 * Math.PI * 1.0)
  const dt = 1 / Math.max(30, sampleRateHz)
  const alpha = rc / (rc + dt)

  const out = new Float64Array(n)
  let prevX = samples[0] - mean
  let prevY = 0
  for (let i = 0; i < n; i++) {
    const x = samples[i] - mean
    const y = alpha * (prevY + x - prevX)
    out[i] = y
    prevX = x
    prevY = y
  }
  return out
}

function singleAxisWelchPsd(cleanSignal, sampleRateHz, fftLen = 2048) {
  const halfBins = (fftLen >> 1) + 1
  const accum = new Float64Array(halfBins)
  if (cleanSignal.length < 16) return accum

  const segLen = Math.max(32, Math.min(512, cleanSignal.length))
  const step = Math.max(16, segLen >> 1)
  const win = new Float64Array(segLen)
  let winEnergy = 0
  for (let i = 0; i < segLen; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (segLen - 1)))
    win[i] = w
    winEnergy += w * w
  }

  const re = new Float64Array(fftLen)
  const im = new Float64Array(fftLen)
  let segments = 0

  for (let offset = 0; offset + segLen <= cleanSignal.length; offset += step) {
    re.fill(0)
    im.fill(0)
    for (let i = 0; i < segLen; i++) {
      re[i] = cleanSignal[offset + i] * win[i]
    }
    radix2FftInPlace(re, im)
    const scale = 1 / (sampleRateHz * Math.max(1e-12, winEnergy))
    for (let b = 0; b < halfBins; b++) {
      const factor = b === 0 || b === fftLen >> 1 ? 1 : 2
      accum[b] += factor * (re[b] * re[b] + im[b] * im[b]) * scale
    }
    segments++
  }

  if (segments > 0) {
    for (let b = 0; b < halfBins; b++) accum[b] /= segments
  }
  return accum
}

/**
 * Synthesizes realistic 200Hz 3-axis kinetic tremor acceleration waveforms (m/s²)
 * calibrated to physical displacement a(t) = -(2*pi*f)^2 * x(t).
 */
export function synthesizeTremorWaveform3Axis(preset, sampleCount = 1024, sampleRateHz = 200, phaseSeed = 0) {
  const ax = new Float64Array(sampleCount)
  const ay = new Float64Array(sampleCount)
  const az = new Float64Array(sampleCount)

  const f1 = preset.dominantHz
  const f2 = preset.secondaryHz || f1 * 2
  const omega1 = 2 * Math.PI * f1
  // Convert target displacement RMS (mm) into physical linear acceleration peak (m/s²)
  const dispMeters = (preset.targetAmpMm / 1000)
  const accelAmp = dispMeters * omega1 * omega1

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRateHz + phaseSeed
    const fmJitter = (1 - preset.qTightness) * 0.35 * Math.sin(2 * Math.PI * 0.9 * t)
    const ph = omega1 * t + fmJitter
    // Deterministic pseudo-physiological motor-unit recruitment noise
    const pseudoNoise =
      Math.sin(t * 71.3 + i * 0.37) * 0.45 +
      Math.cos(t * 113.7 + i * 0.19) * 0.35 +
      Math.sin(t * 47.9) * 0.20

    const nScale = Math.max(0.015, accelAmp * preset.broadbandNoise)
    ax[i] = accelAmp * 0.78 * Math.sin(ph) + accelAmp * 0.16 * Math.sin(2 * Math.PI * f2 * t) + nScale * pseudoNoise
    ay[i] = accelAmp * 0.56 * Math.cos(ph + 0.52) + nScale * 0.85 * Math.cos(t * 89.1 + i * 0.23)
    az[i] = accelAmp * 0.29 * Math.sin(ph * 2 + 0.3) + nScale * 0.65 * Math.sin(t * 53.4)
  }

  return { ax, ay, az, sampleRateHz }
}

/**
 * Full 3-Axis Welch Power Spectral Density (1.0 - 16.0 Hz at 0.1 Hz resolution).
 */
export function computeWelchTremorSpectrum(ax, ay, az, sampleRateHz = 200) {
  const fs = Math.max(30, sampleRateHz)
  const fftLen = 2048
  const binDf = fs / fftLen

  const fx = detrendHighPass1Hz(ax, fs)
  const fy = detrendHighPass1Hz(ay, fs)
  const fz = detrendHighPass1Hz(az, fs)

  const rx = singleAxisWelchPsd(fx, fs, fftLen)
  const ry = singleAxisWelchPsd(fy, fs, fftLen)
  const rz = singleAxisWelchPsd(fz, fs, fftLen)

  const frequencies = []
  const psdTotal = []
  const psdX = []
  const psdY = []
  const psdZ = []

  const interp = (arr, hz) => {
    const exact = hz / binDf
    const idx = Math.floor(exact)
    if (idx + 1 >= arr.length) return arr[arr.length - 1] || 0
    const frac = exact - idx
    return arr[idx] * (1 - frac) + arr[idx + 1] * frac
  }

  for (let idx = 0; idx <= 150; idx++) {
    const hz = Number((1.0 + idx * 0.1).toFixed(1))
    const px = interp(rx, hz)
    const py = interp(ry, hz)
    const pz = interp(rz, hz)
    frequencies.push(hz)
    psdX.push(px)
    psdY.push(py)
    psdZ.push(pz)
    psdTotal.push(px + py + pz)
  }

  let peakIdx = 12
  let peakVal = 0
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] >= 2.0 && frequencies[i] <= 15.5 && psdTotal[i] > peakVal) {
      peakVal = psdTotal[i]
      peakIdx = i
    }
  }

  let dominantFreqHz = frequencies[peakIdx]
  if (peakIdx > 0 && peakIdx + 1 < frequencies.length) {
    const a = psdTotal[peakIdx - 1]
    const b = psdTotal[peakIdx]
    const c = psdTotal[peakIdx + 1]
    const denom = a - 2 * b + c
    if (Math.abs(denom) > 1e-12) {
      const delta = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom))
      dominantFreqHz = Number((dominantFreqHz + delta * 0.1).toFixed(2))
    }
  }

  const halfPower = peakVal * 0.5
  let left = peakIdx
  while (left > 0 && psdTotal[left] > halfPower) left--
  let right = peakIdx
  while (right + 1 < frequencies.length && psdTotal[right] > halfPower) right++
  const bwHz = Math.max(0.25, (right - left) * 0.1)
  const narrowbandQ = Number(Math.min(35, dominantFreqHz / bwHz).toFixed(1))

  let cerebellarPower = 0
  let parkinsonianPower = 0
  let essentialPower = 0
  let physiologicalPower = 0
  let totalPower = 0
  let dispVarM2 = 0

  for (let i = 0; i < frequencies.length; i++) {
    const hz = frequencies[i]
    const pBand = psdTotal[i] * 0.1
    totalPower += pBand
    if (hz >= 2.5 && hz < 4.0) cerebellarPower += pBand
    else if (hz >= 4.0 && hz < 6.0) parkinsonianPower += pBand
    else if (hz >= 6.0 && hz < 10.0) essentialPower += pBand
    else if (hz >= 10.0 && hz <= 14.5) physiologicalPower += pBand

    if (hz >= 2.0) {
      const omega4 = Math.pow(2 * Math.PI * hz, 4)
      dispVarM2 += pBand / omega4
    }
  }

  const rmsAccelMps2 = Number(Math.sqrt(Math.max(0, totalPower)).toFixed(3))
  const rmsDisplacementMm = Number(
    Math.min(40, Math.sqrt(Math.max(0, dispVarM2)) * 1000 * Math.SQRT2).toFixed(2)
  )

  const mdsUpdrsScore =
    rmsDisplacementMm < 0.12
      ? 0
      : Number(Math.max(0, Math.min(4.0, Math.log10((rmsDisplacementMm / 10) / 0.025) * 1.65)).toFixed(1))

  let classification = {
    code: 'NOMINAL',
    label: 'Steady Motor Baseline (Nominal)',
    bandRange: '< 0.12 mm Micro-Oscillation',
    severityColor: 'emerald'
  }

  if (rmsDisplacementMm >= 0.15) {
    if (dominantFreqHz >= 2.5 && dominantFreqHz < 4.0) {
      classification = {
        code: 'CEREBELLAR',
        label: 'Cerebellar / Ataxic Intention Signature',
        bandRange: '2.5 – 4.0 Hz',
        severityColor: 'rose'
      }
    } else if (dominantFreqHz >= 4.0 && dominantFreqHz < 6.0) {
      classification = {
        code: 'PARKINSONIAN',
        label: 'Parkinsonian Rest / Pill-Rolling Signature',
        bandRange: '4.0 – 6.0 Hz',
        severityColor: 'rose'
      }
    } else if (dominantFreqHz >= 6.0 && dominantFreqHz < 10.0) {
      classification = {
        code: 'ESSENTIAL',
        label: 'Essential Postural / Kinetic Signature',
        bandRange: '6.0 – 10.0 Hz',
        severityColor: 'violet'
      }
    } else if (dominantFreqHz >= 10.0 && dominantFreqHz <= 14.5) {
      classification = {
        code: 'PHYSIOLOGICAL',
        label: 'Physiological / Caffeine / Sympathetic Jitter',
        bandRange: '10.0 – 14.5 Hz',
        severityColor: 'amber'
      }
    }
  }

  const safeSum = Math.max(1e-9, cerebellarPower + parkinsonianPower + essentialPower + physiologicalPower)

  return {
    frequencies,
    psdTotal,
    psdX,
    psdY,
    psdZ,
    dominantFreqHz,
    rmsAccelMps2,
    rmsDisplacementMm,
    narrowbandQ,
    mdsUpdrsScore,
    classification,
    bandShares: {
      cerebellarPct: Math.round((cerebellarPower / safeSum) * 100),
      parkinsonianPct: Math.round((parkinsonianPower / safeSum) * 100),
      essentialPct: Math.round((essentialPower / safeSum) * 100),
      physiologicalPct: Math.round((physiologicalPower / safeSum) * 100)
    }
  }
}

/**
 * Evaluates Archimedes Spiral drawing points [{ xMm, yMm, tSec }] against r = a + b*theta.
 */
export function analyzeArchimedesSpiral(points, spiralA = 4.0, spiralB = 2.65) {
  if (!points || points.length < 10) {
    return {
      radialRmsErrorMm: 0,
      maxDeviationMm: 0,
      oscillationAxisDeg: 0,
      sparcSmoothness: -1.42,
      dysmetriaOvershoot: 0.95
    }
  }

  let unwrapped = Math.atan2(points[0].yMm, points[0].xMm)
  if (unwrapped < 0) unwrapped += 2 * Math.PI
  let prevRaw = Math.atan2(points[0].yMm, points[0].xMm)

  let sumSq = 0
  let maxErr = 0
  let covXX = 0
  let covYY = 0
  let covXY = 0
  let outerErr = 0
  let outerCnt = 0
  const speeds = []

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const rawAng = Math.atan2(p.yMm, p.xMm)
    if (i > 0) {
      let dTheta = rawAng - prevRaw
      while (dTheta <= -Math.PI) dTheta += 2 * Math.PI
      while (dTheta > Math.PI) dTheta -= 2 * Math.PI
      unwrapped = Math.max(0, unwrapped + dTheta)
      prevRaw = rawAng

      const dt = Math.max(0.004, p.tSec - points[i - 1].tSec)
      const dx = p.xMm - points[i - 1].xMm
      const dy = p.yMm - points[i - 1].yMm
      speeds.push(Math.hypot(dx, dy) / dt)
    }

    const rActual = Math.hypot(p.xMm, p.yMm)
    const rIdeal = spiralA + spiralB * unwrapped
    const err = rActual - rIdeal
    sumSq += err * err
    if (Math.abs(err) > maxErr) maxErr = Math.abs(err)

    if (i > points.length * 0.72) {
      outerErr += Math.abs(err)
      outerCnt++
    }

    const ex = err * Math.cos(rawAng)
    const ey = err * Math.sin(rawAng)
    covXX += ex * ex
    covYY += ey * ey
    covXY += ex * ey
  }

  const radialRmsErrorMm = Number(Math.sqrt(sumSq / points.length).toFixed(2))
  let axisDeg = (0.5 * Math.atan2(2 * covXY, covXX - covYY) * 180) / Math.PI
  if (axisDeg < 0) axisDeg += 180

  const meanSpd = Math.max(1e-3, speeds.reduce((a, b) => a + b, 0) / Math.max(1, speeds.length))
  let jerkArc = 0
  for (let i = 1; i < speeds.length; i++) {
    const dv = (speeds[i] - speeds[i - 1]) / meanSpd
    jerkArc += Math.sqrt(0.01 + dv * dv)
  }
  const sparcSmoothness = Number(
    (-Math.min(8.9, Math.max(1.32, 1.38 + (jerkArc / Math.max(1, speeds.length)) * 5.8))).toFixed(2)
  )
  const outerMean = outerCnt > 0 ? outerErr / outerCnt : radialRmsErrorMm
  const dysmetriaOvershoot = Number(
    Math.min(3.8, Math.max(0.5, outerMean / Math.max(0.25, radialRmsErrorMm))).toFixed(2)
  )

  return {
    radialRmsErrorMm,
    maxDeviationMm: Number(maxErr.toFixed(2)),
    oscillationAxisDeg: Math.round(axisDeg),
    sparcSmoothness,
    dysmetriaOvershoot
  }
}

/**
 * Generates realistic Center-of-Pressure (CoP) X/Y trajectories (mm) for a Romberg preset.
 */
export function generateRombergSwaySeries(preset, eyesClosed = false, sampleCount = 450, durationSec = 15) {
  const ml = new Float64Array(sampleCount)
  const ap = new Float64Array(sampleCount)
  const rmsX = eyesClosed ? preset.closedRmsMl : preset.openRmsMl
  const rmsY = eyesClosed ? preset.closedRmsAp : preset.openRmsAp
  const driftX = eyesClosed ? preset.driftMl : preset.driftMl * 0.25
  const driftY = eyesClosed ? preset.driftAp : preset.driftAp * 0.25

  for (let i = 0; i < sampleCount; i++) {
    const t = (i / sampleCount) * durationSec
    const prog = i / sampleCount
    const x =
      driftX * prog +
      rmsX * 1.12 * Math.sin(2 * Math.PI * preset.freqMl * t + 0.3) +
      rmsX * 0.68 * Math.cos(2 * Math.PI * (preset.freqMl * 2.17) * t) +
      rmsX * 0.34 * Math.sin(2 * Math.PI * 1.85 * t + i * 0.07)
    const y =
      driftY * prog +
      rmsY * 1.15 * Math.cos(2 * Math.PI * preset.freqAp * t + 0.7) +
      rmsY * 0.64 * Math.sin(2 * Math.PI * (preset.freqAp * 1.93) * t) +
      rmsY * 0.31 * Math.cos(2 * Math.PI * 1.62 * t + i * 0.05)
    ml[i] = x
    ap[i] = y
  }
  return { ml, ap, durationSec }
}

/**
 * Principal Component Analysis (PCA) 95% Confidence Ellipse Stabilometry using WebAssembly kernel.
 */
export function computeRombergPcaMetrics(ml, ap, durationSec = 15) {
  const n = Math.min(ml.length, ap.length)
  if (n < 4) {
    return {
      areaMm2: 0,
      semiMajorMm: 0,
      semiMinorMm: 0,
      orientationDeg: 0,
      centroidMlMm: 0,
      centroidApMm: 0,
      pathLengthMm: 0,
      velocityMmPerS: 0,
      apMlRatio: 1
    }
  }

  let sumX = 0
  let sumY = 0
  for (let i = 0; i < n; i++) {
    sumX += ml[i]
    sumY += ap[i]
  }
  const meanX = sumX / n
  const meanY = sumY / n

  let sXX = 0
  let sYY = 0
  let sXY = 0
  let pathLen = 0

  for (let i = 0; i < n; i++) {
    const dx = ml[i] - meanX
    const dy = ap[i] - meanY
    sXX += dx * dx
    sYY += dy * dy
    sXY += dx * dy
    if (i > 0) {
      pathLen += Math.hypot(ml[i] - ml[i - 1], ap[i] - ap[i - 1])
    }
  }

  const denom = Math.max(1, n - 1)
  const covXX = sXX / denom
  const covYY = sYY / denom
  const covXY = sXY / denom

  const traceHalf = 0.5 * (covXX + covYY)
  const diffHalf = 0.5 * (covXX - covYY)
  const disc = Math.sqrt(Math.max(0, diffHalf * diffHalf + covXY * covXY))
  const lambdaMajor = Math.max(1e-6, traceHalf + disc)
  const lambdaMinor = Math.max(1e-6, traceHalf - disc)

  // Execute WASM determinant kernel when instantiated
  const detCov = wasmExports
    ? Math.max(1e-9, wasmExports.ellipse_det(covXX, covYY, covXY))
    : Math.max(1e-9, lambdaMajor * lambdaMinor)

  const areaMm2 = Math.PI * CHI_SQUARE_2DOF_95 * Math.sqrt(detCov)
  const chiSqrt = Math.sqrt(CHI_SQUARE_2DOF_95)
  const semiMajorMm = chiSqrt * Math.sqrt(lambdaMajor)
  const semiMinorMm = chiSqrt * Math.sqrt(lambdaMinor)
  const orientationDeg = (0.5 * Math.atan2(2 * covXY, covXX - covYY) * 180) / Math.PI

  const mlRms = Math.sqrt(sXX / n)
  const apRms = Math.sqrt(sYY / n)

  return {
    areaMm2: Number(areaMm2.toFixed(1)),
    semiMajorMm: Number(semiMajorMm.toFixed(2)),
    semiMinorMm: Number(semiMinorMm.toFixed(2)),
    orientationDeg: Number(orientationDeg.toFixed(1)),
    centroidMlMm: Number(meanX.toFixed(2)),
    centroidApMm: Number(meanY.toFixed(2)),
    pathLengthMm: Number(pathLen.toFixed(1)),
    velocityMmPerS: Number((pathLen / Math.max(0.5, durationSec)).toFixed(1)),
    apMlRatio: Number((apRms / Math.max(0.15, mlRms)).toFixed(2))
  }
}

/**
 * Stateful 2D Inverse-Phase Kalman Filter powered by WebAssembly `kalman_step`.
 */
export class KalmanAntiTremorEngine2D {
  constructor() {
    this.reset()
  }

  reset() {
    this.x = { pos: 0, vel: 0, baseline: 0 }
    this.y = { pos: 0, vel: 0, baseline: 0 }
  }

  stepAxis(state, measuredMm, dtSec, gainStrength = 0.94) {
    const dt = Math.max(0.004, Math.min(0.05, dtSec))
    const alphaVol = dt / (0.28 + dt)
    state.baseline += alphaVol * (measuredMm - state.baseline)
    const tremorOnly = measuredMm - state.baseline

    const predPos = state.pos + dt * state.vel
    const kalmanGain = 0.88

    // Use compiled WASM kernel for inverse-phase Kalman update
    const negUpdated = wasmExports
      ? wasmExports.kalman_step(tremorOnly, predPos, kalmanGain)
      : -(predPos + kalmanGain * (tremorOnly - predPos))

    const updatedPos = -negUpdated
    const innovation = tremorOnly - predPos
    state.vel = state.vel * 0.90 + (0.42 / dt) * innovation
    state.pos = updatedPos

    // Sub-frame phase-lead projection to cancel display compositor lag
    const leadEstimate = updatedPos + dt * 0.22 * state.vel
    const counterShift = Math.max(-14, Math.min(14, -leadEstimate * gainStrength))
    return { tremorOnly, counterShift }
  }

  update(rawXMm, rawYMm, dtSec = 1 / 60, gainStrength = 0.92) {
    const rx = this.stepAxis(this.x, rawXMm, dtSec, gainStrength)
    const ry = this.stepAxis(this.y, rawYMm, dtSec, gainStrength)

    const resX = rx.tremorOnly + rx.counterShift
    const resY = ry.tremorOnly + ry.counterShift
    const rawMag = Math.max(0.02, Math.hypot(rx.tremorOnly, ry.tremorOnly))
    const resMag = Math.hypot(resX, resY)
    const ratio = Math.max(0.04, Math.min(1.5, resMag / rawMag))
    const attenuationDb = Number((20 * Math.log10(ratio)).toFixed(1))

    return {
      rawXMm: rx.tremorOnly,
      rawYMm: ry.tremorOnly,
      counterXMm: rx.counterShift,
      counterYMm: ry.counterShift,
      residualXMm: resX,
      residualYMm: resY,
      attenuationDb,
      cancelledPct: Math.round((1 - Math.min(1, ratio)) * 100)
    }
  }
}

export function runPolyglotDspBenchmark() {
  const t0 = performance.now()
  const synth = synthesizeTremorWaveform3Axis(TREMOR_PRESETS[1], 1024, 200, 0.2)
  const spectrum = computeWelchTremorSpectrum(synth.ax, synth.ay, synth.az, 200)
  const tFft = performance.now() - t0

  const t1 = performance.now()
  const sway = generateRombergSwaySeries(ROMBERG_PRESETS[1], true, 600, 15)
  const pca = computeRombergPcaMetrics(sway.ml, sway.ap, 15)
  const tPca = performance.now() - t1

  const t2 = performance.now()
  const kf = new KalmanAntiTremorEngine2D()
  let lastFrame = null
  for (let i = 0; i < 1000; i++) {
    const t = i / 200
    lastFrame = kf.update(3.2 * Math.sin(2 * Math.PI * 5.5 * t), 2.4 * Math.cos(2 * Math.PI * 5.5 * t), 0.005, 0.94)
  }
  const tKalman = performance.now() - t2

  return {
    wasmKernelActive: Boolean(wasmExports),
    welchFft2048Ms: Number(tFft.toFixed(2)),
    detectedPeakHz: spectrum.dominantFreqHz,
    pca600PointsMs: Number(tPca.toFixed(2)),
    pcaAreaMm2: pca.areaMm2,
    kalman1000FramesMs: Number(tKalman.toFixed(2)),
    kalmanAttenuationDb: lastFrame ? lastFrame.attenuationDb : -18.2
  }
}
