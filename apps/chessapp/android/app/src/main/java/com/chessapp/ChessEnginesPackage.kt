package com.chessapp

import android.util.Log
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * New-architecture registration (BaseReactPackage). The module name MUST match
 * the TurboModuleRegistry name used in spec/NativeChessEngines.ts.
 */
class ChessEnginesPackage : BaseReactPackage() {
    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? {
        Log.d(TAG, "getModule('$name') called -> ${if (name == MODULE_NAME) "creating" else "null"}")
        return if (name == MODULE_NAME) ChessEnginesModule(reactContext) else null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        Log.d(TAG, "getReactModuleInfoProvider() called")
        return ReactModuleInfoProvider {
            Log.d(TAG, "ReactModuleInfoProvider() invoked, returning info for $MODULE_NAME")
            mapOf(
                MODULE_NAME to ReactModuleInfo(
                    MODULE_NAME,
                    ChessEnginesModule::class.java.name,
                    false, // canOverrideExistingModule
                    false, // needsEagerInit
                    false, // isCxxModule
                    // IMPORTANT: this is a LEGACY Kotlin module. isTurboModule must be
                    // false so ReactPackageTurboModuleManagerDelegate routes it through
                    // getLegacyModule() (interop) instead of dropping it in getModule().
                    false,
                ),
            )
        }
    }

    companion object {
        const val MODULE_NAME = "ChessEngines"
        const val TAG = "ChessEnginesPkg"
    }
}
