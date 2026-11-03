package com.networkdiagnosticssuite

import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.channels.ClosedSelectorException
import java.nio.channels.SelectionKey
import java.nio.channels.Selector
import java.nio.channels.SocketChannel
import java.util.Collections
import java.util.concurrent.Executors

// Sonda TCP para el barrido de rango (RF-01). Abre conexiones a unos pocos
// puertos de una IP privada, anota cuáles aceptaron y las cierra sin enviar
// datos. Un puerto rechazado no cuenta: en el emulador la red virtual responde
// por la PC y un rechazo no prueba que el equipo exista.
class TcpProbe {
    private val executor = Executors.newFixedThreadPool(MAX_PARALLEL)
    private val active = Collections.synchronizedSet(mutableSetOf<Selector>())
    @Volatile private var generation = 0

    fun probe(
        host: String,
        ports: IntArray,
        timeoutMs: Int,
        onResult: (IntArray) -> Unit,
        onError: (String, String) -> Unit,
    ) {
        val started = generation
        executor.execute {
            val open = mutableListOf<Int>()
            val channels = mutableListOf<SocketChannel>()
            var selector: Selector? = null
            try {
                selector = Selector.open()
                active.add(selector)
                if (started != generation) selector.close()
                // El módulo ya validó que host es una IPv4 privada.
                val address = InetAddress.getByAddress(UdpExchange.ipv4Bytes(host)!!)
                for (port in ports) {
                    val channel = SocketChannel.open()
                    channels.add(channel)
                    channel.configureBlocking(false)
                    try {
                        if (channel.connect(InetSocketAddress(address, port))) {
                            open.add(port)
                        } else {
                            channel.register(selector, SelectionKey.OP_CONNECT, port)
                        }
                    } catch (_: IOException) {
                        // Sin ruta o rechazo inmediato: el puerto no cuenta.
                    }
                }
                val deadline = System.nanoTime() + timeoutMs * 1_000_000L
                var pending = selector.keys().size
                while (pending > 0) {
                    val remaining = (deadline - System.nanoTime()) / 1_000_000L
                    if (remaining <= 0) break
                    selector.select(remaining)
                    val keys = selector.selectedKeys().iterator()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        keys.remove()
                        try {
                            if ((key.channel() as SocketChannel).finishConnect()) open.add(key.attachment() as Int)
                        } catch (_: IOException) {
                            // Rechazado o inalcanzable.
                        }
                        key.cancel()
                        pending--
                    }
                }
            } catch (_: ClosedSelectorException) {
                // cancel() cerró el selector.
            } catch (error: IOException) {
                if (started == generation) {
                    onError("E_PROBE", error.message ?: "No se pudo abrir la conexión TCP.")
                    return@execute
                }
            } finally {
                channels.forEach { runCatching { it.close() } }
                selector?.let {
                    active.remove(it)
                    runCatching { it.close() }
                }
            }
            if (started != generation) {
                onError("E_CANCELLED", "Barrido cancelado.")
            } else {
                onResult(open.sorted().toIntArray())
            }
        }
    }

    fun cancel() {
        generation++
        val selectors = synchronized(active) { active.toList() }
        selectors.forEach { runCatching { it.close() } }
    }

    fun close() {
        cancel()
        executor.shutdownNow()
    }

    companion object {
        // Hosts sondeados a la vez; cada uno abre como máximo MAX_PORTS conexiones.
        const val MAX_PARALLEL = 32
        const val MAX_PORTS = 8

        // RFC 1918: el barrido no sale de la red local.
        fun isPrivate(bytes: ByteArray): Boolean {
            val first = bytes[0].toInt() and 0xff
            val second = bytes[1].toInt() and 0xff
            return first == 10 || (first == 172 && second in 16..31) || (first == 192 && second == 168)
        }
    }
}
