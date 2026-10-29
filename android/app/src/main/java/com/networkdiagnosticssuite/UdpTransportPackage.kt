package com.networkdiagnosticssuite

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class UdpTransportPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == UdpTransportModule.NAME) UdpTransportModule(reactContext) else null

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(UdpTransportModule.NAME to ReactModuleInfo(
            UdpTransportModule.NAME, UdpTransportModule.NAME,
            false, false, false, true
        ))
    }
}
