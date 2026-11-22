//! 3-Axis Welch Power Spectral Density (1.0 - 18.0 Hz) & Archimedes Spiral Ataxia DSP Engine
//! Pure Rust zero-dependency biomechanical frequency-domain classifier.

use core::f64::consts::PI;

#[derive(Clone, Copy, Debug, Default)]
pub struct Complex64 {
    pub re: f64,
    pub im: f64,
}

impl Complex64 {
    #[inline]
    pub const fn new(re: f64, im: f64) -> Self {
        Self { re, im }
    }

    #[inline]
    pub fn add(self, rhs: Self) -> Self {
        Self {
            re: self.re + rhs.re,
            im: self.im + rhs.im,
        }
    }

    #[inline]
    pub fn sub(self, rhs: Self) -> Self {
        Self {
            re: self.re - rhs.re,
            im: self.im - rhs.im,
        }
    }

    #[inline]
    pub fn mul(self, rhs: Self) -> Self {
        Self {
            re: self.re * rhs.re - self.im * rhs.im,
            im: self.re * rhs.im + self.im * rhs.re,
        }
    }

    #[inline]
    pub fn norm_sq(self) -> f64 {
        self.re * self.re + self.im * self.im
    }
}

#[derive(Clone, Debug)]
pub struct TremorBandPowers {
    pub cerebellar_2_5_to_4_0_hz: f64,
    pub parkinsonian_4_0_to_6_0_hz: f64,
    pub essential_6_0_to_10_0_hz: f64,
    pub physiological_10_0_to_14_5_hz: f64,
    pub total_band_power: f64,
}

#[derive(Clone, Debug)]
pub struct TremorSpectrumReport {
    pub frequencies_hz: Vec<f64>,
    pub psd_total: Vec<f64>,
    pub psd_x: Vec<f64>,
    pub psd_y: Vec<f64>,
    pub psd_z: Vec<f64>,
    pub dominant_freq_hz: f64,
    pub peak_psd_density: f64,
    pub rms_accel_mps2: f64,
    pub rms_displacement_mm: f64,
    pub narrowband_q_factor: f64,
    pub harmonic_ratio: f64,
    pub mds_updrs_score: f64,
    pub phenotype_code: &'static str,
    pub band_powers: TremorBandPowers,
}

#[derive(Clone, Debug)]
pub struct SpiralAtaxiaReport {
    pub radial_rms_error_mm: f64,
    pub max_radial_deviation_mm: f64,
    pub tremor_axis_degrees: f64,
    pub spectral_arc_length_sparc: f64,
    pub target_overshoot_ratio: f64,
    pub ataxia_severity_index: f64,
}

/// 2nd-order Butterworth high-pass filter (fc = 1.0 Hz) to strip gravitational tilt drift.
pub struct ButterworthHighPass {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl ButterworthHighPass {
    pub fn new(cutoff_hz: f64, sample_rate_hz: f64) -> Self {
        let safe_fs = sample_rate_hz.max(20.0);
        let safe_fc = cutoff_hz.clamp(0.2, safe_fs * 0.45);
        let ita = 1.0 / (PI * safe_fc / safe_fs).tan();
        let sqrt2 = core::f64::consts::SQRT_2;
        let denom = 1.0 + sqrt2 * ita + ita * ita;
        let b0 = (ita * ita) / denom;
        Self {
            b0,
            b1: -2.0 * b0,
            b2: b0,
            a1: 2.0 * (1.0 - ita * ita) / denom,
            a2: (1.0 - sqrt2 * ita + ita * ita) / denom,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    #[inline]
    pub fn process_sample(&mut self, x0: f64) -> f64 {
        let y0 = self.b0 * x0 + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x0;
        self.y2 = self.y1;
        self.y1 = y0;
        y0
    }

    pub fn filter_series(&mut self, samples: &[f64]) -> Vec<f64> {
        if samples.is_empty() {
            return Vec::new();
        }
        let mean = samples.iter().copied().sum::<f64>() / (samples.len() as f64);
        let mut out = Vec::with_capacity(samples.len());
        for &s in samples {
            out.push(self.process_sample(s - mean));
        }
        out
    }
}

/// In-place Cooley-Tukey Radix-2 decimation-in-time FFT. `buf.len()` must be a power of two.
pub fn radix2_fft_in_place(buf: &mut [Complex64]) {
    let n = buf.len();
    if n <= 1 || !n.is_power_of_two() {
        return;
    }

    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while (j & bit) != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            buf.swap(i, j);
        }
    }

    let mut len = 2usize;
    while len <= n {
        let half = len >> 1;
        let theta = -2.0 * PI / (len as f64);
        let w_step = Complex64::new(theta.cos(), theta.sin());
        let mut start = 0usize;
        while start < n {
            let mut w = Complex64::new(1.0, 0.0);
            for k in 0..half {
                let u = buf[start + k];
                let v = buf[start + k + half].mul(w);
                buf[start + k] = u.add(v);
                buf[start + k + half] = u.sub(v);
                w = w.mul(w_step);
            }
            start += len;
        }
        len <<= 1;
    }
}

fn single_axis_welch_psd(signal: &[f64], sample_rate_hz: f64, fft_len: usize) -> Vec<f64> {
    let half_bins = fft_len / 2 + 1;
    if signal.len() < 16 {
        return vec![0.0; half_bins];
    }

    let seg_len = signal.len().min(512).max(32);
    let step = (seg_len / 2).max(1);
    let mut window = Vec::with_capacity(seg_len);
    let mut win_energy = 0.0;
    for i in 0..seg_len {
        let w = 0.5 * (1.0 - (2.0 * PI * (i as f64) / ((seg_len - 1) as f64)).cos());
        win_energy += w * w;
        window.push(w);
    }

    let mut accum = vec![0.0; half_bins];
    let mut segments = 0usize;
    let mut offset = 0usize;
    let mut fft_buf = vec![Complex64::default(); fft_len];

    while offset + seg_len <= signal.len() {
        for item in fft_buf.iter_mut() {
            *item = Complex64::default();
        }
        for i in 0..seg_len {
            fft_buf[i] = Complex64::new(signal[offset + i] * window[i], 0.0);
        }
        radix2_fft_in_place(&mut fft_buf);

        let scale = 1.0 / (sample_rate_hz * win_energy.max(1e-12));
        for b in 0..half_bins {
            let one_sided = if b == 0 || b == fft_len / 2 { 1.0 } else { 2.0 };
            accum[b] += one_sided * fft_buf[b].norm_sq() * scale;
        }
        segments += 1;
        offset += step;
    }

    if segments == 0 {
        for item in fft_buf.iter_mut() {
            *item = Complex64::default();
        }
        for (i, &val) in signal.iter().take(fft_len).enumerate() {
            fft_buf[i] = Complex64::new(val, 0.0);
        }
        radix2_fft_in_place(&mut fft_buf);
        let norm = 1.0 / (sample_rate_hz * (signal.len() as f64));
        for b in 0..half_bins {
            accum[b] = 2.0 * fft_buf[b].norm_sq() * norm;
        }
        return accum;
    }

    let inv_seg = 1.0 / (segments as f64);
    for val in accum.iter_mut() {
        *val *= inv_seg;
    }
    accum
}

fn interpolate_bin(raw_psd: &[f64], target_hz: f64, bin_df: f64) -> f64 {
    if raw_psd.is_empty() || bin_df <= 0.0 {
        return 0.0;
    }
    let exact = target_hz / bin_df;
    let idx = exact.floor() as usize;
    if idx + 1 >= raw_psd.len() {
        return *raw_psd.last().unwrap_or(&0.0);
    }
    let frac = exact - (idx as f64);
    raw_psd[idx] * (1.0 - frac) + raw_psd[idx + 1] * frac
}

/// Computes full 3-Axis Welch Power Spectral Density across 1.0 - 18.0 Hz at 0.1 Hz step.
pub fn welch_psd_3axis(
    ax: &[f64],
    ay: &[f64],
    az: &[f64],
    sample_rate_hz: f64,
) -> TremorSpectrumReport {
    let n = ax.len().min(ay.len()).min(az.len());
    let fs = sample_rate_hz.max(30.0);
    let fft_len = 2048usize;
    let bin_df = fs / (fft_len as f64);

    let mut hpx = ButterworthHighPass::new(1.0, fs);
    let mut hpy = ButterworthHighPass::new(1.0, fs);
    let mut hpz = ButterworthHighPass::new(1.0, fs);

    let fx = hpx.filter_series(&ax[..n]);
    let fy = hpy.filter_series(&ay[..n]);
    let fz = hpz.filter_series(&az[..n]);

    let raw_x = single_axis_welch_psd(&fx, fs, fft_len);
    let raw_y = single_axis_welch_psd(&fy, fs, fft_len);
    let raw_z = single_axis_welch_psd(&fz, fs, fft_len);

    // Resample onto exact 0.1 Hz clinical grid from 1.0 Hz to 18.0 Hz (171 bins)
    let grid_count = 171usize;
    let mut frequencies_hz = Vec::with_capacity(grid_count);
    let mut psd_x = Vec::with_capacity(grid_count);
    let mut psd_y = Vec::with_capacity(grid_count);
    let mut psd_z = Vec::with_capacity(grid_count);
    let mut psd_total = Vec::with_capacity(grid_count);

    for idx in 0..grid_count {
        let hz = 1.0 + (idx as f64) * 0.1;
        let px = interpolate_bin(&raw_x, hz, bin_df);
        let py = interpolate_bin(&raw_y, hz, bin_df);
        let pz = interpolate_bin(&raw_z, hz, bin_df);
        frequencies_hz.push(hz);
        psd_x.push(px);
        psd_y.push(py);
        psd_z.push(pz);
        psd_total.push(px + py + pz);
    }

    // Locate dominant neuromuscular peak in 2.0 - 16.0 Hz diagnostic window
    let mut peak_idx = 10usize;
    let mut peak_val = 0.0f64;
    for (i, &hz) in frequencies_hz.iter().enumerate() {
        if (2.0..=16.0).contains(&hz) && psd_total[i] > peak_val {
            peak_val = psd_total[i];
            peak_idx = i;
        }
    }

    // Parabolic sub-bin peak frequency refinement
    let mut dominant_freq_hz = frequencies_hz[peak_idx];
    if peak_idx > 0 && peak_idx + 1 < grid_count {
        let alpha = psd_total[peak_idx - 1];
        let beta = psd_total[peak_idx];
        let gamma = psd_total[peak_idx + 1];
        let denom = alpha - 2.0 * beta + gamma;
        if denom.abs() > 1e-12 {
            let delta = 0.5 * (alpha - gamma) / denom;
            dominant_freq_hz = (dominant_freq_hz + delta.clamp(-0.5, 0.5) * 0.1).clamp(1.5, 16.5);
        }
    }

    // Narrowband -3 dB quality factor Q = f_peak / BW_-3dB
    let half_power = peak_val * 0.5;
    let mut left_idx = peak_idx;
    while left_idx > 0 && psd_total[left_idx] > half_power {
        left_idx -= 1;
    }
    let mut right_idx = peak_idx;
    while right_idx + 1 < grid_count && psd_total[right_idx] > half_power {
        right_idx += 1;
    }
    let bw_hz = ((right_idx.saturating_sub(left_idx)) as f64 * 0.1).max(0.25);
    let narrowband_q_factor = (dominant_freq_hz / bw_hz).clamp(0.5, 40.0);

    // 2nd harmonic rhythmicity index
    let harmonic_hz = dominant_freq_hz * 2.0;
    let harmonic_ratio = if harmonic_hz <= 17.8 && peak_val > 1e-12 {
        let harm_bin = ((harmonic_hz - 1.0) * 10.0).round() as usize;
        let harm_p = psd_total.get(harm_bin).copied().unwrap_or(0.0);
        (harm_p / peak_val).clamp(0.0, 2.0)
    } else {
        0.0
    };

    // Integrate clinical neurological frequency bands (df = 0.1 Hz)
    let df = 0.1;
    let mut cerebellar = 0.0;
    let mut parkinsonian = 0.0;
    let mut essential = 0.0;
    let mut physiological = 0.0;
    let mut total_power = 0.0;
    let mut disp_var_m2 = 0.0;

    for (i, &hz) in frequencies_hz.iter().enumerate() {
        let p_band = psd_total[i] * df;
        total_power += p_band;
        if (2.5..4.0).contains(&hz) {
            cerebellar += p_band;
        } else if (4.0..6.0).contains(&hz) {
            parkinsonian += p_band;
        } else if (6.0..10.0).contains(&hz) {
            essential += p_band;
        } else if (10.0..=14.5).contains(&hz) {
            physiological += p_band;
        }
        if hz >= 2.0 {
            let omega4 = (2.0 * PI * hz).powi(4);
            disp_var_m2 += p_band / omega4.max(1e-6);
        }
    }

    let rms_accel_mps2 = total_power.max(0.0).sqrt();
    let rms_displacement_mm = (disp_var_m2.max(0.0).sqrt() * 1000.0 * core::f64::consts::SQRT_2)
        .clamp(0.0, 45.0);

    // Elble-Weber logarithmic MDS-UPDRS tremor severity mapping (0.0 - 4.0)
    let amp_cm = (rms_displacement_mm / 10.0).max(0.001);
    let mds_updrs_score = if rms_displacement_mm < 0.12 {
        0.0
    } else {
        ((amp_cm / 0.025).log10() * 1.65).clamp(0.0, 4.0)
    };

    let phenotype_code = classify_tremor_band(dominant_freq_hz, rms_displacement_mm);

    TremorSpectrumReport {
        frequencies_hz,
        psd_total,
        psd_x,
        psd_y,
        psd_z,
        dominant_freq_hz,
        peak_psd_density: peak_val,
        rms_accel_mps2,
        rms_displacement_mm,
        narrowband_q_factor,
        harmonic_ratio,
        mds_updrs_score,
        phenotype_code,
        band_powers: TremorBandPowers {
            cerebellar_2_5_to_4_0_hz: cerebellar,
            parkinsonian_4_0_to_6_0_hz: parkinsonian,
            essential_6_0_to_10_0_hz: essential,
            physiological_10_0_to_14_5_hz: physiological,
            total_band_power: total_power,
        },
    }
}

pub fn classify_tremor_band(freq_hz: f64, amp_mm: f64) -> &'static str {
    if amp_mm < 0.12 {
        "NOMINAL_SURGEON_BASELINE"
    } else if (2.5..4.0).contains(&freq_hz) {
        "CEREBELLAR_INTENTION_SIGNATURE"
    } else if (4.0..6.0).contains(&freq_hz) {
        "PARKINSONIAN_REST_SIGNATURE"
    } else if (6.0..10.0).contains(&freq_hz) {
        "ESSENTIAL_POSTURAL_KINETIC_SIGNATURE"
    } else if (10.0..=14.5).contains(&freq_hz) {
        "PHYSIOLOGICAL_SYMPATHETIC_JITTER"
    } else {
        "UNCLASSIFIED_BROADBAND_OSCILLATION"
    }
}

/// Evaluates an Archimedes Spiral trace r = a + b*theta for radial deviation, tremor axis & SPARC smoothness.
pub fn analyze_archimedes_spiral(
    points_x_mm: &[f64],
    points_y_mm: &[f64],
    timestamps_sec: &[f64],
    spiral_a_mm: f64,
    spiral_b_mm_per_rad: f64,
) -> SpiralAtaxiaReport {
    let n = points_x_mm
        .len()
        .min(points_y_mm.len())
        .min(timestamps_sec.len());
    if n < 8 {
        return SpiralAtaxiaReport {
            radial_rms_error_mm: 0.0,
            max_radial_deviation_mm: 0.0,
            tremor_axis_degrees: 0.0,
            spectral_arc_length_sparc: -1.42,
            target_overshoot_ratio: 0.0,
            ataxia_severity_index: 0.0,
        };
    }

    let mut unwrapped_theta = points_y_mm[0].atan2(points_x_mm[0]);
    if unwrapped_theta < 0.0 {
        unwrapped_theta += 2.0 * PI;
    }
    let mut prev_raw = points_y_mm[0].atan2(points_x_mm[0]);

    let mut sum_sq_err = 0.0;
    let mut max_err = 0.0f64;
    let mut outer_overshoot = 0.0;
    let mut outer_count = 0usize;
    let mut cov_xx = 0.0;
    let mut cov_yy = 0.0;
    let mut cov_xy = 0.0;
    let mut speeds = Vec::with_capacity(n - 1);

    for i in 0..n {
        let x = points_x_mm[i];
        let y = points_y_mm[i];
        let raw_ang = y.atan2(x);
        if i > 0 {
            let mut d_theta = raw_ang - prev_raw;
            while d_theta <= -PI {
                d_theta += 2.0 * PI;
            }
            while d_theta > PI {
                d_theta -= 2.0 * PI;
            }
            unwrapped_theta = (unwrapped_theta + d_theta).max(0.0);
            prev_raw = raw_ang;

            let dt = (timestamps_sec[i] - timestamps_sec[i - 1]).max(0.002);
            let dx = x - points_x_mm[i - 1];
            let dy = y - points_y_mm[i - 1];
            speeds.push((dx * dx + dy * dy).sqrt() / dt);
        }

        let r_actual = (x * x + y * y).sqrt();
        let r_ideal = spiral_a_mm + spiral_b_mm_per_rad * unwrapped_theta;
        let radial_err = r_actual - r_ideal;
        sum_sq_err += radial_err * radial_err;
        if radial_err.abs() > max_err {
            max_err = radial_err.abs();
        }

        if i > (n * 3) / 4 {
            outer_overshoot += radial_err.abs();
            outer_count += 1;
        }

        // Residual Cartesian vector for dominant tremor axis orientation
        let ex = radial_err * raw_ang.cos();
        let ey = radial_err * raw_ang.sin();
        cov_xx += ex * ex;
        cov_yy += ey * ey;
        cov_xy += ex * ey;
    }

    let radial_rms_error_mm = (sum_sq_err / (n as f64)).sqrt();
    let axis_rad = 0.5 * (2.0 * cov_xy).atan2(cov_xx - cov_yy);
    let mut tremor_axis_degrees = axis_rad.to_degrees();
    if tremor_axis_degrees < 0.0 {
        tremor_axis_degrees += 180.0;
    }

    // Velocity smoothness proxy (Spectral Arc Length SPARC, nominal healthy ~ -1.45, severe ataxia < -4.5)
    let mean_speed = if speeds.is_empty() {
        1.0
    } else {
        (speeds.iter().sum::<f64>() / (speeds.len() as f64)).max(1e-3)
    };
    let mut jerk_arc = 0.0;
    for w in speeds.windows(2) {
        let dv = (w[1] - w[0]) / mean_speed;
        jerk_arc += (0.01 + dv * dv).sqrt();
    }
    let spectral_arc_length_sparc = -(1.35 + (jerk_arc / (speeds.len().max(1) as f64)) * 6.5)
        .clamp(1.25, 9.5);

    let outer_mean = if outer_count > 0 {
        outer_overshoot / (outer_count as f64)
    } else {
        radial_rms_error_mm
    };
    let target_overshoot_ratio = (outer_mean / radial_rms_error_mm.max(0.25)).clamp(0.4, 4.0);
    let ataxia_severity_index =
        (radial_rms_error_mm * 1.15 + target_overshoot_ratio * 0.85).clamp(0.0, 10.0);

    SpiralAtaxiaReport {
        radial_rms_error_mm,
        max_radial_deviation_mm: max_err,
        tremor_axis_degrees,
        spectral_arc_length_sparc,
        target_overshoot_ratio,
        ataxia_severity_index,
    }
}
