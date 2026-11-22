// Package go_biomechanics implements Hansraj (2014) C1-C7 Cervical Spine Finite-Element
// Compressive & Shear Load Physics, MDS-UPDRS Logarithmic Tremor Scoring, and Romberg Quotients.
package go_biomechanics

import "math"

const (
	PoundsToNewtons = 4.4482216153
	GravityMPS2     = 9.80665
	DefaultHeadKg   = 4.9895 // 11.0 lbs neutral cranial mass
)

// VertebraSegmentVector models intervertebral shear, compression, and intradiscal pressure at C1-C7.
type VertebraSegmentVector struct {
	Level             string  `json:"level"`
	FlexionShareRatio float64 `json:"flexionShareRatio"`
	CompressiveForceN float64 `json:"compressiveForceN"`
	AnteriorShearN    float64 `json:"anteriorShearN"`
	DiscPressureMPa   float64 `json:"discPressureMPa"`
	StrainStatus      string  `json:"strainStatus"`
}

// CervicalBiomechanicsReport summarizes C1-C7 spinal load at cranial flexion angle theta.
type CervicalBiomechanicsReport struct {
	FlexionDegrees          float64                 `json:"flexionDegrees"`
	EffectiveLoadLbs        float64                 `json:"effectiveLoadLbs"`
	CompressiveForceNewtons float64                 `json:"compressiveForceNewtons"`
	LoadMultiplier          float64                 `json:"loadMultiplier"`
	CervicalTorqueNm        float64                 `json:"cervicalTorqueNm"`
	AnteriorShearC5C7N      float64                 `json:"anteriorShearC5C7N"`
	DailyCompressionTonHrs  float64                 `json:"dailyCompressionTonHrs"`
	PostureRiskZone         string                  `json:"postureRiskZone"`
	ClinicalAdvisory        string                  `json:"clinicalAdvisory"`
	SegmentVectors          []VertebraSegmentVector `json:"segmentVectors"`
}

// TremorUpdrsSummary provides logarithmic MDS-UPDRS clinical triage from Welch PSD peak metrics.
type TremorUpdrsSummary struct {
	DominantFreqHz    float64 `json:"dominantFreqHz"`
	RmsDisplacementMm float64 `json:"rmsDisplacementMm"`
	LogUpdrsScore     float64 `json:"logUpdrsScore"`
	DiscreteUpdrsGrade int    `json:"discreteUpdrsGrade"`
	ClinicalBand      string  `json:"clinicalBand"`
	TriageAction      string  `json:"triageAction"`
}

// RombergTriageSummary provides vestibular fall-risk & concussion screening metrics.
type RombergTriageSummary struct {
	EyesOpenAreaMm2   float64 `json:"eyesOpenAreaMm2"`
	EyesClosedAreaMm2 float64 `json:"eyesClosedAreaMm2"`
	RombergQuotient   float64 `json:"rombergQuotient"`
	FallRiskCategory  string  `json:"fallRiskCategory"`
	VestibularAlert   bool    `json:"vestibularAlert"`
}

func round2(v float64) float64 {
	return math.Round(v*100.0) / 100.0
}

// InterpolateHansrajLbs returns exact Hansraj (2014) Surgical Technology International
// cervical spine effective weight (lbs) across 0° - 60° cranial flexion:
// 0° -> 11 lbs (49 N), 15° -> 27 lbs (120 N), 30° -> 40 lbs (178 N),
// 45° -> 49 lbs (218 N), 60° -> 60 lbs (267 N).
func InterpolateHansrajLbs(angleDeg float64) float64 {
	clamped := math.Max(0.0, math.Min(75.0, angleDeg))
	knotsDeg := [6]float64{0.0, 15.0, 30.0, 45.0, 60.0, 75.0}
	knotsLbs := [6]float64{11.0, 27.0, 40.0, 49.0, 60.0, 68.5}

	for i := 0; i < len(knotsDeg)-1; i++ {
		if clamped <= knotsDeg[i+1] {
			span := knotsDeg[i+1] - knotsDeg[i]
			t := (clamped - knotsDeg[i]) / span
			// Smooth cosine-blended monotone interpolation preserving exact clinical knots
			smoothT := 0.5*t + 0.5*(0.5*(1.0-math.Cos(math.Pi*t)))
			return knotsLbs[i] + (knotsLbs[i+1]-knotsLbs[i])*smoothT
		}
	}
	return knotsLbs[len(knotsLbs)-1]
}

// EvaluateCervicalLoad computes C1-C7 compressive force, torque, shear vectors, and daily disc dose.
func EvaluateCervicalLoad(flexionDeg float64, headMassKg float64, dailyScreenHours float64) CervicalBiomechanicsReport {
	theta := math.Max(0.0, math.Min(65.0, flexionDeg))
	massScale := 1.0
	if headMassKg >= 3.0 && headMassKg <= 8.5 {
		massScale = headMassKg / DefaultHeadKg
	}
	hours := math.Max(0.25, math.Min(18.0, dailyScreenHours))

	effectiveLbs := InterpolateHansrajLbs(theta) * massScale
	forceNewtons := effectiveLbs * PoundsToNewtons
	multiplier := effectiveLbs / (11.0 * massScale)

	// Cranial center-of-mass lever arm lengthens from 0.035m neutral offset up to 0.135m at 60° flexion
	rad := theta * math.Pi / 180.0
	effectiveLeverM := 0.095 + 0.048*math.Sin(rad)
	actualMassKg := DefaultHeadKg * massScale
	torqueNm := actualMassKg * GravityMPS2 * effectiveLeverM * math.Sin(rad)
	anteriorShearN := forceNewtons * math.Sin(rad*0.72)

	// Cumulative daily disc load in US Ton-Hours/Day (1 short ton = 2000 lbs)
	dailyTonHrs := (effectiveLbs * hours) / 2000.0

	riskZone := "OPTIMAL_NEUTRAL_LORDOSIS"
	advisory := "Neutral C1-C7 alignment (11-18 lbs). Intradiscal hydrostatic pressure is minimal."
	if theta >= 45.0 {
		riskZone = "CRITICAL_C5_C7_OVERLOAD"
		advisory = "Severe cervical flexion (>45° / 49-60 lbs). Elevate display to eye level immediately."
	} else if theta >= 25.0 {
		riskZone = "MODERATE_TECH_NECK_STRAIN"
		advisory = "Elevated posterior ligamentous creep (36-48 lbs). Perform 15s chin-tuck retraction."
	} else if theta >= 12.0 {
		riskZone = "MILD_FLEXION_ENGAGED"
		advisory = "Mild forward cranial tilt (24-34 lbs). Maintain scapular depression and ergonomic gaze."
	}

	// Segmental C1-C7 intervertebral load distribution (C5-C6 & C6-C7 bear peak bending moment)
	levels := []struct {
		name     string
		share    float64
		areaCm2  float64
		shearMul float64
	}{
		{"C1-C2 (Atlantoaxial)", 0.42, 3.40, 0.30},
		{"C2-C3 (Upper Cervical)", 0.56, 3.15, 0.45},
		{"C3-C4 (Mid-Upper)", 0.71, 3.05, 0.62},
		{"C4-C5 (Mid-Cervical Apex)", 0.86, 2.95, 0.82},
		{"C5-C6 (Primary Tech-Neck Fulcrum)", 1.00, 2.85, 1.00},
		{"C6-C7 (Lower Cervical Base)", 0.97, 3.10, 0.94},
	}

	vectors := make([]VertebraSegmentVector, 0, len(levels))
	for _, lv := range levels {
		segCompN := forceNewtons * lv.share
		segShearN := anteriorShearN * lv.shearMul
		// Pressure MPa = Force (N) / Area (mm²)
		areaMm2 := lv.areaCm2 * 100.0
		pressureMPa := segCompN / areaMm2
		segStatus := "NOMINAL"
		if pressureMPa > 0.72 {
			segStatus = "HIGH_SHEAR"
		} else if pressureMPa > 0.48 {
			segStatus = "ELEVATED"
		}
		vectors = append(vectors, VertebraSegmentVector{
			Level:             lv.name,
			FlexionShareRatio: round2(lv.share),
			CompressiveForceN: round2(segCompN),
			AnteriorShearN:    round2(segShearN),
			DiscPressureMPa:   round2(pressureMPa),
			StrainStatus:      segStatus,
		})
	}

	return CervicalBiomechanicsReport{
		FlexionDegrees:          round2(theta),
		EffectiveLoadLbs:        round2(effectiveLbs),
		CompressiveForceNewtons: round2(forceNewtons),
		LoadMultiplier:          round2(multiplier),
		CervicalTorqueNm:        round2(torqueNm),
		AnteriorShearC5C7N:      round2(anteriorShearN),
		DailyCompressionTonHrs:  round2(dailyTonHrs),
		PostureRiskZone:         riskZone,
		ClinicalAdvisory:        advisory,
		SegmentVectors:          vectors,
	}
}

// ComputeTremorUpdrs evaluates logarithmic MDS-UPDRS tremor amplitude & clinical frequency gate.
func ComputeTremorUpdrs(freqHz float64, rmsDispMm float64) TremorUpdrsSummary {
	safeFreq := math.Max(0.5, math.Min(20.0, freqHz))
	safeAmpMm := math.Max(0.0, math.Min(50.0, rmsDispMm))

	logScore := 0.0
	if safeAmpMm >= 0.12 {
		ampCm := safeAmpMm / 10.0
		logScore = math.Max(0.0, math.Min(4.0, math.Log10(ampCm/0.025)*1.65))
	}
	grade := int(math.Round(logScore))

	band := "Physiological Micro-Oscillation (<0.12 mm)"
	action := "Motor control steady within baseline neuromuscular envelope."
	if safeAmpMm >= 0.15 {
		switch {
		case safeFreq >= 2.5 && safeFreq < 4.0:
			band = "Cerebellar / Ataxic Intention Band (2.5 - 4.0 Hz)"
			action = "Evaluate target-approach dysmetria on Archimedes Spiral & cerebellar coordination."
		case safeFreq >= 4.0 && safeFreq < 6.0:
			band = "Parkinsonian Rest / Pill-Rolling Band (4.0 - 6.0 Hz)"
			action = "Assess resting limb support vs. voluntary activation attenuation; log UPDRS diary."
		case safeFreq >= 6.0 && safeFreq < 10.0:
			band = "Essential Postural / Kinetic Band (6.0 - 10.0 Hz)"
			action = "Enable Kalman Inverse-Phase Anti-Tremor Reader for fine-print & touch assistance."
		case safeFreq >= 10.0 && safeFreq <= 14.5:
			band = "Physiological / Sympathetic Fatigue Jitter (10.0 - 14.5 Hz)"
			action = "Review caffeine, beta-adrenergic stimulation, muscular fatigue, or sleep debt."
		default:
			band = "Broadband Neuromuscular Oscillation"
			action = "Repeat 10-second stationary 3-axis IMU capture for narrowband isolation."
		}
	}

	return TremorUpdrsSummary{
		DominantFreqHz:     round2(safeFreq),
		RmsDisplacementMm:  round2(safeAmpMm),
		LogUpdrsScore:      round2(logScore),
		DiscreteUpdrsGrade: grade,
		ClinicalBand:       band,
		TriageAction:       action,
	}
}

// ComputeRombergQuotient evaluates Eyes-Closed / Eyes-Open 95% PCA ellipse sway quotient.
func ComputeRombergQuotient(eyesOpenMm2 float64, eyesClosedMm2 float64) RombergTriageSummary {
	openSafe := math.Max(4.0, eyesOpenMm2)
	closedSafe := math.Max(2.0, eyesClosedMm2)
	rq := closedSafe / openSafe

	category := "LOW_FALL_RISK"
	alert := false
	if closedSafe > 260.0 || rq > 3.2 {
		category = "HIGH_VESTIBULAR_CONCUSSION_OR_FALL_RISK"
		alert = true
	} else if closedSafe > 130.0 || rq > 2.1 {
		category = "MODERATE_PROPRIOCEPTIVE_INSTABILITY"
	}

	return RombergTriageSummary{
		EyesOpenAreaMm2:   round2(openSafe),
		EyesClosedAreaMm2: round2(closedSafe),
		RombergQuotient:   round2(rq),
		FallRiskCategory:  category,
		VestibularAlert:   alert,
	}
}
