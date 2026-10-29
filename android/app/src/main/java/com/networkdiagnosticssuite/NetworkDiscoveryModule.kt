package com.networkdiagnosticssuite

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext

class NetworkDiscoveryModule(context: ReactApplicationContext) :
    NativeNetworkDiscoverySpec(context), LifecycleEventListener {
    private val discovery = MdnsDiscovery(context)

    init { context.addLifecycleEventListener(this) }

    override fun getName() = NAME

    override fun getNetworkInfo(promise: Promise) {
        try {
            promise.resolve(networkMap(discovery.networkInfo()))
        } catch (error: Exception) {
            promise.reject("E_NO_LAN", error.message)
        }
    }

    override fun discover(timeoutMs: Double, promise: Promise) {
        discovery.start(timeoutMs.toInt(), { scan ->
            val services = Arguments.createArray()
            scan.services.forEach { service ->
                services.pushMap(Arguments.createMap().apply {
                    putString("address", service.address)
                    service.hostname?.let { putString("hostname", it) }
                    putString("name", service.name)
                    putString("type", service.type)
                    putInt("port", service.port)
                })
            }
            val warnings = Arguments.createArray()
            scan.warnings.forEach { warnings.pushString(it) }
            promise.resolve(Arguments.createMap().apply {
                putMap("network", networkMap(scan.network))
                putArray("services", services)
                putArray("warnings", warnings)
            })
        }, { code, message -> promise.reject(code, message) })
    }

    private fun networkMap(network: MdnsDiscovery.LanInfo) = Arguments.createMap().apply {
        putString("address", network.address)
        putString("transport", network.transport)
        putBoolean("emulator", network.emulator)
    }

    override fun cancelDiscovery() = discovery.cancel()
    override fun onHostPause() = discovery.cancel()
    override fun onHostDestroy() = discovery.cancel()
    override fun onHostResume() = Unit

    override fun invalidate() {
        reactApplicationContext.removeLifecycleEventListener(this)
        discovery.cancel()
        super.invalidate()
    }

    companion object { const val NAME = "NativeNetworkDiscovery" }
}
