package com.networkdiagnosticssuite

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class SshClientPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == SshClientModule.NAME) SshClientModule(reactContext) else null

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(SshClientModule.NAME to ReactModuleInfo(
            SshClientModule.NAME, SshClientModule.NAME,
            false, false, false, true
        ))
    }
}
