package com.networkdiagnosticssuite

import android.app.Instrumentation
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Bundle
import android.os.Build
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Anuncio real y acotado al test. No forma parte de la app entregada ni de sus resultados normales. */
class DiscoveryInstrumentation : Instrumentation() {
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }

    override fun onStart() {
        val nsd = targetContext.getSystemService(NsdManager::class.java)
        val registration = CountDownLatch(1)
        val unregistration = CountDownLatch(1)
        val socket = ServerSocket(0)
        val fixtureName = "TP6-test-${System.currentTimeMillis()}"
        var registrationError: String? = null
        var registeredName = ""
        val listener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(info: NsdServiceInfo) { registeredName = info.serviceName; registration.countDown() }
            override fun onRegistrationFailed(info: NsdServiceInfo, code: Int) { registrationError = "registro: $code"; registration.countDown() }
            override fun onServiceUnregistered(info: NsdServiceInfo) { unregistration.countDown() }
            override fun onUnregistrationFailed(info: NsdServiceInfo, code: Int) { unregistration.countDown() }
        }
        val discovery = MdnsDiscovery(targetContext)
        var code = -1
        val report = Bundle()
        try {
            nsd.registerService(NsdServiceInfo().apply {
                serviceName = fixtureName; serviceType = "_http._tcp."; port = socket.localPort
            }, NsdManager.PROTOCOL_DNS_SD, listener)
            check(registration.await(15, TimeUnit.SECONDS)) { "El anuncio de prueba no se registró." }
            check(registrationError == null) { registrationError ?: "registro fallido" }
            val completed = CountDownLatch(1)
            var result: MdnsDiscovery.Scan? = null
            var error: String? = null
            discovery.start(10000, { result = it; completed.countDown() }, { c, m -> error = "$c: $m"; completed.countDown() })
            check(completed.await(20, TimeUnit.SECONDS)) { "El escaneo no finalizó en plazo." }
            check(error == null) { error ?: "falló el escaneo" }
            check(result!!.services.any { it.name == registeredName && it.port == socket.localPort }) {
                "No apareció el servicio anunciado: ${result!!.services}; avisos: ${result!!.warnings}"
            }
            val resolved = result!!.services.first { it.name == registeredName && it.port == socket.localPort }
            if (Build.VERSION.SDK_INT >= 36) {
                check(!resolved.hostname.isNullOrBlank()) { "NSD no devolvió el hostname resuelto en API 36+." }
                report.putString("hostname", resolved.hostname)
            }
            val cancelled = CountDownLatch(1)
            val busy = CountDownLatch(1)
            var cancelCode = ""
            var busyCode = ""
            discovery.start(12000, { cancelled.countDown() }, { c, _ -> cancelCode = c; cancelled.countDown() })
            discovery.start(12000, { busy.countDown() }, { c, _ -> busyCode = c; busy.countDown() })
            check(busy.await(5, TimeUnit.SECONDS) && busyCode == "E_BUSY") { "No protegió búsquedas simultáneas." }
            discovery.cancel()
            check(cancelled.await(5, TimeUnit.SECONDS) && cancelCode == "E_CANCELLED") { "No canceló el escaneo." }
            report.putString("stream", "PASS: anuncio y resolución mDNS nativos; finalización por plazo; búsqueda simultánea rechazada; cancelación. Servicio de prueba del propio emulador, no un equipo externo de la LAN.\n")
        } catch (error: Throwable) {
            code = 0
            report.putString("stream", "FAIL: ${error.stackTraceToString()}\n")
        } finally {
            discovery.cancel()
            try { nsd.unregisterService(listener); unregistration.await(5, TimeUnit.SECONDS) } catch (_: Exception) { }
            socket.close()
        }
        finish(code, report)
    }
}
