package com.networkdiagnosticssuite

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableType

class TcpProbeModule(context: ReactApplicationContext) : NativeTcpProbeSpec(context) {
    private val prober = TcpProbe()

    override fun getName() = NAME

    override fun probe(host: String, ports: ReadableArray, timeoutMs: Double, promise: Promise) {
        val bytes = UdpExchange.ipv4Bytes(host)
        if (bytes == null || !TcpProbe.isPrivate(bytes)) {
            promise.reject("E_INVALID_ARGUMENT", "El barrido solo admite direcciones IPv4 privadas.")
            return
        }
        if (!integerInRange(timeoutMs, 100, 5000) || ports.size() !in 1..TcpProbe.MAX_PORTS) {
            promise.reject("E_INVALID_ARGUMENT", "Revise los puertos y el plazo de espera.")
            return
        }
        val values = IntArray(ports.size())
        for (index in 0 until ports.size()) {
            if (ports.getType(index) != ReadableType.Number || !integerInRange(ports.getDouble(index), 1, 65535)) {
                promise.reject("E_INVALID_ARGUMENT", "Los puertos deben ser enteros entre 1 y 65535.")
                return
            }
            values[index] = ports.getDouble(index).toInt()
        }
        prober.probe(host, values, timeoutMs.toInt(), { open ->
            val result = Arguments.createArray()
            open.forEach { result.pushInt(it) }
            promise.resolve(result)
        }, { code, message -> promise.reject(code, message) })
    }

    override fun cancel() = prober.cancel()

    override fun invalidate() {
        prober.close()
        super.invalidate()
    }

    private fun integerInRange(value: Double, min: Int, max: Int) =
        value.isFinite() && value >= min && value <= max && value == value.toInt().toDouble()

    companion object { const val NAME = "NativeTcpProbe" }
}
