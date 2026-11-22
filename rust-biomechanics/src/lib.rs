//! KINESIO-GUARD Polyglot Biomechanics Core Crate (Rust 2021 / WebAssembly Target)
//! Unifies:
//! 1. 3-Axis Welch Power Spectral Density (1-18 Hz) Neuromuscular Tremor Classifier
//! 2. 2D Inverse-Phase Kalman Filter Active Anti-Tremor Assistive Lens Stabilizer
//! 3. PCA 95% Confidence Ellipse Vestibular Romberg Posturography

pub mod romberg_sway;
pub mod tremor_fft;

pub use romberg_sway::{
    compute_statokinesigram_pca, evaluate_romberg_protocol, sternum_angles_to_cop_mm,
    ConfidenceEllipse95, RombergClinicalComparison, StatokinesigramMetrics,
};
pub use tremor_fft::{
    analyze_archimedes_spiral, classify_tremor_band, welch_psd_3axis, SpiralAtaxiaReport,
    TremorBandPowers, TremorSpectrumReport,
};

/// 1D constant-velocity + harmonic restoring-force Kalman estimator used per Cartesian axis.
#[derive(Clone, Copy, Debug)]
pub struct AxisKalmanState {
    pub pos_mm: f64,
    pub vel_mm_s: f64,
    pub voluntary_baseline_mm: f64,
    p00: f64,
    p01: f64,
    p10: f64,
    p11: f64,
}

impl Default for AxisKalmanState {
    fn default() -> Self {
        Self {
            pos_mm: 0.0,
            vel_mm_s: 0.0,
            voluntary_baseline_mm: 0.0,
            p00: 1.0,
            p01: 0.0,
            p10: 0.0,
            p11: 10.0,
        }
    }
}

/// Real-time 2D Inverse-Phase Kalman Filter for active on-screen tremor cancellation.
/// Separates voluntary slow hand motion (< 1.2 Hz) from involuntary pathological tremor (2.5 - 15 Hz)
/// and predicts 1 frame ahead (16.67 ms) to eliminate display pipeline phase lag.
#[derive(Clone, Debug)]
pub struct KalmanAntiTremor2D {
    pub x_axis: AxisKalmanState,
    pub y_axis: AxisKalmanState,
    pub process_noise_q: f64,
    pub measurement_noise_r: f64,
    pub phase_lead_sec: f64,
    pub gain_strength: f64,
    pub max_excursion_mm: f64,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct StabilizationFrame {
    pub raw_tremor_x_mm: f64,
    pub raw_tremor_y_mm: f64,
    pub estimated_tremor_x_mm: f64,
    pub estimated_tremor_y_mm: f64,
    pub counter_shift_x_mm: f64,
    pub counter_shift_y_mm: f64,
    pub residual_error_mm: f64,
    pub attenuation_db: f64,
}

impl KalmanAntiTremor2D {
    pub fn new(
        process_noise_q: f64,
        measurement_noise_r: f64,
        phase_lead_sec: f64,
        gain_strength: f64,
    ) -> Self {
        Self {
            x_axis: AxisKalmanState::default(),
            y_axis: AxisKalmanState::default(),
            process_noise_q: process_noise_q.clamp(0.05, 500.0),
            measurement_noise_r: measurement_noise_r.clamp(0.005, 25.0),
            phase_lead_sec: phase_lead_sec.clamp(0.0, 0.045),
            gain_strength: gain_strength.clamp(0.0, 1.15),
            max_excursion_mm: 14.0,
        }
    }

    pub fn reset(&mut self) {
        self.x_axis = AxisKalmanState::default();
        self.y_axis = AxisKalmanState::default();
    }

    fn step_axis(
        axis: &mut AxisKalmanState,
        measured_mm: f64,
        dt: f64,
        q: f64,
        r: f64,
        lead_sec: f64,
    ) -> (f64, f64) {
        let safe_dt = dt.clamp(0.002, 0.1);

        // Low-pass voluntary trajectory tracker (~0.9 Hz cutoff)
        let alpha_vol = (safe_dt / (0.18 + safe_dt)).clamp(0.01, 0.5);
        axis.voluntary_baseline_mm += alpha_vol * (measured_mm - axis.voluntary_baseline_mm);
        let isolated_tremor = measured_mm - axis.voluntary_baseline_mm;

        // 1. Time Update (Predict)
        let pred_pos = axis.pos_mm + safe_dt * axis.vel_mm_s;
        let pred_vel = axis.vel_mm_s * 0.965;

        let dt2 = safe_dt * safe_dt;
        let dt3 = dt2 * safe_dt;
        let q00 = q * dt3 / 3.0;
        let q01 = q * dt2 * 0.5;
        let q11 = q * safe_dt * 18.0;

        let p00_minus = axis.p00 + safe_dt * (axis.p10 + axis.p01) + dt2 * axis.p11 + q00;
        let p01_minus = axis.p01 + safe_dt * axis.p11 + q01;
        let p10_minus = axis.p10 + safe_dt * axis.p11 + q01;
        let p11_minus = axis.p11 + q11;

        // 2. Measurement Update (Correct)
        let innovation = isolated_tremor - pred_pos;
        let s = (p00_minus + r).max(1e-9);
        let k0 = p00_minus / s;
        let k1 = p10_minus / s;

        axis.pos_mm = pred_pos + k0 * innovation;
        axis.vel_mm_s = pred_vel + k1 * innovation;

        axis.p00 = (1.0 - k0) * p00_minus;
        axis.p01 = (1.0 - k0) * p01_minus;
        axis.p10 = p10_minus - k1 * p00_minus;
        axis.p11 = p11_minus - k1 * p01_minus;

        // Phase-lead forward projection to cancel 60fps compositor latency
        let lead_estimate = axis.pos_mm + lead_sec * axis.vel_mm_s;
        (isolated_tremor, lead_estimate)
    }

    pub fn update_2d(&mut self, measured_x_mm: f64, measured_y_mm: f64, dt_sec: f64) -> StabilizationFrame {
        let (raw_x, est_x) = Self::step_axis(
            &mut self.x_axis,
            measured_x_mm,
            dt_sec,
            self.process_noise_q,
            self.measurement_noise_r,
            self.phase_lead_sec,
        );
        let (raw_y, est_y) = Self::step_axis(
            &mut self.y_axis,
            measured_y_mm,
            dt_sec,
            self.process_noise_q,
            self.measurement_noise_r,
            self.phase_lead_sec,
        );

        let counter_shift_x_mm = (-est_x * self.gain_strength)
            .clamp(-self.max_excursion_mm, self.max_excursion_mm);
        let counter_shift_y_mm = (-est_y * self.gain_strength)
            .clamp(-self.max_excursion_mm, self.max_excursion_mm);

        let res_x = raw_x + counter_shift_x_mm;
        let res_y = raw_y + counter_shift_y_mm;
        let residual_error_mm = (res_x * res_x + res_y * res_y).sqrt();
        let raw_mag = (raw_x * raw_x + raw_y * raw_y).sqrt().max(1e-4);

        let ratio = (residual_error_mm / raw_mag).clamp(0.03, 2.0);
        let attenuation_db = 20.0 * ratio.log10();

        StabilizationFrame {
            raw_tremor_x_mm: raw_x,
            raw_tremor_y_mm: raw_y,
            estimated_tremor_x_mm: est_x,
            estimated_tremor_y_mm: est_y,
            counter_shift_x_mm,
            counter_shift_y_mm,
            residual_error_mm,
            attenuation_db,
        }
    }
}

/// C/WebAssembly ABI entry point: computes inverse-phase Kalman counter-shift for a single axis.
#[no_mangle]
pub extern "C" fn kinesio_kalman_counter_shift(
    measured_mm: f64,
    prev_pos_mm: f64,
    prev_vel_mm_s: f64,
    dt_sec: f64,
    kalman_gain: f64,
) -> f64 {
    let dt = dt_sec.clamp(0.002, 0.05);
    let pred_pos = prev_pos_mm + dt * prev_vel_mm_s;
    let innovation = measured_mm - pred_pos;
    let corrected = pred_pos + kalman_gain.clamp(0.1, 0.98) * innovation;
    let est_vel = prev_vel_mm_s + (0.45 / dt) * innovation;
    -(corrected + 0.014 * est_vel)
}

/// C/WebAssembly ABI entry point: computes 95% PCA confidence ellipse area from covariance terms.
#[no_mangle]
pub extern "C" fn kinesio_pca_ellipse_area_mm2(cov_xx: f64, cov_yy: f64, cov_xy: f64) -> f64 {
    let trace_half = 0.5 * (cov_xx + cov_yy);
    let diff_half = 0.5 * (cov_xx - cov_yy);
    let disc = (diff_half * diff_half + cov_xy * cov_xy).max(0.0).sqrt();
    let l1 = (trace_half + disc).max(1e-6);
    let l2 = (trace_half - disc).max(1e-6);
    core::f64::consts::PI * romberg_sway::CHI_SQUARE_2DOF_95 * (l1 * l2).sqrt()
}

/// 6-DoF Madgwick Quaternion AHRS filter fusing 200Hz 3-axis gyroscope (rad/s) and
/// 3-axis accelerometer (m/s²) to compute gimbal-lock-free cranial flexion & sternum tilt.
#[derive(Clone, Copy, Debug)]
pub struct MadgwickQuaternionAhrs {
    pub q0: f64,
    pub q1: f64,
    pub q2: f64,
    pub q3: f64,
    pub beta_gain: f64,
}

impl Default for MadgwickQuaternionAhrs {
    fn default() -> Self {
        Self {
            q0: 1.0,
            q1: 0.0,
            q2: 0.0,
            q3: 0.0,
            beta_gain: 0.085,
        }
    }
}

impl MadgwickQuaternionAhrs {
    pub fn new(beta_gain: f64) -> Self {
        Self {
            beta_gain: beta_gain.clamp(0.01, 0.5),
            ..Self::default()
        }
    }

    pub fn update_imu_6dof(
        &mut self,
        gx_rad_s: f64,
        gy_rad_s: f64,
        gz_rad_s: f64,
        ax_mps2: f64,
        ay_mps2: f64,
        az_mps2: f64,
        dt_sec: f64,
    ) {
        let dt = dt_sec.clamp(0.001, 0.05);
        let mut q0 = self.q0;
        let mut q1 = self.q1;
        let mut q2 = self.q2;
        let mut q3 = self.q3;

        // Rate of change of quaternion from gyroscope angular velocity
        let mut q_dot0 = 0.5 * (-q1 * gx_rad_s - q2 * gy_rad_s - q3 * gz_rad_s);
        let mut q_dot1 = 0.5 * (q0 * gx_rad_s + q2 * gz_rad_s - q3 * gy_rad_s);
        let mut q_dot2 = 0.5 * (q0 * gy_rad_s - q1 * gz_rad_s + q3 * gx_rad_s);
        let mut q_dot3 = 0.5 * (q0 * gz_rad_s + q1 * gy_rad_s - q2 * gx_rad_s);

        // Gradient descent corrective step when accelerometer vector is non-zero
        let acc_norm = (ax_mps2 * ax_mps2 + ay_mps2 * ay_mps2 + az_mps2 * az_mps2).sqrt();
        if acc_norm > 1e-4 {
            let ax = ax_mps2 / acc_norm;
            let ay = ay_mps2 / acc_norm;
            let az = az_mps2 / acc_norm;

            let _2q0 = 2.0 * q0;
            let _2q1 = 2.0 * q1;
            let _2q2 = 2.0 * q2;
            let _2q3 = 2.0 * q3;
            let _4q0 = 4.0 * q0;
            let _4q1 = 4.0 * q1;
            let _4q2 = 4.0 * q2;
            let _8q1 = 8.0 * q1;
            let _8q2 = 8.0 * q2;
            let q0q0 = q0 * q0;
            let q1q1 = q1 * q1;
            let q2q2 = q2 * q2;
            let q3q3 = q3 * q3;

            let mut s0 = _4q0 * q2q2 + _2q2 * ax + _4q0 * q1q1 - _2q1 * ay;
            let mut s1 = _4q1 * q3q3 - _2q3 * ax + 4.0 * q0q0 * q1 - _2q0 * ay - _4q1
                + _8q1 * q1q1
                + _8q1 * q2q2
                + _4q1 * az;
            let mut s2 = 4.0 * q0q0 * q2 + _2q0 * ax + _4q2 * q3q3 - _2q3 * ay - _4q2
                + _8q2 * q1q1
                + _8q2 * q2q2
                + _4q2 * az;
            let mut s3 = 4.0 * q1q1 * q3 - _2q1 * ax + 4.0 * q2q2 * q3 - _2q2 * ay;

            let s_norm = (s0 * s0 + s1 * s1 + s2 * s2 + s3 * s3).sqrt().max(1e-12);
            s0 /= s_norm;
            s1 /= s_norm;
            s2 /= s_norm;
            s3 /= s_norm;

            q_dot0 -= self.beta_gain * s0;
            q_dot1 -= self.beta_gain * s1;
            q_dot2 -= self.beta_gain * s2;
            q_dot3 -= self.beta_gain * s3;
        }

        q0 += q_dot0 * dt;
        q1 += q_dot1 * dt;
        q2 += q_dot2 * dt;
        q3 += q_dot3 * dt;

        let norm = (q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3).sqrt().max(1e-12);
        self.q0 = q0 / norm;
        self.q1 = q1 / norm;
        self.q2 = q2 / norm;
        self.q3 = q3 / norm;
    }

    /// Returns `(roll_deg, pitch_deg, yaw_deg)` in anatomical body-frame degrees.
    pub fn euler_angles_deg(&self) -> (f64, f64, f64) {
        let sinr_cosp = 2.0 * (self.q0 * self.q1 + self.q2 * self.q3);
        let cosr_cosp = 1.0 - 2.0 * (self.q1 * self.q1 + self.q2 * self.q2);
        let roll = sinr_cosp.atan2(cosr_cosp).to_degrees();

        let sinp = (2.0 * (self.q0 * self.q2 - self.q3 * self.q1)).clamp(-1.0, 1.0);
        let pitch = sinp.asin().to_degrees();

        let siny_cosp = 2.0 * (self.q0 * self.q3 + self.q1 * self.q2);
        let cosy_cosp = 1.0 - 2.0 * (self.q2 * self.q2 + self.q3 * self.q3);
        let yaw = siny_cosp.atan2(cosy_cosp).to_degrees();

        (roll, pitch, yaw)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::f64::consts::PI;

    #[test]
    fn detects_parkinsonian_4_8_hz_rest_tremor() {
        let fs = 200.0;
        let n = 2000;
        let mut ax = Vec::with_capacity(n);
        let mut ay = Vec::with_capacity(n);
        let mut az = Vec::with_capacity(n);
        for i in 0..n {
            let t = (i as f64) / fs;
            ax.push(1.8 * (2.0 * PI * 4.8 * t).sin());
            ay.push(0.9 * (2.0 * PI * 4.8 * t + 0.6).cos());
            az.push(0.25 * (2.0 * PI * 9.6 * t).sin());
        }
        let report = welch_psd_3axis(&ax, &ay, &az, fs);
        assert!((report.dominant_freq_hz - 4.8).abs() < 0.25);
        assert_eq!(report.phenotype_code, "PARKINSONIAN_REST_SIGNATURE");
    }

    #[test]
    fn kalman_filter_attenuates_5_5_hz_tremor() {
        let mut kf = KalmanAntiTremor2D::new(38.0, 0.08, 0.012, 1.0);
        let dt = 1.0 / 120.0;
        let mut raw_rms_acc = 0.0;
        let mut res_rms_acc = 0.0;
        for i in 0..360 {
            let t = (i as f64) * dt;
            let sx = 3.0 * (2.0 * PI * 5.5 * t).sin();
            let sy = 2.2 * (2.0 * PI * 5.5 * t).cos();
            let out = kf.update_2d(sx, sy, dt);
            if i > 60 {
                raw_rms_acc += out.raw_tremor_x_mm.powi(2) + out.raw_tremor_y_mm.powi(2);
                res_rms_acc += out.residual_error_mm.powi(2);
            }
        }
        assert!(res_rms_acc < raw_rms_acc * 0.25);
    }

    #[test]
    fn romberg_pca_detects_closed_eye_concussion_spike() {
        let mut open_ml = Vec::new();
        let mut open_ap = Vec::new();
        let mut closed_ml = Vec::new();
        let mut closed_ap = Vec::new();
        for i in 0..300 {
            let t = (i as f64) * 0.05;
            open_ml.push(1.5 * (1.2 * t).sin());
            open_ap.push(1.6 * (1.0 * t).cos());
            closed_ml.push(6.4 * (1.8 * t).sin());
            closed_ap.push(5.1 * (1.5 * t).cos());
        }
        let cmp = evaluate_romberg_protocol(&open_ml, &open_ap, &closed_ml, &closed_ap, 15.0);
        assert!(cmp.romberg_quotient > 3.0);
        assert!(cmp.concussion_sideline_alert);
    }

    #[test]
    fn madgwick_ahrs_tracks_30_deg_cervical_pitch() {
        let mut ahrs = MadgwickQuaternionAhrs::new(0.15);
        let rad = 30.0f64.to_radians();
        let ax = -9.80665 * rad.sin();
        let az = 9.80665 * rad.cos();
        for _ in 0..400 {
            ahrs.update_imu_6dof(0.0, 0.0, 0.0, ax, 0.0, az, 0.005);
        }
        let (_roll, pitch, _yaw) = ahrs.euler_angles_deg();
        assert!((pitch - 30.0).abs() < 2.0);
    }
}
