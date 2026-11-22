package com.kinesioguard.neuro;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * MainActivity — Registers native 200Hz InertialKinematics and BioHapticStabilizer plugins
 * inside the Capacitor Android WebView container.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(InertialKinematicsPlugin.class);
        registerPlugin(BioHapticStabilizerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
