// Package handler exposes the Vercel Go 1.22 Serverless Function (/api/kinesio_triage)
// computing Hansraj C5-C7 Cervical Disc Compression, MDS-UPDRS Tremor Logarithmic Amplitude,
// and Romberg Vestibular Fall-Risk Quotients.
package handler

import (
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/kennedy-blip/kinesio-guard/go_biomechanics"
)

// TriageRequestPayload represents live or batch telemetry sent by the Vue 3.5 / Android client.
type TriageRequestPayload struct {
	FlexionDegrees    float64 `json:"flexionDegrees"`
	HeadMassKg        float64 `json:"headMassKg"`
	DailyScreenHours  float64 `json:"dailyScreenHours"`
	TremorFreqHz      float64 `json:"tremorFreqHz"`
	TremorRmsMm       float64 `json:"tremorRmsMm"`
	EyesOpenAreaMm2   float64 `json:"eyesOpenAreaMm2"`
	EyesClosedAreaMm2 float64 `json:"eyesClosedAreaMm2"`
	ClientMode        string  `json:"clientMode"`
}

// TriageResponseEnvelope returns composite clinical telemetry and runtime diagnostics.
type TriageResponseEnvelope struct {
	Engine            string                                       `json:"engine"`
	GoRuntimeVersion  string                                       `json:"goRuntimeVersion"`
	ComputedAtISO     string                                       `json:"computedAtISO"`
	CompositeRiskIdx  float64                                      `json:"compositeRiskIdx"`
	ShaderStressLevel float64                                      `json:"shaderStressLevel"`
	Cervical          go_biomechanics.CervicalBiomechanicsReport   `json:"cervical"`
	Tremor            go_biomechanics.TremorUpdrsSummary           `json:"tremor"`
	Romberg           go_biomechanics.RombergTriageSummary         `json:"romberg"`
}

func parseFloatQuery(r *http.Request, key string, fallback float64) float64 {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(raw, 64)
	if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
		return fallback
	}
	return parsed
}

// Handler is the native Vercel Go Serverless Function entry point.
func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Kinesio-Role")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	req := TriageRequestPayload{
		FlexionDegrees:    parseFloatQuery(r, "angle", 30.0),
		HeadMassKg:        parseFloatQuery(r, "massKg", 5.0),
		DailyScreenHours:  parseFloatQuery(r, "hours", 5.5),
		TremorFreqHz:      parseFloatQuery(r, "freqHz", 7.4),
		TremorRmsMm:       parseFloatQuery(r, "rmsMm", 0.08),
		EyesOpenAreaMm2:   parseFloatQuery(r, "openMm2", 42.0),
		EyesClosedAreaMm2: parseFloatQuery(r, "closedMm2", 57.0),
		ClientMode:        "vercel-go-serverless",
	}

	if r.Method == http.MethodPost && r.Body != nil {
		defer r.Body.Close()
		decoder := json.NewDecoder(r.Body)
		var body TriageRequestPayload
		if err := decoder.Decode(&body); err == nil {
			if body.HeadMassKg <= 0 {
				body.HeadMassKg = 5.0
			}
			if body.DailyScreenHours <= 0 {
				body.DailyScreenHours = 5.5
			}
			if body.EyesOpenAreaMm2 <= 0 {
				body.EyesOpenAreaMm2 = 42.0
			}
			if body.EyesClosedAreaMm2 <= 0 {
				body.EyesClosedAreaMm2 = 57.0
			}
			req = body
		}
	}

	cervical := go_biomechanics.EvaluateCervicalLoad(
		req.FlexionDegrees,
		req.HeadMassKg,
		req.DailyScreenHours,
	)
	tremor := go_biomechanics.ComputeTremorUpdrs(req.TremorFreqHz, req.TremorRmsMm)
	romberg := go_biomechanics.ComputeRombergQuotient(req.EyesOpenAreaMm2, req.EyesClosedAreaMm2)

	// Normalized 0.0 - 1.0 kinematic stress index driving the GLSL synaptic tensor shader
	cervicalNorm := math.Min(1.0, math.Max(0.0, (cervical.FlexionDegrees-8.0)/52.0))
	tremorNorm := math.Min(1.0, tremor.LogUpdrsScore/3.2)
	rombergNorm := math.Min(1.0, math.Max(0.0, (romberg.RombergQuotient-1.4)/3.2))
	shaderStress := math.Max(cervicalNorm, math.Max(tremorNorm, rombergNorm))
	compositeIdx := math.Round((0.40*cervicalNorm+0.35*tremorNorm+0.25*rombergNorm)*1000.0) / 10.0

	resp := TriageResponseEnvelope{
		Engine:            "KINESIO-GUARD Go 1.22 Biomechanics & Neurological Triage Engine",
		GoRuntimeVersion:  "go1.22",
		ComputedAtISO:     time.Now().UTC().Format(time.RFC3339),
		CompositeRiskIdx:  compositeIdx,
		ShaderStressLevel: math.Round(shaderStress*1000.0) / 1000.0,
		Cervical:          cervical,
		Tremor:            tremor,
		Romberg:           romberg,
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}
