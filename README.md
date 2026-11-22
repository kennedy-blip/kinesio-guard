# KINESIO-GUARD — Polyglot Neuromuscular & Cervical Biomechanics Lab

**Zero-TypeScript Polyglot Stack (`0.0% TypeScript`):**  
`Vue 3.5 (.vue)` · `Rust 2021 + WASM (.rs)` · `Java 17 Android Capacitor (.java)` · `Go 1.22 Serverless (.go)` · `Pure ES2024 (.js)` · `WebGL2 GLSL ES 3.00 (.glsl)`

---

## Clinical & Biomechanical Capabilities

1. **3-Axis Neuromuscular Tremor Classifier (`2–16 Hz` Welch PSD + Archimedes Spiral Lab)**
   - Samples 3-axis linear acceleration (`m/s²`), strips gravitational tilt drift via a `1.0 Hz` Butterworth high-pass filter, and computes 2048-point Hann-windowed Welch Power Spectral Density (`0.1 Hz` bin resolution):
     - **`2.5 – 4.0 Hz`:** Cerebellar / Ataxic Intention Tremor Signature
     - **`4.0 – 6.0 Hz`:** Parkinsonian Rest / Pill-Rolling Tremor Signature
     - **`6.0 – 10.0 Hz`:** Essential Postural / Kinetic Tremor Signature
     - **`10.0 – 14.5 Hz`:** Physiological / Caffeine / Sympathetic Fatigue Jitter
   - Includes an interactive **Archimedes Spiral ($r = a + b\theta$)** drawing canvas computing **Radial Deviation Error (`mm`)**, **Principal Tremor Axis Angle (`°`)**, **Spectral Arc Length (`SPARC`)**, and **Target Approach Dysmetria Overshoot**.

2. **Cervical Spine "Tech-Neck" C1–C7 Disc Load Lab (`Hansraj Law` in Go 1.22)**
   - Evaluates cranial flexion viewing angle ($\theta \in [0^\circ, 60^\circ]$) via interactive angle slider, phone pitch clinometer, or on-device optical webcam centroid tracker:
     - `0°` $\rightarrow$ **`11.0 lbs` (`49 N`)** [Neutral Lordosis]
     - `15°` $\rightarrow$ **`27.0 lbs` (`120 N`)** [Mild Flexion]
     - `30°` $\rightarrow$ **`40.0 lbs` (`178 N`)** [Moderate Tech-Neck]
     - `45°` $\rightarrow$ **`49.0 lbs` (`218 N`)** [High Strain]
     - `60°` $\rightarrow$ **`60.0 lbs` (`267 N`)** [Critical C5–C7 Overload]
   - Features an **Active Biofeedback Posture Guardian** emitting a Web Audio harmonic fifth chime (`432 Hz + 648 Hz`) and haptic pulse when slouching exceeds safe thresholds for >10 seconds.

3. **Vestibular Concussion & Fall-Risk Romberg Stabilometer (`Rust WASM PCA`)**
   - Plots a 60fps 2D Center-of-Pressure (`CoP`) statokinesigram (`mm`), computing the closed-form **PCA 95% Confidence Ellipse Area ($\text{mm}^2$, $\chi^2_{2,0.95} = 5.991$)**, **Mean Sway Velocity (`mm/s`)**, **AP/ML Sway Ratio**, and **Romberg Quotient ($\text{RQ} = \text{Area}_{\text{closed}} / \text{Area}_{\text{open}}$)** 100% offline.

4. **Kalman Active Anti-Tremor Assistive Reader & Precision Dexterity Trainer**
   - Runs a real-time **2D Inverse-Phase Kalman Filter** shifting an assistive reading card and micro-target keypad in exact opposite phase (`-Δx, -Δy`) to cancel involuntary `3–14 Hz` hand tremor on screen.

5. **5-Language Polyglot Runtime Inspector & Longitudinal `IndexedDB` Clinical Vault**
   - Inspect live repository source files across Rust, Go 1.22, Java 17, GLSL, and ES2024 + WASM, benchmark DSP kernels, export raw 200Hz CSV/JSON telemetry, and sync offline clinical diaries.

---

## Polyglot Architecture Layout

```text
├── api/
│   └── kinesio_triage.go                # Vercel Go 1.22 Serverless Triage Endpoint
├── go_biomechanics/
│   ├── hansraj_cervical.go              # Hansraj C1-C7 Disc Load, Torque & UPDRS Engine
│   └── hansraj_cervical_test.go         # Go 1.22 Biomechanical Unit Tests
├── rust-biomechanics/
│   ├── Cargo.toml                       # Rust 2021 cdylib/rlib WASM Crate
│   └── src/
│       ├── lib.rs                       # 2D Inverse-Phase Kalman + 6-DoF Madgwick AHRS
│       ├── tremor_fft.rs                # 3-Axis Welch PSD FFT & Archimedes Spiral DSP
│       └── romberg_sway.rs              # PCA 95% Confidence Ellipse Stabilometry
├── android/app/src/main/java/com/kinesioguard/neuro/
│   ├── InertialKinematicsPlugin.java    # 200Hz SENSOR_DELAY_FASTEST Linear IMU Plugin
│   ├── BioHapticStabilizerPlugin.java   # 180° Phase-Inverted LRA Haptic Pacing Plugin
│   └── MainActivity.java                # Capacitor Native Android Bridge Activity
├── src/
│   ├── App.vue                          # Dual Desktop Workstation / Mobile APK Shell
│   ├── components/                      # Vue 3.5 Glassmorphic Modules, Dock & Modals
│   ├── composables/useSpringPhysics.js  # Hooke's Law Spring Solver (k=320, c=25, m=0.8)
│   ├── engines/                         # Rust WASM Bridge, Go Mirror & Sensor Fusion
│   ├── db/kinesioDb.js                  # IndexedDB Clinical Vault & Offline Sync Queue
│   └── shaders/synaptic_kinematics.glsl # WebGL2 Kinematic-Reactive Tensor Field Shader
├── public/releases/
│   └── kinesioguard-release.apk         # Self-Hosted Android APK Release Artifact
├── capacitor.config.json                # Capacitor Android Configuration
└── .github/workflows/build-and-bundle-apk.yml
```

## Quick Start

```bash
npm install
npm run dev
npm run build
```
