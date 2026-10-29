package com.networkdiagnosticssuite

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.net.Inet4Address
import java.util.ArrayDeque

/** Descubrimiento DNS-SD real. No agrega hosts supuestos ni consulta Internet. */
@Suppress("DEPRECATION")
class MdnsDiscovery(context: Context) {
    data class LanInfo(val address: String, val transport: String, val emulator: Boolean)
    data class Service(val address: String, val name: String, val type: String, val port: Int, val hostname: String? = null)
    data class Scan(val network: LanInfo, val services: List<Service>, val warnings: List<String>)

    private val connectivity = context.getSystemService(ConnectivityManager::class.java)
    private val nsd = context.getSystemService(NsdManager::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private var current: Session? = null

    fun networkInfo(): LanInfo {
        // INTERNET validado no es requisito: una LAN puede funcionar sin salida a Internet.
        val networks = connectivity.allNetworks.sortedBy { it != connectivity.activeNetwork }
        for (network in networks) {
            val capabilities = connectivity.getNetworkCapabilities(network) ?: continue
            val transport = when {
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                else -> continue
            }
            val address = connectivity.getLinkProperties(network)?.linkAddresses
                ?.firstOrNull { it.address is Inet4Address && !it.address.isLoopbackAddress }
                ?.address?.hostAddress ?: continue
            val emulator = Build.FINGERPRINT.startsWith("generic") ||
                Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish")
            return LanInfo(address, transport, emulator)
        }
        throw IllegalStateException("No hay una red Wi-Fi o Ethernet con IPv4. Conectá el dispositivo a la LAN.")
    }

    fun start(timeoutMs: Int, success: (Scan) -> Unit, failure: (String, String) -> Unit) {
        handler.post {
            if (current != null) {
                failure("E_BUSY", "Ya hay una búsqueda en curso.")
                return@post
            }
            if (timeoutMs !in 1000..30000) {
                failure("E_TIMEOUT_RANGE", "La búsqueda debe durar entre 1 y 30 segundos.")
                return@post
            }
            val network = try { networkInfo() } catch (error: Exception) {
                failure("E_NO_LAN", error.message ?: "No hay acceso a la LAN.")
                return@post
            }
            val session = Session(network, success, failure)
            current = session
            handler.postDelayed(session.timeout, timeoutMs.toLong())
            SERVICE_TYPES.forEach { type ->
                val listener = object : NsdManager.DiscoveryListener {
                    override fun onDiscoveryStarted(serviceType: String) = Unit
                    override fun onDiscoveryStopped(serviceType: String) = Unit
                    override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
                    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                        handler.post {
                            if (current !== session) return@post
                            session.warnings.add("No se pudo buscar $type (código $errorCode).")
                            session.failedTypes.add(type)
                            if (session.failedTypes.size == SERVICE_TYPES.size) {
                                finish(session, "E_DISCOVERY", "Android no pudo iniciar el descubrimiento mDNS. Revisá la red y los permisos.")
                            }
                        }
                    }
                    override fun onServiceFound(info: NsdServiceInfo) {
                        handler.post {
                            if (current !== session) return@post
                            val key = "${info.serviceName}|${info.serviceType}"
                            if (session.seen.add(key)) {
                                session.pending.add(info)
                                resolveNext(session)
                            }
                        }
                    }
                    override fun onServiceLost(info: NsdServiceInfo) = Unit
                }
                session.listeners.add(listener)
                try { nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, listener) }
                catch (error: Exception) {
                    session.failedTypes.add(type)
                    session.warnings.add("No se pudo buscar $type: ${error.message}")
                }
            }
            if (session.failedTypes.size == SERVICE_TYPES.size) {
                finish(session, "E_DISCOVERY", "No se pudo iniciar mDNS en esta red.")
            }
        }
    }

    // Las versiones antiguas de NSD solo permiten una resolución simultánea.
    private fun resolveNext(session: Session) {
        if (current !== session || session.resolver != null || session.pending.isEmpty()) return
        val info = session.pending.removeFirst()
        val resolver = object : NsdManager.ResolveListener {
            override fun onResolveFailed(service: NsdServiceInfo, errorCode: Int) {
                handler.post {
                    if (current !== session) return@post
                    session.warnings.add("No se pudo resolver ${service.serviceName} (código $errorCode).")
                    session.resolver = null
                    resolveNext(session)
                }
            }
            override fun onServiceResolved(service: NsdServiceInfo) {
                handler.post {
                    if (current !== session) return@post
                    val addresses = if (Build.VERSION.SDK_INT >= 34) service.hostAddresses
                        else listOfNotNull(service.host)
                    // Esta etapa muestra IPv4; IPv6 se documenta como alcance pendiente.
                    val address = addresses.firstOrNull { it is Inet4Address }?.hostAddress
                    if (address != null) {
                        // getHostname no está disponible en Android anteriores a API 36.
                        val hostname = if (Build.VERSION.SDK_INT >= 36)
                            service.hostname?.trim()?.takeIf { it.isNotEmpty() } else null
                        val result = Service(address, service.serviceName, service.serviceType, service.port, hostname)
                        session.services["$address|${service.serviceType}|${service.port}"] = result
                    } else {
                        session.warnings.add("${service.serviceName}: sin dirección IPv4 resuelta.")
                    }
                    session.resolver = null
                    resolveNext(session)
                }
            }
        }
        session.resolver = resolver
        try { nsd.resolveService(info, resolver) } catch (error: Exception) {
            session.resolver = null
            session.warnings.add("No se pudo resolver ${info.serviceName}: ${error.message}")
            resolveNext(session)
        }
    }

    fun cancel() { handler.post { current?.let { finish(it, "E_CANCELLED", "Búsqueda cancelada.") } } }

    private fun finish(session: Session, code: String? = null, message: String = "") {
        if (current !== session) return
        current = null // Ignorar callbacks tardíos antes de liberar los listeners.
        handler.removeCallbacks(session.timeout)
        session.listeners.forEach { listener ->
            try { nsd.stopServiceDiscovery(listener) } catch (_: Exception) { /* Ya detenido. */ }
        }
        if (Build.VERSION.SDK_INT >= 34) {
            session.resolver?.let { try { nsd.stopServiceResolution(it) } catch (_: Exception) { } }
        }
        if (code != null) session.failure(code, message)
        else {
            val network = try { networkInfo() } catch (_: Exception) { null }
            if (network?.address != session.network.address) {
                session.failure("E_NETWORK_CHANGED", "La conexión de red cambió durante la búsqueda. Volvé a intentarlo.")
            } else {
                session.success(Scan(session.network, session.services.values.toList(), session.warnings.distinct()))
            }
        }
    }

    private inner class Session(
        val network: LanInfo,
        val success: (Scan) -> Unit,
        val failure: (String, String) -> Unit
    ) {
        val services = linkedMapOf<String, Service>()
        val warnings = mutableListOf<String>()
        val listeners = mutableListOf<NsdManager.DiscoveryListener>()
        val failedTypes = mutableSetOf<String>()
        val seen = mutableSetOf<String>()
        val pending = ArrayDeque<NsdServiceInfo>()
        var resolver: NsdManager.ResolveListener? = null
        val timeout = Runnable {
            if (pending.isNotEmpty() || resolver != null) warnings.add("Terminó el plazo con servicios aún sin resolver.")
            finish(this)
        }
    }

    companion object {
        val SERVICE_TYPES = listOf("_http._tcp.", "_https._tcp.", "_ssh._tcp.", "_workstation._tcp.", "_ipp._tcp.", "_printer._tcp.", "_smb._tcp.")
    }
}
