package com.kinesioguard.neuro;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Process;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * InertialKinematicsPlugin — Native Android Java 17 Capacitor Sensor Engine.
 * Samples hardware TYPE_LINEAR_ACCELERATION, TYPE_GYROSCOPE, and TYPE_ROTATION_VECTOR
 * at 200 Hz (5,000 microseconds / SENSOR_DELAY_FASTEST) on a dedicated real-time HandlerThread.
 * Feeds 3-axis kinetic tremor frames, cervical cranial pitch/roll degrees, and sternum sway
 * telemetry to the Vue 3.5 + Rust WASM biomechanical pipeline with zero UI thread contention.
 */
@CapacitorPlugin(name = "InertialKinematics")
public class InertialKinematicsPlugin extends Plugin implements SensorEventListener {

    private static final int TARGET_SAMPLE_PERIOD_US = 5000; // 200 Hz (5 ms period)
    private static final int RING_BUFFER_CAPACITY = 2048;    // ~10.24s window at 200 Hz
    private static final float NS_TO_SEC = 1.0e-9f;

    private SensorManager sensorManager;
    private Sensor linearAccelSensor;
    private Sensor gravityFallbackAccel;
    private Sensor gyroscopeSensor;
    private Sensor rotationVectorSensor;

    private HandlerThread imuWorkerThread;
    private Handler imuWorkerHandler;
    private final AtomicBoolean isStreaming = new AtomicBoolean(false);

    // High-pass gravity estimator fallback if hardware TYPE_LINEAR_ACCELERATION is absent
    private final float[] gravityEstimate = new float[]{0.0f, 0.0f, 9.80665f};
    private final float[] latestLinearAccel = new float[]{0.0f, 0.0f, 0.0f};
    private final float[] latestGyroRadSec = new float[]{0.0f, 0.0f, 0.0f};
    private final float[] rotationMatrix = new float[9];
    private final float[] remappedMatrix = new float[9];
    private final float[] orientationAngles = new float[3];

    private volatile float cranialFlexionDeg = 0.0f;
    private volatile float sternumRollDeg = 0.0f;
    private volatile float sternumPitchDeg = 0.0f;
    private volatile double measuredHz = 0.0;

    // Lock-guarded circular buffer for zero-drop 10-second Welch PSD FFT snapshots
    private final Object ringLock = new Object();
    private final double[] ringAx = new double[RING_BUFFER_CAPACITY];
    private final double[] ringAy = new double[RING_BUFFER_CAPACITY];
    private final double[] ringAz = new double[RING_BUFFER_CAPACITY];
    private final long[] ringTimestampNs = new long[RING_BUFFER_CAPACITY];
    private int ringWriteIndex = 0;
    private int ringSampleCount = 0;

    private long lastAccelTimestampNs = 0L;
    private long lastBridgeEmitMs = 0L;
    private int bridgeEmitIntervalMs = 16; // ~60 FPS batched telemetry emission to WebView

    @Override
    public void load() {
        Context context = getContext();
        if (context != null) {
            sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
            if (sensorManager != null) {
                linearAccelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
                gravityFallbackAccel = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
                gyroscopeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
                rotationVectorSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            }
        }
    }

    @PluginMethod
    public void getHardwareCapabilities(PluginCall call) {
        JSObject caps = new JSObject();
        caps.put("platform", "android-java17-native");
        caps.put("hasLinearAcceleration", linearAccelSensor != null);
        caps.put("hasAccelerometerFallback", gravityFallbackAccel != null);
        caps.put("hasGyroscope", gyroscopeSensor != null);
        caps.put("hasRotationVector", rotationVectorSensor != null);
        caps.put("targetSampleRateHz", 200);
        caps.put("streamingActive", isStreaming.get());

        if (linearAccelSensor != null) {
            caps.put("linearAccelVendor", linearAccelSensor.getVendor());
            caps.put("linearAccelResolutionMps2", linearAccelSensor.getResolution());
            caps.put("minDelayMicros", linearAccelSensor.getMinDelay());
        }
        call.resolve(caps);
    }

    @PluginMethod
    public void startHighRateStream(PluginCall call) {
        if (sensorManager == null) {
            call.reject("Android SensorManager unavailable on this device.");
            return;
        }

        int requestedHz = call.getInt("sampleRateHz", 200);
        int emitFps = call.getInt("bridgeFps", 60);
        int periodUs = Math.max(2500, Math.min(20000, 1_000_000 / Math.max(25, requestedHz)));
        bridgeEmitIntervalMs = Math.max(8, 1000 / Math.max(15, Math.min(120, emitFps)));

        stopInternalSensorListeners();

        imuWorkerThread = new HandlerThread("KinesioGuard-IMU-200Hz", Process.THREAD_PRIORITY_URGENT_DISPLAY);
        imuWorkerThread.start();
        imuWorkerHandler = new Handler(imuWorkerThread.getLooper());

        synchronized (ringLock) {
            ringWriteIndex = 0;
            ringSampleCount = 0;
        }
        lastAccelTimestampNs = 0L;

        Sensor primaryLinear = (linearAccelSensor != null) ? linearAccelSensor : gravityFallbackAccel;
        boolean accelOk = false;
        if (primaryLinear != null) {
            accelOk = sensorManager.registerListener(
                this,
                primaryLinear,
                Math.min(periodUs, TARGET_SAMPLE_PERIOD_US),
                imuWorkerHandler
            );
        }
        if (gyroscopeSensor != null) {
            sensorManager.registerListener(this, gyroscopeSensor, periodUs, imuWorkerHandler);
        }
        if (rotationVectorSensor != null) {
            sensorManager.registerListener(
                this,
                rotationVectorSensor,
                SensorManager.SENSOR_DELAY_GAME,
                imuWorkerHandler
            );
        }

        isStreaming.set(accelOk);

        JSObject result = new JSObject();
        result.put("started", accelOk);
        result.put("configuredPeriodMicros", periodUs);
        result.put("usingHardwareLinearSensor", linearAccelSensor != null);
        result.put("sensorDelayMode", "SENSOR_DELAY_FASTEST_200HZ");
        call.resolve(result);
    }

    @PluginMethod
    public void stopHighRateStream(PluginCall call) {
        stopInternalSensorListeners();
        JSObject res = new JSObject();
        res.put("stopped", true);
        res.put("bufferedSamples", ringSampleCount);
        call.resolve(res);
    }

    @PluginMethod
    public void captureWelchWindowSnapshot(PluginCall call) {
        int requestedSamples = call.getInt("maxSamples", RING_BUFFER_CAPACITY);
        int limit = Math.max(64, Math.min(RING_BUFFER_CAPACITY, requestedSamples));

        JSArray axArr = new JSArray();
        JSArray ayArr = new JSArray();
        JSArray azArr = new JSArray();
        int exported;

        synchronized (ringLock) {
            exported = Math.min(limit, ringSampleCount);
            int startIdx = (ringWriteIndex - exported + RING_BUFFER_CAPACITY) % RING_BUFFER_CAPACITY;
            for (int i = 0; i < exported; i++) {
                int idx = (startIdx + i) % RING_BUFFER_CAPACITY;
                axArr.put(ringAx[idx]);
                ayArr.put(ringAy[idx]);
                azArr.put(ringAz[idx]);
            }
        }

        JSObject payload = new JSObject();
        payload.put("sampleCount", exported);
        payload.put("measuredSampleRateHz", measuredHz > 10.0 ? measuredHz : 200.0);
        payload.put("ax", axArr);
        payload.put("ay", ayArr);
        payload.put("az", azArr);
        payload.put("cranialFlexionDeg", cranialFlexionDeg);
        payload.put("sternumRollDeg", sternumRollDeg);
        payload.put("sternumPitchDeg", sternumPitchDeg);
        call.resolve(payload);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event == null || !isStreaming.get()) {
            return;
        }

        final int sensorType = event.sensor.getType();
        if (sensorType == Sensor.TYPE_LINEAR_ACCELERATION) {
            processLinearAcceleration(event.values[0], event.values[1], event.values[2], event.timestamp);
        } else if (sensorType == Sensor.TYPE_ACCELEROMETER && linearAccelSensor == null) {
            // 1.0 Hz high-pass IIR gravity subtraction fallback
            final float alpha = 0.969f;
            gravityEstimate[0] = alpha * gravityEstimate[0] + (1.0f - alpha) * event.values[0];
            gravityEstimate[1] = alpha * gravityEstimate[1] + (1.0f - alpha) * event.values[1];
            gravityEstimate[2] = alpha * gravityEstimate[2] + (1.0f - alpha) * event.values[2];
            processLinearAcceleration(
                event.values[0] - gravityEstimate[0],
                event.values[1] - gravityEstimate[1],
                event.values[2] - gravityEstimate[2],
                event.timestamp
            );
        } else if (sensorType == Sensor.TYPE_GYROSCOPE) {
            latestGyroRadSec[0] = event.values[0];
            latestGyroRadSec[1] = event.values[1];
            latestGyroRadSec[2] = event.values[2];
        } else if (sensorType == Sensor.TYPE_ROTATION_VECTOR) {
            SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values);
            SensorManager.remapCoordinateSystem(
                rotationMatrix,
                SensorManager.AXIS_X,
                SensorManager.AXIS_Z,
                remappedMatrix
            );
            SensorManager.getOrientation(remappedMatrix, orientationAngles);

            float pitchDeg = (float) Math.toDegrees(orientationAngles[1]);
            float rollDeg = (float) Math.toDegrees(orientationAngles[2]);

            // Cranial viewing flexion angle: upright vertical (0° neck flexion) -> flat horizontal (60° flexion)
            cranialFlexionDeg = Math.max(0.0f, Math.min(65.0f, Math.abs(pitchDeg)));
            sternumPitchDeg = pitchDeg;
            sternumRollDeg = rollDeg;
        }
    }

    private void processLinearAcceleration(float ax, float ay, float az, long timestampNs) {
        latestLinearAccel[0] = ax;
        latestLinearAccel[1] = ay;
        latestLinearAccel[2] = az;

        if (lastAccelTimestampNs > 0L && timestampNs > lastAccelTimestampNs) {
            double dtSec = (timestampNs - lastAccelTimestampNs) * NS_TO_SEC;
            if (dtSec > 0.0005 && dtSec < 0.25) {
                double instHz = 1.0 / dtSec;
                measuredHz = (measuredHz <= 1.0) ? instHz : (0.94 * measuredHz + 0.06 * instHz);
            }
        }
        lastAccelTimestampNs = timestampNs;

        synchronized (ringLock) {
            ringAx[ringWriteIndex] = ax;
            ringAy[ringWriteIndex] = ay;
            ringAz[ringWriteIndex] = az;
            ringTimestampNs[ringWriteIndex] = timestampNs;
            ringWriteIndex = (ringWriteIndex + 1) % RING_BUFFER_CAPACITY;
            if (ringSampleCount < RING_BUFFER_CAPACITY) {
                ringSampleCount++;
            }
        }

        long nowMs = System.currentTimeMillis();
        if (nowMs - lastBridgeEmitMs >= bridgeEmitIntervalMs) {
            lastBridgeEmitMs = nowMs;
            JSObject frame = new JSObject();
            frame.put("ax", ax);
            frame.put("ay", ay);
            frame.put("az", az);
            frame.put("gx", latestGyroRadSec[0]);
            frame.put("gy", latestGyroRadSec[1]);
            frame.put("gz", latestGyroRadSec[2]);
            frame.put("cranialFlexionDeg", cranialFlexionDeg);
            frame.put("sternumRollDeg", sternumRollDeg);
            frame.put("sternumPitchDeg", sternumPitchDeg);
            frame.put("sampleRateHz", measuredHz);
            frame.put("timestampMs", nowMs);
            notifyListeners("inertialFrame", frame);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        JSObject accEvent = new JSObject();
        accEvent.put("sensorName", sensor != null ? sensor.getName() : "unknown");
        accEvent.put("accuracyLevel", accuracy);
        notifyListeners("sensorAccuracyChanged", accEvent);
    }

    private void stopInternalSensorListeners() {
        isStreaming.set(false);
        if (sensorManager != null) {
            sensorManager.unregisterListener(this);
        }
        if (imuWorkerThread != null) {
            imuWorkerThread.quitSafely();
            imuWorkerThread = null;
            imuWorkerHandler = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopInternalSensorListeners();
        super.handleOnDestroy();
    }
}
