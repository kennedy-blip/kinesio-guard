package com.kinesioguard.neuro;

import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * BioHapticStabilizerPlugin — Native Android Java 17 Neuromuscular Haptic Biofeedback Engine.
 * Synthesizes phase-inverted (180° offset) linear resonant actuator (LRA) counter-pulses
 * matched to the Rust Welch PSD dominant tremor frequency (2.5 - 14.5 Hz), as well as
 * gentle ergonomic tactile alerts when C5-C7 cervical spine flexion exceeds safe thresholds.
 */
@CapacitorPlugin(name = "BioHapticStabilizer")
public class BioHapticStabilizerPlugin extends Plugin {

    private Vibrator vibrator;
    private volatile boolean pacingActive = false;
    private volatile double activeFrequencyHz = 0.0;

    @Override
    public void load() {
        Context context = getContext();
        if (context == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            if (vm != null) {
                vibrator = vm.getDefaultVibrator();
            }
        } else {
            vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        }
    }

    @PluginMethod
    public void getHapticStatus(PluginCall call) {
        boolean hasHardware = vibrator != null && vibrator.hasVibrator();
        boolean hasAmplitudeCtrl = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && vibrator != null
            && vibrator.hasAmplitudeControl();

        JSObject status = new JSObject();
        status.put("hasVibrator", hasHardware);
        status.put("hasAmplitudeControl", hasAmplitudeCtrl);
        status.put("pacingActive", pacingActive);
        status.put("activeFrequencyHz", activeFrequencyHz);
        call.resolve(status);
    }

    /**
     * Emits a 180-degree phase-inverted haptic pulse train locked to the user's dominant tremor Hz
     * to engage afferent proprioceptive Ia spindle gating and rhythmic motor pacing.
     */
    @PluginMethod
    public void startPhaseInvertedPacing(PluginCall call) {
        if (vibrator == null || !vibrator.hasVibrator()) {
            call.reject("Hardware LRA/ERM haptic actuator unavailable.");
            return;
        }

        double freqHz = Math.max(2.0, Math.min(16.0, call.getDouble("frequencyHz", 5.5)));
        double phaseDeg = Math.max(0.0, Math.min(360.0, call.getDouble("phaseOffsetDeg", 180.0)));
        int intensity = Math.max(25, Math.min(255, call.getInt("amplitude", 155)));
        int cycles = Math.max(4, Math.min(40, call.getInt("cycles", 16)));

        long fullPeriodMs = Math.max(45L, Math.round(1000.0 / freqHz));
        long phaseLeadDelayMs = Math.round((phaseDeg / 360.0) * fullPeriodMs);
        long onPulseMs = Math.max(12L, Math.round(fullPeriodMs * 0.28));
        long offRestMs = Math.max(18L, fullPeriodMs - onPulseMs);

        long[] timings = new long[1 + cycles * 2];
        int[] amplitudes = new int[1 + cycles * 2];

        timings[0] = Math.max(1L, phaseLeadDelayMs);
        amplitudes[0] = 0;

        for (int c = 0; c < cycles; c++) {
            int pulseIdx = 1 + c * 2;
            int restIdx = pulseIdx + 1;
            timings[pulseIdx] = onPulseMs;
            amplitudes[pulseIdx] = intensity;
            timings[restIdx] = offRestMs;
            amplitudes[restIdx] = 0;
        }

        triggerWaveform(timings, amplitudes, -1);
        pacingActive = true;
        activeFrequencyHz = freqHz;

        JSObject out = new JSObject();
        out.put("engaged", true);
        out.put("frequencyHz", freqHz);
        out.put("periodMs", fullPeriodMs);
        out.put("phaseLeadDelayMs", phaseLeadDelayMs);
        out.put("pulseWidthMs", onPulseMs);
        call.resolve(out);
    }

    /**
     * Emits a gentle two-tap ascending tactile posture reminder when cranial flexion exceeds
     * the safe cervical disc threshold (e.g., >25° / 36+ lbs C5-C7 load for >10 seconds).
     */
    @PluginMethod
    public void emitCervicalPostureAlert(PluginCall call) {
        if (vibrator == null || !vibrator.hasVibrator()) {
            JSObject fallback = new JSObject();
            fallback.put("emitted", false);
            fallback.put("reason", "no_hardware_vibrator");
            call.resolve(fallback);
            return;
        }

        double flexionDeg = call.getDouble("flexionDegrees", 35.0);
        int baseAmp = flexionDeg >= 45.0 ? 220 : 140;

        long[] timings = new long[]{0L, 45L, 70L, 85L};
        int[] amplitudes = new int[]{0, Math.max(60, baseAmp - 50), 0, baseAmp};
        triggerWaveform(timings, amplitudes, -1);

        JSObject res = new JSObject();
        res.put("emitted", true);
        res.put("pattern", "ASCENDING_CERVICAL_CHIME_PULSE");
        res.put("flexionDegrees", flexionDeg);
        call.resolve(res);
    }

    /**
     * Emits a distinct triple-tap sternum haptic cue signaling the athlete or patient to
     * transition from the 15s Eyes-Open baseline into the 15s Eyes-Closed Romberg phase
     * without looking down at the screen.
     */
    @PluginMethod
    public void emitRombergEyesClosedCue(PluginCall call) {
        if (vibrator == null || !vibrator.hasVibrator()) {
            JSObject out = new JSObject();
            out.put("emitted", false);
            call.resolve(out);
            return;
        }

        String stage = call.getString("stage", "EYES_CLOSED_TRANSITION");
        long[] timings;
        int[] amplitudes;

        if ("TRIAL_COMPLETE".equals(stage)) {
            timings = new long[]{0L, 90L, 60L, 140L};
            amplitudes = new int[]{0, 170, 0, 235};
        } else {
            timings = new long[]{0L, 55L, 55L, 55L, 55L, 85L};
            amplitudes = new int[]{0, 150, 0, 175, 0, 215};
        }

        triggerWaveform(timings, amplitudes, -1);

        JSObject out = new JSObject();
        out.put("emitted", true);
        out.put("stage", stage);
        call.resolve(out);
    }

    /**
     * Evaluates Android API level, Power Save state, and OS Thermal Status so the Vue 3.5 shell
     * can automatically engage Eco-Glass / Low-GPU Mode on Android API < 31 or throttled phones.
     */
    @PluginMethod
    public void getDeviceEcoGpuProfile(PluginCall call) {
        Context context = getContext();
        boolean powerSave = false;
        int thermalStatus = 0;

        if (context != null) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                powerSave = pm.isPowerSaveMode();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    thermalStatus = pm.getCurrentThermalStatus();
                }
            }
        }

        boolean recommendEcoGlass = (Build.VERSION.SDK_INT < Build.VERSION_CODES.S)
            || powerSave
            || (thermalStatus >= 2);

        JSObject profile = new JSObject();
        profile.put("sdkInt", Build.VERSION.SDK_INT);
        profile.put("powerSaveMode", powerSave);
        profile.put("thermalStatus", thermalStatus);
        profile.put("recommendEcoGlass60Fps", recommendEcoGlass);
        call.resolve(profile);
    }

    @PluginMethod
    public void stopStabilizerPulses(PluginCall call) {
        if (vibrator != null) {
            vibrator.cancel();
        }
        pacingActive = false;
        activeFrequencyHz = 0.0;

        JSObject res = new JSObject();
        res.put("stopped", true);
        call.resolve(res);
    }

    @SuppressWarnings("deprecation")
    private void triggerWaveform(long[] timings, int[] amplitudes, int repeatIndex) {
        if (vibrator == null) {
            return;
        }
        vibrator.cancel();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (vibrator.hasAmplitudeControl()) {
                VibrationEffect effect = VibrationEffect.createWaveform(timings, amplitudes, repeatIndex);
                vibrator.vibrate(effect);
            } else {
                VibrationEffect fallback = VibrationEffect.createWaveform(timings, repeatIndex);
                vibrator.vibrate(fallback);
            }
        } else {
            vibrator.vibrate(timings, repeatIndex);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (vibrator != null) {
            vibrator.cancel();
        }
        pacingActive = false;
        super.handleOnDestroy();
    }
}
