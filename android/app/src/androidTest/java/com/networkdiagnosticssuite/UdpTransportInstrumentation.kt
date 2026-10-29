package com.networkdiagnosticssuite

import android.app.Instrumentation
import android.os.Bundle
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketException
import java.net.SocketTimeoutException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** Real UDP on emulator loopback only; this does not validate a physical LAN device. */
class UdpTransportInstrumentation : Instrumentation() {
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }

    override fun onStart() {
        val report = Bundle()
        var resultCode = -1
        try {
            testValidation()
            testEchoAndSizeLimit()
            testTimeoutBusyCancelAndRetry()
            testCancelBeforeWorkerAndClose()
            testRejectedSubmission()
            report.putString("stream", "PASS: UDP loopback real; límites de entrada y respuesta; timeout; E_BUSY; cancelación antes del worker y durante recepción; reintento; cierre y rechazo del ejecutor. Laboratorio del emulador, sin validación de red física.\n")
        } catch (error: Throwable) {
            resultCode = 0
            report.putString("stream", "FAIL: ${error.stackTraceToString()}\n")
        }
        finish(resultCode, report)
    }

    private class Outcome {
        val done = CountDownLatch(1)
        val calls = AtomicInteger()
        var bytes: ByteArray? = null
        var code: String? = null
        fun success(value: ByteArray) { bytes = value; calls.incrementAndGet(); done.countDown() }
        fun failure(value: String, message: String) { code = value; calls.incrementAndGet(); done.countDown() }
        fun await() { check(done.await(5, TimeUnit.SECONDS)) { "La operación UDP no finalizó en plazo." } }
        fun expect(expected: String) { await(); check(code == expected && calls.get() == 1) { "Se esperaba $expected, se recibió $code (${calls.get()} resultados)." } }
    }

    private class EchoServer(private val response: (ByteArray) -> ByteArray = { it }) : AutoCloseable {
        private val socket = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
        val port = socket.localPort
        private val error = AtomicReference<Throwable?>()
        private val worker = Thread({
            try {
                while (!socket.isClosed) {
                    val request = DatagramPacket(ByteArray(8193), 8193)
                    try { socket.receive(request) } catch (_: SocketTimeoutException) { continue }
                    val bytes = response(request.data.copyOfRange(request.offset, request.offset + request.length))
                    socket.send(DatagramPacket(bytes, bytes.size, request.address, request.port))
                }
            } catch (failure: SocketException) {
                if (!socket.isClosed) error.set(failure)
            } catch (failure: Throwable) {
                error.set(failure)
            }
        }, "udp-loopback-fixture")
        init { socket.soTimeout = 1000; worker.isDaemon = true; worker.start() }
        override fun close() {
            socket.close()
            worker.join(3000)
            check(!worker.isAlive) { "El servidor UDP de prueba no se detuvo." }
            error.get()?.let { throw it }
        }
    }

    private fun exchange(engine: UdpExchange, port: Int, payload: ByteArray = byteArrayOf(0, 127, -128, -1), timeout: Int = 1000): Outcome {
        val outcome = Outcome()
        engine.exchange("127.0.0.1", port, payload, timeout, outcome::success, outcome::failure)
        return outcome
    }

    private fun testValidation() {
        val engine = UdpExchange()
        try {
            listOf("localhost", "127.0.0", "127.0.0.256", "127.0.0.-1", "127.0.0. 1", "::1").forEach { host ->
                val outcome = Outcome()
                engine.exchange(host, 1161, byteArrayOf(1), 100, outcome::success, outcome::failure)
                outcome.expect("E_INVALID_ARGUMENT")
            }
            listOf(0, 65536).forEach { port -> exchange(engine, port).expect("E_INVALID_ARGUMENT") }
            listOf(99, 15001).forEach { timeout -> exchange(engine, 1161, timeout = timeout).expect("E_INVALID_ARGUMENT") }
            listOf(0, 8193).forEach { size -> exchange(engine, 1161, ByteArray(size)).expect("E_INVALID_ARGUMENT") }
        } finally { engine.close() }
    }

    private fun testEchoAndSizeLimit() {
        val engine = UdpExchange()
        try {
            EchoServer().use { server ->
                val bytes = byteArrayOf(0, 127, -128, -1)
                val echoed = exchange(engine, server.port, bytes)
                echoed.await()
                check(echoed.code == null && echoed.bytes!!.contentEquals(bytes) && echoed.calls.get() == 1) { "El eco UDP alteró los bytes." }
                val maximum = ByteArray(8192) { (it % 256).toByte() }
                val bounded = exchange(engine, server.port, maximum)
                bounded.await()
                check(bounded.code == null && bounded.bytes!!.contentEquals(maximum)) { "No aceptó 8192 bytes." }
            }
            EchoServer { ByteArray(9000) }.use { server -> exchange(engine, server.port).expect("E_RESPONSE_TOO_LARGE") }
        } finally { engine.close() }
    }

    private fun testTimeoutBusyCancelAndRetry() {
        val engine = UdpExchange()
        val silent = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
        try {
            exchange(engine, silent.localPort, timeout = 150).expect("E_TIMEOUT")
            val cancelled = exchange(engine, silent.localPort, timeout = 3000)
            exchange(engine, silent.localPort).expect("E_BUSY")
            // Receiving this request proves the worker created and sent from its socket.
            silent.soTimeout = 2000
            val packet = DatagramPacket(ByteArray(16), 16)
            silent.receive(packet) // The earlier timeout request may still be queued.
            silent.receive(packet)
            engine.cancel()
            cancelled.expect("E_CANCELLED")
            EchoServer().use { server ->
                val retried = exchange(engine, server.port)
                retried.await()
                check(retried.code == null && retried.bytes!!.contentEquals(byteArrayOf(0, 127, -128, -1))) { "Falló el reintento posterior a cancelar." }
            }
            check(cancelled.calls.get() == 1) { "La consulta cancelada se resolvió más de una vez." }
        } finally { silent.close(); engine.close() }
    }

    private fun testCancelBeforeWorkerAndClose() {
        val executor = Executors.newSingleThreadExecutor()
        val release = CountDownLatch(1)
        val entered = CountDownLatch(1)
        val engine = UdpExchange(executor)
        try {
            executor.execute { entered.countDown(); release.await(5, TimeUnit.SECONDS) }
            check(entered.await(3, TimeUnit.SECONDS)) { "No se pudo preparar el worker bloqueado." }
            val cancelled = exchange(engine, 1161)
            engine.cancel()
            cancelled.expect("E_CANCELLED")
            EchoServer().use { server ->
                val retried = exchange(engine, server.port)
                release.countDown()
                retried.await()
                check(retried.code == null && retried.bytes != null) { "La limpieza anterior eliminó el nuevo intercambio." }
            }
            check(cancelled.calls.get() == 1) { "La cancelación previa al worker se resolvió dos veces." }
            engine.close()
            exchange(engine, 1161).expect("E_CLOSED")
        } finally {
            release.countDown()
            engine.close()
            check(executor.awaitTermination(3, TimeUnit.SECONDS)) { "El ejecutor UDP no se detuvo." }
        }
    }

    private fun testRejectedSubmission() {
        val executor = Executors.newSingleThreadExecutor()
        executor.shutdown()
        val engine = UdpExchange(executor)
        try {
            exchange(engine, 1161).expect("E_NETWORK")
            exchange(engine, 1161).expect("E_NETWORK") // Rejection must release the active slot.
        } finally { engine.close() }
    }
}
