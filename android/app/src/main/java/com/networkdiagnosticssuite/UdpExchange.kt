package com.networkdiagnosticssuite

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

/** One bounded datagram request. No hostname resolution or protocol interpretation. */
class UdpExchange(
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
) {
    private class Operation(
        val success: (ByteArray) -> Unit,
        val failure: (String, String) -> Unit,
        var socket: DatagramSocket? = null
    )

    private val lock = Any()
    private var active: Operation? = null
    private var closed = false

    fun exchange(
        host: String,
        port: Int,
        payload: ByteArray,
        timeoutMs: Int,
        success: (ByteArray) -> Unit,
        failure: (String, String) -> Unit
    ) {
        val address = ipv4Bytes(host)
        if (address == null || port !in 1..65535 || payload.size !in 1..8192 || timeoutMs !in 100..15000) {
            failure("E_INVALID_ARGUMENT", "Revise la dirección IPv4, el puerto, los datos y el plazo de espera.")
            return
        }
        val operation = Operation(success, failure)
        val rejected = synchronized(lock) {
            when {
                closed -> "E_CLOSED"
                active != null -> "E_BUSY"
                else -> { active = operation; null }
            }
        }
        if (rejected != null) {
            failure(rejected, if (rejected == "E_BUSY") "Ya hay una consulta UDP en curso." else "El transporte UDP está cerrado.")
            return
        }
        val ownedPayload = payload.copyOf()
        try {
            executor.execute { run(operation, address, port, ownedPayload, timeoutMs) }
        } catch (_: RejectedExecutionException) {
            complete(operation, code = "E_NETWORK", message = "No se pudo iniciar la consulta UDP.")
        }
    }

    private fun run(operation: Operation, address: ByteArray, port: Int, payload: ByteArray, timeoutMs: Int) {
        var socket: DatagramSocket? = null
        try {
            if (synchronized(lock) { active !== operation }) return
            socket = DatagramSocket()
            val attached = synchronized(lock) {
                if (active === operation) { operation.socket = socket; true } else false
            }
            if (!attached) return
            socket.connect(InetAddress.getByAddress(address), port)
            socket.soTimeout = timeoutMs
            socket.send(DatagramPacket(payload, payload.size))
            // One extra byte makes an oversized or truncated response distinguishable.
            val response = DatagramPacket(ByteArray(8193), 8193)
            socket.receive(response)
            if (response.length > 8192) {
                complete(operation, code = "E_RESPONSE_TOO_LARGE", message = "La respuesta UDP supera el tamaño permitido.")
            } else {
                complete(operation, data = response.data.copyOfRange(response.offset, response.offset + response.length))
            }
        } catch (_: SocketTimeoutException) {
            complete(operation, code = "E_TIMEOUT", message = "El dispositivo no respondió dentro del plazo de espera.")
        } catch (_: Exception) {
            complete(operation, code = "E_NETWORK", message = "No se pudo completar la comunicación UDP.")
        } finally {
            // Only this operation's socket is closed, even after a new request starts.
            socket?.close()
        }
    }

    private fun complete(operation: Operation, data: ByteArray? = null, code: String = "", message: String = "") {
        val accepted = synchronized(lock) {
            if (active !== operation) false else { active = null; true }
        }
        if (!accepted) return
        operation.socket?.close()
        if (data != null) operation.success(data) else operation.failure(code, message)
    }

    fun cancel() {
        val operation = synchronized(lock) { active.also { active = null } } ?: return
        operation.socket?.close()
        operation.failure("E_CANCELLED", "La consulta UDP fue cancelada.")
    }

    fun close() {
        val operation = synchronized(lock) {
            closed = true
            active.also { active = null }
        }
        try {
            operation?.socket?.close()
            operation?.failure?.invoke("E_CANCELLED", "La consulta UDP fue cancelada.")
        } finally {
            executor.shutdownNow()
        }
    }

    companion object {
        fun ipv4Bytes(host: String): ByteArray? {
            val parts = host.split('.')
            if (parts.size != 4) return null
            val result = ByteArray(4)
            parts.forEachIndexed { index, part ->
                if (part.isEmpty() || part.length > 3 || part.any { it !in '0'..'9' }) return null
                val value = part.toIntOrNull() ?: return null
                if (value !in 0..255) return null
                result[index] = value.toByte()
            }
            return result
        }
    }
}
