package com.networkdiagnosticssuite

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class NetworkDiscoveryPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == NetworkDiscoveryModule.NAME) NetworkDiscoveryModule(reactContext) else null

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(NetworkDiscoveryModule.NAME to ReactModuleInfo(
            NetworkDiscoveryModule.NAME, NetworkDiscoveryModule.NAME,
            false, false, false, true
        ))
    }
}
