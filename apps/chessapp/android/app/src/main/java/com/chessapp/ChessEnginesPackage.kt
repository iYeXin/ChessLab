package com.chessapp

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
    ): NativeModule? =
        if (name == MODULE_NAME) ChessEnginesModule(reactContext) else null

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
        ReactModuleInfoProvider {
            mapOf(
                MODULE_NAME to ReactModuleInfo(
                    MODULE_NAME,
                    ChessEnginesModule::class.java.name,
                    false, // canOverrideExistingModule
                    false, // needsEagerInit
                    false, // isCxxModule
                    true,  // isTurboModule
                ),
            )
        }

    companion object {
        const val MODULE_NAME = "ChessEngines"
    }
}
