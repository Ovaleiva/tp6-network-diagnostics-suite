package com.networkdiagnosticssuite

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableType

class UdpTransportModule(context: ReactApplicationContext) :
    NativeUdpTransportSpec(context), LifecycleEventListener {
    private val transportLock = Any()
    private var transport = UdpExchange()
    private var paused = false
    private var destroyed = false

    init { context.addLifecycleEventListener(this) }

    override fun getName() = NAME

    override fun exchange(host: String, port: Double, payload: ReadableArray, timeoutMs: Double, promise: Promise) {
        // Read bridge-owned values on the native call queue, before scheduling I/O.
        if (UdpExchange.ipv4Bytes(host) == null || !integerInRange(port, 1, 65535) ||
            !integerInRange(timeoutMs, 100, 15000) || payload.size() !in 1..8192) {
            promise.reject("E_INVALID_ARGUMENT", "Revise la dirección IPv4, el puerto, los datos y el plazo de espera.")
            return
        }
        for (index in 0 until payload.size()) {
            if (payload.getType(index) != ReadableType.Number || !integerInRange(payload.getDouble(index), 0, 255)) {
                promise.reject("E_INVALID_ARGUMENT", "Los datos UDP deben contener únicamente bytes entre 0 y 255.")
                return
            }
        }
        val bytes = ByteArray(payload.size()) { payload.getDouble(it).toInt().toByte() }
        synchronized(transportLock) {
            if (destroyed || paused) {
                promise.reject("E_CANCELLED", "El transporte UDP no está activo.")
                return
            }
            transport.exchange(host, port.toInt(), bytes, timeoutMs.toInt(), { response ->
                val values = Arguments.createArray()
                response.forEach { values.pushInt(it.toInt() and 0xff) }
                promise.resolve(values)
            }, { code, message -> promise.reject(code, message) })
        }
    }

    override fun cancel() = synchronized(transportLock) { transport.cancel() }

    override fun onHostPause() = synchronized(transportLock) {
        paused = true
        transport.close()
    }

    override fun onHostResume() {
        synchronized(transportLock) {
            if (paused && !destroyed) {
                transport = UdpExchange()
                paused = false
            }
        }
    }

    override fun onHostDestroy() = synchronized(transportLock) {
        destroyed = true
        transport.close()
    }

    override fun invalidate() {
        reactApplicationContext.removeLifecycleEventListener(this)
        onHostDestroy()
        super.invalidate()
    }

    private fun integerInRange(value: Double, min: Int, max: Int) =
        value.isFinite() && value >= min && value <= max && value == value.toInt().toDouble()

    companion object { const val NAME = "NativeUdpTransport" }
}
