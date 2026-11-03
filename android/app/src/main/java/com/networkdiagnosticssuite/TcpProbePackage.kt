package com.networkdiagnosticssuite

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class TcpProbePackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == TcpProbeModule.NAME) TcpProbeModule(reactContext) else null

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(TcpProbeModule.NAME to ReactModuleInfo(
            TcpProbeModule.NAME, TcpProbeModule.NAME,
            false, false, false, true
        ))
    }
}
