/**
 * Go 1.22 Biomechanics Mirror & /api/kinesio_triage Serverless Connector (Pure ES2024)
 * Exact mathematical parity with go_biomechanics/hansraj_cervical.go for 60fps offline & online triage.
 */

const POUNDS_TO_NEWTONS = 4.4482216153
const GRAVITY_MPS2 = 9.80665
const DEFAULT_HEAD_KG = 4.9895

function round2(v) {
  return Math.round(v * 100) / 100
}

/**
 * Exact Hansraj (2014) Cervical Disc Compressive Load Curve:
 * 0° = 11.0 lbs (49 N), 15° = 27.0 lbs (120 N), 30° = 40.0 lbs (178 N),
 * 45° = 49.0 lbs (218 N), 60° = 60.0 lbs (267 N).
 */
export function interpolateHansrajLbs(angleDeg) {
  const clamped = Math.max(0, Math.min(75, Number(angleDeg) || 0))
  const knotsDeg = [0, 15, 30, 45, 60, 75]
  const knotsLbs = [11.0, 27.0, 40.0, 49.0, 60.0, 68.5]

  for (let i = 0; i < knotsDeg.length - 1; i++) {
    if (clamped <= knotsDeg[i + 1]) {
      const span = knotsDeg[i + 1] - knotsDeg[i]
      const t = (clamped - knotsDeg[i]) / span
      const smoothT = 0.5 * t + 0.5 * (0.5 * (1 - Math.cos(Math.PI * t)))
      return knotsLbs[i] + (knotsLbs[i + 1] - knotsLbs[i]) * smoothT
    }
  }
  return knotsLbs[knotsLbs.length - 1]
}

export function evaluateCervicalLoadOffline(flexionDeg = 15, headMassKg = DEFAULT_HEAD_KG, dailyScreenHours = 5.5) {
  const theta = Math.max(0, Math.min(65, Number(flexionDeg) || 0))
  const massScale = headMassKg >= 3.0 && headMassKg <= 8.5 ? headMassKg / DEFAULT_HEAD_KG : 1.0
  const hours = Math.max(0.25, Math.min(18.0, Number(dailyScreenHours) || 5.5))

  const effectiveLbs = interpolateHansrajLbs(theta) * massScale
  const forceNewtons = effectiveLbs * POUNDS_TO_NEWTONS
  const multiplier = effectiveLbs / (11.0 * massScale)

  const rad = (theta * Math.PI) / 180
  const effectiveLeverM = 0.095 + 0.048 * Math.sin(rad)
  const actualMassKg = DEFAULT_HEAD_KG * massScale
  const torqueNm = actualMassKg * GRAVITY_MPS2 * effectiveLeverM * Math.sin(rad)
  const anteriorShearN = forceNewtons * Math.sin(rad * 0.72)
  const dailyTonHrs = (effectiveLbs * hours) / 2000.0

  let postureRiskZone = 'OPTIMAL_NEUTRAL_LORDOSIS'
  let clinicalAdvisory = 'Neutral C1–C7 alignment (11–18 lbs). Intradiscal hydrostatic pressure is minimal.'

  if (theta >= 45) {
    postureRiskZone = 'CRITICAL_C5_C7_OVERLOAD'
    clinicalAdvisory = 'Severe cervical flexion (>45° / 49–60 lbs). Elevate display to eye level immediately.'
  } else if (theta >= 25) {
    postureRiskZone = 'MODERATE_TECH_NECK_STRAIN'
    clinicalAdvisory = 'Elevated posterior ligamentous creep (36–48 lbs). Perform 15s chin-tuck retraction.'
  } else if (theta >= 12) {
    postureRiskZone = 'MILD_FLEXION_ENGAGED'
    clinicalAdvisory = 'Mild forward cranial tilt (24–34 lbs). Maintain scapular depression and ergonomic gaze.'
  }

  const levels = [
    { level: 'C1–C2 (Atlantoaxial)', share: 0.42, areaCm2: 3.4, shearMul: 0.30 },
    { level: 'C2–C3 (Upper Cervical)', share: 0.56, areaCm2: 3.15, shearMul: 0.45 },
    { level: 'C3–C4 (Mid-Upper)', share: 0.71, areaCm2: 3.05, shearMul: 0.62 },
    { level: 'C4–C5 (Mid-Cervical Apex)', share: 0.86, areaCm2: 2.95, shearMul: 0.82 },
    { level: 'C5–C6 (Primary Tech-Neck Fulcrum)', share: 1.00, areaCm2: 2.85, shearMul: 1.00 },
    { level: 'C6–C7 (Lower Cervical Base)', share: 0.97, areaCm2: 3.10, shearMul: 0.94 }
  ]

  const segmentVectors = levels.map((lv) => {
    const segCompN = forceNewtons * lv.share
    const segShearN = anteriorShearN * lv.shearMul
    const pressureMPa = segCompN / (lv.areaCm2 * 100)
    let strainStatus = 'NOMINAL'
    if (pressureMPa > 0.72) strainStatus = 'HIGH_SHEAR'
    else if (pressureMPa > 0.48) strainStatus = 'ELEVATED'

    return {
      level: lv.level,
      flexionShareRatio: round2(lv.share),
      compressiveForceN: round2(segCompN),
      anteriorShearN: round2(segShearN),
      discPressureMPa: round2(pressureMPa),
      strainStatus
    }
  })

  return {
    flexionDegrees: round2(theta),
    effectiveLoadLbs: round2(effectiveLbs),
    compressiveForceNewtons: round2(forceNewtons),
    loadMultiplier: round2(multiplier),
    cervicalTorqueNm: round2(torqueNm),
    anteriorShearC5C7N: round2(anteriorShearN),
    dailyCompressionTonHrs: round2(dailyTonHrs),
    postureRiskZone,
    clinicalAdvisory,
    segmentVectors
  }
}

export async function invokeGoKinesioTriage(payload = {}) {
  const startedAt = performance.now()
  try {
    const res = await fetch('/api/kinesio_triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (res.ok) {
      const json = await res.json()
      return {
        ...json,
        latencyMs: round2(performance.now() - startedAt),
        transport: 'HTTP_200_GO_ENDPOINT'
      }
    }
  } catch {
    // Seamless offline fallback for APK & disconnected environments
  }

  const cervical = evaluateCervicalLoadOffline(
    payload.flexionDegrees ?? 25,
    payload.headMassKg ?? 5.0,
    payload.dailyScreenHours ?? 5.5
  )
  const ampMm = Math.max(0, Number(payload.tremorRmsMm) || 0.04)
  const logUpdrsScore = ampMm < 0.12 ? 0 : round2(Math.max(0, Math.min(4, Math.log10((ampMm / 10) / 0.025) * 1.65)))
  const openArea = Math.max(4, Number(payload.eyesOpenAreaMm2) || 42)
  const closedArea = Math.max(2, Number(payload.eyesClosedAreaMm2) || 57)
  const rq = round2(closedArea / openArea)

  return {
    engine: 'KINESIO-GUARD Offline Go Biomechanics Mirror',
    goRuntimeVersion: 'go1.22-offline-mirror',
    computedAtISO: new Date().toISOString(),
    latencyMs: round2(performance.now() - startedAt),
    transport: 'OFFLINE_DETERMINISTIC_MIRROR',
    cervical,
    tremor: {
      dominantFreqHz: round2(payload.tremorFreqHz ?? 8.2),
      rmsDisplacementMm: round2(ampMm),
      logUpdrsScore,
      discreteUpdrsGrade: Math.round(logUpdrsScore)
    },
    romberg: {
      eyesOpenAreaMm2: openArea,
      eyesClosedAreaMm2: closedArea,
      rombergQuotient: rq,
      vestibularAlert: closedArea > 260 || rq > 3.2
    }
  }
}
