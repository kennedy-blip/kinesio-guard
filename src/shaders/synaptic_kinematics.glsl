#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_stressLevel;   // 0.0 = Nominal, 0.5 = Moderate Strain/Tremor, 1.0 = Severe Overload
uniform float u_tremorHz;      // Dominant neuromuscular oscillation frequency (2.0 - 16.0 Hz)
uniform float u_flexionRatio;  // Cervical flexion normalized (0.0 - 1.0)
uniform float u_themeMode;     // 0.0 = Neuro Obsidian, 1.0 = Rehab Daylight Frost, 2.0 = Warm Amber

// Simplex-inspired 2D hash & gradient value noise for smooth organic tensor fields
vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float gradientNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
    float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Rotational fractional Brownian motion (fBm) modeling cortical & myofascial tensor waves
float synapticFbm(vec2 uv, float phase) {
    float value = 0.0;
    float amp = 0.52;
    mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 5; i++) {
        value += amp * gradientNoise(uv + vec2(phase * 0.17, -phase * 0.13));
        uv = rot * uv * 2.03 + vec2(1.7, 9.2);
        amp *= 0.50;
    }
    return value;
}

// Tri-state clinical biomechanical palette interpolation
void computeClinicalPalette(
    float stress,
    float themeMode,
    out vec3 baseBg,
    out vec3 primaryWave,
    out vec3 secondaryBlob,
    out vec3 tertiaryGlow
) {
    // State 0: Steady Motor Control / Neutral 0°-10° Spine (Cyan #06B6D4, Bio-Teal #14B8A6, Emerald #10B981)
    vec3 c0A = vec3(0.024, 0.714, 0.831);
    vec3 c0B = vec3(0.078, 0.722, 0.651);
    vec3 c0C = vec3(0.063, 0.725, 0.506);

    // State 1: Moderate Tremor / 30° Cervical Strain 40 lbs (Violet #8B5CF6, Amber #F59E0B, Indigo #6366F1)
    vec3 c1A = vec3(0.545, 0.361, 0.965);
    vec3 c1B = vec3(0.961, 0.620, 0.043);
    vec3 c1C = vec3(0.388, 0.400, 0.945);

    // State 2: Severe Tremor / 60° Cervical Overload 60 lbs / Fall Risk (Crimson #EF4444, Magenta #EC4899, Coral #F97316)
    vec3 c2A = vec3(0.937, 0.267, 0.267);
    vec3 c2B = vec3(0.925, 0.282, 0.600);
    vec3 c2C = vec3(0.976, 0.451, 0.086);

    float s = clamp(stress, 0.0, 1.0);
    if (s < 0.5) {
        float t = smoothstep(0.0, 0.5, s);
        primaryWave = mix(c0A, c1A, t);
        secondaryBlob = mix(c0B, c1B, t);
        tertiaryGlow = mix(c0C, c1C, t);
    } else {
        float t = smoothstep(0.5, 1.0, s);
        primaryWave = mix(c1A, c2A, t);
        secondaryBlob = mix(c1B, c2B, t);
        tertiaryGlow = mix(c1C, c2C, t);
    }

    if (themeMode > 1.5) {
        // Ergonomic Warm Amber (Zero-Blue Evening Desk Posture Mode)
        baseBg = vec3(0.071, 0.043, 0.024);
        primaryWave = mix(vec3(0.945, 0.580, 0.145), vec3(0.945, 0.290, 0.160), s);
        secondaryBlob = mix(vec3(0.820, 0.430, 0.110), vec3(0.980, 0.480, 0.120), s);
        tertiaryGlow = vec3(0.690, 0.340, 0.090);
    } else if (themeMode > 0.5) {
        // Rehab Daylight Frost (Bright Physical Therapy Clinic Pearl)
        baseBg = vec3(0.935, 0.955, 0.980);
    } else {
        // Neuro Obsidian (Deep Cortical Void #05070F)
        baseBg = vec3(0.020, 0.027, 0.059);
    }
}

// Subtle hexagonal cortical-column lattice distance for myofascial & neural precision cueing
float hexCorticalLattice(vec2 p) {
    const vec2 s = vec2(1.0, 1.7320508);
    vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
    vec2 cell = (dot(h.xy, h.xy) < dot(h.zw, h.zw)) ? h.xy : h.zw;
    cell = abs(cell);
    float edgeDist = 0.5 - max(dot(cell, s * 0.5), cell.x);
    return smoothstep(0.035, 0.0, edgeDist);
}

// Thin-film spectral dispersion shimmer along high-curvature tensor wavefronts
vec3 thinFilmPrismDispersion(float phaseShift) {
    return 0.5 + 0.5 * cos(6.28318 * (phaseShift + vec3(0.00, 0.33, 0.67)));
}

void main() {
    vec2 res = max(u_resolution, vec2(1.0));
    vec2 uv = gl_FragCoord.xy / res;
    float aspect = res.x / res.y;

    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    vec2 ptr = (u_pointer - 0.5) * vec2(aspect, 1.0);

    // Modulate temporal phase slightly with detected neuromuscular frequency without visual strobing
    float cleanHz = clamp(u_tremorHz, 2.0, 15.0);
    float speed = 0.26 + 0.035 * cleanHz + 0.24 * clamp(u_stressLevel, 0.0, 1.0);
    float t = u_time * speed;

    // Domain-warped tensor coordinates representing motor-unit recruitment ripples
    vec2 warpQ = vec2(
        synapticFbm(p * 2.15 + vec2(0.0, t * 0.22), t),
        synapticFbm(p * 2.15 + vec2(5.2, -t * 0.18), t * 1.1)
    );

    vec2 pointerPull = (p - ptr);
    float ptrDist = length(pointerPull);
    float specularField = exp(-ptrDist * 2.6);

    vec2 warpR = vec2(
        synapticFbm(p * 3.1 + 1.85 * warpQ + vec2(1.7, 9.2) + 0.18 * specularField, t * 1.25),
        synapticFbm(p * 3.1 + 1.85 * warpQ + vec2(8.3, 2.8) - u_flexionRatio * 0.4, t * 0.95)
    );

    float fieldIntensity = synapticFbm(p * 2.4 + 2.1 * warpR, t);

    // Fine synaptic axonal wave ridges + hexagonal micro-lattice
    float ridgeArg = (p.x * 5.5 + p.y * 3.8 + warpR.x * 3.4) - u_time * (0.45 + cleanHz * 0.04);
    float synapticRidge = pow(0.5 + 0.5 * sin(ridgeArg), 5.0);
    float lattice = hexCorticalLattice((p + warpQ * 0.12) * 9.5);
    vec3 prismIridescence = thinFilmPrismDispersion(fieldIntensity * 0.8 + u_time * 0.05);

    vec3 baseBg;
    vec3 colA;
    vec3 colB;
    vec3 colC;
    computeClinicalPalette(u_stressLevel, u_themeMode, baseBg, colA, colB, colC);

    float blobMaskA = smoothstep(-0.35, 0.65, fieldIntensity);
    float blobMaskB = smoothstep(-0.20, 0.75, warpR.y);

    if (u_themeMode > 0.5 && u_themeMode < 1.5) {
        // Daylight Frost: subtle luminous clinical caustics over crisp pearl background
        vec3 tint = mix(colA, colB, blobMaskB);
        tint = mix(tint, colC, synapticRidge * 0.55);
        vec3 color = mix(baseBg, mix(baseBg, tint, 0.24), blobMaskA * 0.85 + specularField * 0.28);
        color -= vec3(0.03, 0.04, 0.05) * lattice * 0.35;
        color += vec3(0.06, 0.08, 0.10) * synapticRidge * 0.35;
        fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        return;
    }

    // Dark Obsidian & Warm Amber refractive bioluminescent neural field
    vec3 color = baseBg;
    color = mix(color, colA * 0.42, blobMaskA * 0.78);
    color = mix(color, colB * 0.38, blobMaskB * 0.62);
    color += colC * synapticRidge * (0.16 + 0.14 * clamp(u_stressLevel, 0.0, 1.0));
    color += mix(colA, prismIridescence, 0.25) * lattice * (0.045 + 0.04 * specularField);
    color += mix(colA, vec3(1.0), 0.35) * specularField * 0.14;

    // Gentle vignette to anchor crisp legibility on edges and dock
    float vignette = 1.0 - smoothstep(0.45, 1.38, length(p));
    color *= (0.72 + 0.28 * vignette);

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
