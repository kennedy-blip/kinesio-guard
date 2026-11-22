//! Principal Component Analysis (PCA) 95% Confidence Ellipse Stabilometry & Romberg Fall-Risk Lab
//! Evaluates 2D Center-of-Pressure (CoP) sway paths from sternum IMU kinematics (100% offline).

use core::f64::consts::PI;

/// Chi-square critical value with 2 degrees of freedom at p = 0.95 confidence level.
pub const CHI_SQUARE_2DOF_95: f64 = 5.991_464_547_107_98;

#[derive(Clone, Copy, Debug, Default)]
pub struct ConfidenceEllipse95 {
    pub semi_major_mm: f64,
    pub semi_minor_mm: f64,
    pub area_mm2: f64,
    pub orientation_deg: f64,
    pub eccentricity: f64,
    pub centroid_ml_mm: f64,
    pub centroid_ap_mm: f64,
}

#[derive(Clone, Debug, Default)]
pub struct StatokinesigramMetrics {
    pub ellipse_95: ConfidenceEllipse95,
    pub sway_path_length_mm: f64,
    pub mean_velocity_mm_per_s: f64,
    pub ml_rms_mm: f64,
    pub ap_rms_mm: f64,
    pub ap_ml_ratio: f64,
    pub max_excursion_mm: f64,
    pub directional_bias_deg: f64,
}

#[derive(Clone, Debug)]
pub struct RombergClinicalComparison {
    pub eyes_open: StatokinesigramMetrics,
    pub eyes_closed: StatokinesigramMetrics,
    pub romberg_quotient: f64,
    pub velocity_quotient: f64,
    pub concussion_sideline_alert: bool,
    pub fall_risk_tier: &'static str,
    pub sensory_deficit_pattern: &'static str,
}

/// Converts sternum tilt angles (roll/pitch in degrees) into equivalent ground-plane
/// Center-of-Pressure (CoP) mediolateral (X) and anteroposterior (Y) sway coordinates in mm
/// using an inverted pendulum biomechanical model around the ankle talocrural axis.
#[inline]
pub fn sternum_angles_to_cop_mm(
    roll_deg: f64,
    pitch_deg: f64,
    sternum_height_mm: f64,
) -> (f64, f64) {
    let h = sternum_height_mm.clamp(850.0, 1650.0);
    // Effective ankle-strategy CoP projection factor (~0.18 of sternum arc excursion)
    let gain = h * 0.18;
    let cop_ml_mm = gain * roll_deg.to_radians().sin();
    let cop_ap_mm = gain * pitch_deg.to_radians().sin();
    (cop_ml_mm, cop_ap_mm)
}

/// Performs Principal Component Analysis (PCA) on 2D CoP trace (ML = x_mm, AP = y_mm)
/// to extract exact 95% confidence ellipse geometry and posturographic sway velocity.
pub fn compute_statokinesigram_pca(
    cop_ml_mm: &[f64],
    cop_ap_mm: &[f64],
    duration_sec: f64,
) -> StatokinesigramMetrics {
    let n = cop_ml_mm.len().min(cop_ap_mm.len());
    if n < 4 {
        return StatokinesigramMetrics::default();
    }

    let inv_n = 1.0 / (n as f64);
    let mean_x = cop_ml_mm[..n].iter().sum::<f64>() * inv_n;
    let mean_y = cop_ap_mm[..n].iter().sum::<f64>() * inv_n;

    let mut s_xx = 0.0;
    let mut s_yy = 0.0;
    let mut s_xy = 0.0;
    let mut path_len = 0.0;
    let mut max_r = 0.0f64;

    for i in 0..n {
        let dx = cop_ml_mm[i] - mean_x;
        let dy = cop_ap_mm[i] - mean_y;
        s_xx += dx * dx;
        s_yy += dy * dy;
        s_xy += dx * dy;

        let r_origin = (cop_ml_mm[i].powi(2) + cop_ap_mm[i].powi(2)).sqrt();
        if r_origin > max_r {
            max_r = r_origin;
        }

        if i > 0 {
            let step_x = cop_ml_mm[i] - cop_ml_mm[i - 1];
            let step_y = cop_ap_mm[i] - cop_ap_mm[i - 1];
            path_len += (step_x * step_x + step_y * step_y).sqrt();
        }
    }

    let denom = ((n - 1).max(1)) as f64;
    let cov_xx = s_xx / denom;
    let cov_yy = s_yy / denom;
    let cov_xy = s_xy / denom;

    // Closed-form 2x2 symmetric covariance matrix eigenvalues
    let trace_half = 0.5 * (cov_xx + cov_yy);
    let diff_half = 0.5 * (cov_xx - cov_yy);
    let disc = (diff_half * diff_half + cov_xy * cov_xy).max(0.0).sqrt();

    let lambda_major = (trace_half + disc).max(1e-6);
    let lambda_minor = (trace_half - disc).max(1e-6);

    let chi_sqrt = CHI_SQUARE_2DOF_95.sqrt();
    let semi_major_mm = chi_sqrt * lambda_major.sqrt();
    let semi_minor_mm = chi_sqrt * lambda_minor.sqrt();
    let area_mm2 = PI * CHI_SQUARE_2DOF_95 * (lambda_major * lambda_minor).sqrt();

    let orientation_deg = 0.5 * (2.0 * cov_xy).atan2(cov_xx - cov_yy).to_degrees();
    let eccentricity = (1.0 - (lambda_minor / lambda_major).clamp(0.0, 1.0)).sqrt();

    let ml_rms_mm = (s_xx * inv_n).sqrt();
    let ap_rms_mm = (s_yy * inv_n).sqrt();
    let ap_ml_ratio = ap_rms_mm / ml_rms_mm.max(0.15);

    let safe_dur = duration_sec.max(0.5);
    let mean_velocity_mm_per_s = path_len / safe_dur;
    let directional_bias_deg = mean_y.atan2(mean_x).to_degrees();

    StatokinesigramMetrics {
        ellipse_95: ConfidenceEllipse95 {
            semi_major_mm,
            semi_minor_mm,
            area_mm2,
            orientation_deg,
            eccentricity,
            centroid_ml_mm: mean_x,
            centroid_ap_mm: mean_y,
        },
        sway_path_length_mm: path_len,
        mean_velocity_mm_per_s,
        ml_rms_mm,
        ap_rms_mm,
        ap_ml_ratio,
        max_excursion_mm: max_r,
        directional_bias_deg,
    }
}

/// Evaluates paired Eyes-Open vs. Eyes-Closed 15-second trials to compute the Romberg Quotient
/// and stratify vestibular concussion, proprioceptive deficit, and senior fall risk.
pub fn evaluate_romberg_protocol(
    open_ml_mm: &[f64],
    open_ap_mm: &[f64],
    closed_ml_mm: &[f64],
    closed_ap_mm: &[f64],
    trial_duration_sec: f64,
) -> RombergClinicalComparison {
    let eyes_open = compute_statokinesigram_pca(open_ml_mm, open_ap_mm, trial_duration_sec);
    let eyes_closed = compute_statokinesigram_pca(closed_ml_mm, closed_ap_mm, trial_duration_sec);

    let open_area = eyes_open.ellipse_95.area_mm2.max(4.0);
    let closed_area = eyes_closed.ellipse_95.area_mm2;
    let romberg_quotient = (closed_area / open_area).clamp(0.2, 25.0);

    let velocity_quotient =
        (eyes_closed.mean_velocity_mm_per_s / eyes_open.mean_velocity_mm_per_s.max(1.0))
            .clamp(0.2, 20.0);

    let centroid_drift_mm = (eyes_closed.ellipse_95.centroid_ml_mm.powi(2)
        + eyes_closed.ellipse_95.centroid_ap_mm.powi(2))
    .sqrt();

    let concussion_sideline_alert =
        closed_area > 260.0 || (romberg_quotient > 2.8 && eyes_closed.ml_rms_mm > 5.2);

    let fall_risk_tier = if closed_area < 120.0 && romberg_quotient < 2.1 {
        "LOW_FALL_RISK"
    } else if closed_area < 280.0 && romberg_quotient < 3.2 {
        "MODERATE_GUARDED_STABILITY"
    } else {
        "HIGH_VESTIBULAR_FALL_RISK"
    };

    let sensory_deficit_pattern = if romberg_quotient >= 4.2 && open_area < 110.0 {
        "PROPRIOCEPTIVE_DORSAL_COLUMN_DEPENDENCY"
    } else if centroid_drift_mm > 6.5 {
        "UNILATERAL_LABYRINTHINE_BPPV_ASYMMETRY"
    } else if concussion_sideline_alert {
        "VESTIBULAR_OTOLITHIC_CONCUSSION_PATTERN"
    } else {
        "INTEGRATED_MULTISENSORY_EQUILIBRIUM"
    };

    RombergClinicalComparison {
        eyes_open,
        eyes_closed,
        romberg_quotient,
        velocity_quotient,
        concussion_sideline_alert,
        fall_risk_tier,
        sensory_deficit_pattern,
    }
}
