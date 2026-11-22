package go_biomechanics

import (
	"math"
	"testing"
)

func TestHansrajCervicalCompressionBenchmarks(t *testing.T) {
	benchmarks := []struct {
		name        string
		angleDeg    float64
		expectedLbs float64
		expectedN   float64
	}{
		{"NeutralLordosis0Deg", 0.0, 11.0, 48.93},
		{"MildFlexion15Deg", 15.0, 27.0, 120.10},
		{"ModerateTechNeck30Deg", 30.0, 40.0, 177.93},
		{"HighStrain45Deg", 45.0, 49.0, 217.96},
		{"SevereOverload60Deg", 60.0, 60.0, 266.89},
	}

	for _, tc := range benchmarks {
		t.Run(tc.name, func(t *testing.T) {
			report := EvaluateCervicalLoad(tc.angleDeg, DefaultHeadKg, 6.0)
			if math.Abs(report.EffectiveLoadLbs-tc.expectedLbs) > 0.08 {
				t.Fatalf("at %.1f deg: got %.2f lbs, want %.2f lbs", tc.angleDeg, report.EffectiveLoadLbs, tc.expectedLbs)
			}
			if math.Abs(report.CompressiveForceNewtons-tc.expectedN) > 0.45 {
				t.Fatalf("at %.1f deg: got %.2f N, want %.2f N", tc.angleDeg, report.CompressiveForceNewtons, tc.expectedN)
			}
			if len(report.SegmentVectors) != 6 {
				t.Fatalf("expected 6 C1-C7 segment vectors, got %d", len(report.SegmentVectors))
			}
		})
	}
}

func TestMonotonicTorqueAndDailyCompressionDose(t *testing.T) {
	r0 := EvaluateCervicalLoad(0.0, DefaultHeadKg, 5.0)
	r30 := EvaluateCervicalLoad(30.0, DefaultHeadKg, 5.0)
	r60 := EvaluateCervicalLoad(60.0, DefaultHeadKg, 5.0)

	if !(r0.CervicalTorqueNm < r30.CervicalTorqueNm && r30.CervicalTorqueNm < r60.CervicalTorqueNm) {
		t.Fatalf("expected strictly increasing cervical bending torque: %.2f, %.2f, %.2f",
			r0.CervicalTorqueNm, r30.CervicalTorqueNm, r60.CervicalTorqueNm)
	}

	if r60.PostureRiskZone != "CRITICAL_C5_C7_OVERLOAD" {
		t.Fatalf("expected CRITICAL_C5_C7_OVERLOAD at 60 deg, got %s", r60.PostureRiskZone)
	}
}

func TestTremorUpdrsBandClassification(t *testing.T) {
	steady := ComputeTremorUpdrs(8.2, 0.04)
	if steady.DiscreteUpdrsGrade != 0 {
		t.Fatalf("expected UPDRS 0 for 0.04 mm baseline, got %d", steady.DiscreteUpdrsGrade)
	}

	parkinsonian := ComputeTremorUpdrs(4.8, 3.4)
	if parkinsonian.LogUpdrsScore < 1.5 {
		t.Fatalf("expected elevated UPDRS score for 3.4 mm rest tremor, got %.2f", parkinsonian.LogUpdrsScore)
	}

	essential := ComputeTremorUpdrs(7.4, 2.1)
	if essential.ClinicalBand != "Essential Postural / Kinetic Band (6.0 - 10.0 Hz)" {
		t.Fatalf("unexpected band classification: %s", essential.ClinicalBand)
	}
}

func TestRombergFallRiskQuotientStratification(t *testing.T) {
	healthy := ComputeRombergQuotient(42.0, 56.7)
	if healthy.VestibularAlert || healthy.FallRiskCategory != "LOW_FALL_RISK" {
		t.Fatalf("expected LOW_FALL_RISK for RQ %.2f, got %s", healthy.RombergQuotient, healthy.FallRiskCategory)
	}

	concussion := ComputeRombergQuotient(98.0, 385.0)
	if !concussion.VestibularAlert {
		t.Fatalf("expected vestibular alert for 385 mm² closed sway ellipse")
	}
}
