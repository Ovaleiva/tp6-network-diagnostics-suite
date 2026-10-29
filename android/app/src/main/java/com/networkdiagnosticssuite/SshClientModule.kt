package com.networkdiagnosticssuite

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.jcraft.jsch.ChannelExec
import com.jcraft.jsch.JSch
import com.jcraft.jsch.JSchException
import com.jcraft.jsch.Session
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class SshClientModule(context: ReactApplicationContext) : NativeSshClientSpec(context) {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val credentials = SshCredentialStore(context)
    private val knownHosts = SshKnownHosts(context)
    @Volatile private var current: Session? = null
    @Volatile private var cancelled = false

    private class SshFailure(val code: String, message: String) : Exception(message)

    override fun getName() = NAME

    override fun run(
        host: String, port: Double, credentialReference: String, profile: String,
        command: String, timeoutMs: Double, promise: Promise,
    ) {
        val commandLine = SshCommands.resolve(profile, command)
        if (!validTarget(host, port, timeoutMs) || commandLine == null) {
            promise.reject("E_INVALID_ARGUMENT", "Revise la dirección, el puerto, el plazo y el comando.")
            return
        }
        cancelled = false
        executor.execute {
            val deadline = System.currentTimeMillis() + timeoutMs.toLong()
            val expected = knownHosts.get(host, port.toInt())
            val credential = try {
                credentials.load(credentialReference)
            } catch (error: Exception) {
                null
            }
            when {
                expected == null ->
                    promise.reject("E_HOST_KEY_UNKNOWN", "La huella del equipo no fue confirmada.")
                credential == null ->
                    promise.reject("E_NO_CREDENTIAL", "No hay una credencial guardada para este equipo.")
                else -> try {
                    val repository = PinnedHostKeyRepository(expected)
                    val session = open(host, port.toInt(), credential.username, repository, timeoutMs.toInt())
                    session.setPassword(credential.password)
                    try {
                        connect(session, repository, expected, timeoutMs.toInt())
                    } finally {
                        credential.password.fill(0)
                    }
                    val result = execute(session, commandLine, deadline)
                    result.putString("hostKeyFingerprint", repository.seen)
                    promise.resolve(result)
                } catch (failure: SshFailure) {
                    promise.reject(failure.code, failure.message)
                } catch (error: Exception) {
                    // Interrupción al cerrar la app u otro error inesperado: la promesa no queda colgada.
                    promise.reject(if (cancelled) "E_CANCELLED" else "E_SSH", "La conexión SSH falló.")
                } finally {
                    credential.password.fill(0)
                    current?.disconnect()
                    current = null
                }
            }
        }
    }

    override fun scanHostKey(host: String, port: Double, timeoutMs: Double, promise: Promise) {
        if (!validTarget(host, port, timeoutMs)) {
            promise.reject("E_INVALID_ARGUMENT", "Revise la dirección, el puerto y el plazo.")
            return
        }
        cancelled = false
        executor.execute {
            // Sin huella esperada JSch corta tras recibir la clave: no hay autenticación.
            val repository = PinnedHostKeyRepository(null)
            try {
                val session = open(host, port.toInt(), "tp6-scan", repository, timeoutMs.toInt())
                session.connect(timeoutMs.toInt())
                promise.reject("E_SSH", "El equipo aceptó la conexión sin verificar su clave.")
            } catch (error: JSchException) {
                val seen = repository.seen
                if (seen != null) promise.resolve(seen)
                else classify(error, repository, null).let { promise.reject(it.code, it.message) }
            } finally {
                current?.disconnect()
                current = null
            }
        }
    }

    override fun cancel() {
        cancelled = true
        current?.disconnect()
    }

    override fun trustHostKey(host: String, port: Double, fingerprint: String, promise: Promise) {
        if (!validTarget(host, port, 1000.0) || !FINGERPRINT.matches(fingerprint)) {
            promise.reject("E_INVALID_ARGUMENT", "Huella SSH inválida.")
            return
        }
        knownHosts.trust(host, port.toInt(), fingerprint)
        promise.resolve(null)
    }

    override fun forgetHostKey(host: String, port: Double, promise: Promise) {
        knownHosts.forget(host, port.toInt())
        promise.resolve(null)
    }

    override fun saveCredential(reference: String, username: String, password: String, promise: Promise) {
        if (!REFERENCE.matches(reference) || !USERNAME.matches(username) || password.isEmpty() || password.length > 256) {
            promise.reject("E_INVALID_ARGUMENT", "Revise el usuario y la contraseña.")
            return
        }
        try {
            credentials.save(reference, username, password)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("E_KEYSTORE", "No se pudo guardar la credencial en el Keystore.")
        }
    }

    override fun credentialUser(reference: String, promise: Promise) {
        promise.resolve(if (REFERENCE.matches(reference)) credentials.username(reference) else null)
    }

    override fun deleteCredential(reference: String, promise: Promise) {
        if (REFERENCE.matches(reference)) credentials.delete(reference)
        promise.resolve(null)
    }

    override fun invalidate() {
        cancel()
        executor.shutdownNow()
        super.invalidate()
    }

    private fun open(host: String, port: Int, username: String, repository: PinnedHostKeyRepository, timeoutMs: Int): Session {
        val jsch = JSch()
        jsch.hostKeyRepository = repository
        return jsch.getSession(username, host, port).apply {
            setConfig("StrictHostKeyChecking", "yes")
            setConfig("PreferredAuthentications", "password")
            timeout = timeoutMs
            current = this
        }
    }

    private fun connect(session: Session, repository: PinnedHostKeyRepository, expected: String, timeoutMs: Int) {
        try {
            session.connect(timeoutMs)
        } catch (error: JSchException) {
            throw classify(error, repository, expected)
        }
    }

    private fun classify(error: JSchException, repository: PinnedHostKeyRepository, expected: String?): SshFailure {
        val message = error.message.orEmpty()
        val cause = error.cause
        return when {
            cancelled -> SshFailure("E_CANCELLED", "La conexión SSH fue cancelada.")
            expected != null && repository.seen != null && repository.seen != expected ->
                SshFailure("E_HOST_KEY_CHANGED", "La huella del equipo cambió.")
            message.contains("Auth fail") || message.contains("Auth cancel") ||
                message.contains("Too many authentication failures") ->
                SshFailure("E_AUTH", "Usuario o contraseña incorrectos.")
            cause is SocketTimeoutException || message.contains("timeout", ignoreCase = true) ->
                SshFailure("E_TIMEOUT", "El equipo no respondió dentro del plazo de espera.")
            cause is ConnectException || cause is NoRouteToHostException ->
                SshFailure("E_UNREACHABLE", "No se pudo conectar con el equipo.")
            else -> SshFailure("E_SSH", "Error SSH: $message")
        }
    }

    private fun execute(session: Session, commandLine: String, deadline: Long) = try {
        val channel = session.openChannel("exec") as ChannelExec
        channel.setCommand(commandLine)
        channel.setInputStream(null)
        val stdout = channel.inputStream
        val stderr = channel.errStream
        channel.connect(remaining(deadline))
        val out = ByteArrayOutputStream()
        val err = ByteArrayOutputStream()
        var truncated = false
        while (true) {
            drain(stdout, out)
            drain(stderr, err)
            if (channel.isClosed && stdout.available() == 0 && stderr.available() == 0) break
            if (out.size() + err.size() > MAX_OUTPUT) {
                truncated = true
                break
            }
            if (cancelled) throw SshFailure("E_CANCELLED", "La conexión SSH fue cancelada.")
            if (System.currentTimeMillis() > deadline) {
                throw SshFailure("E_TIMEOUT", "El comando no terminó dentro del plazo de espera.")
            }
            Thread.sleep(25)
        }
        val exitStatus = if (truncated) -1 else channel.exitStatus
        channel.disconnect()
        Arguments.createMap().apply {
            putString("commandLine", commandLine)
            putInt("exitStatus", exitStatus)
            putString("stdout", out.toString(Charsets.UTF_8.name()))
            putString("stderr", err.toString(Charsets.UTF_8.name()))
            putBoolean("truncated", truncated)
        }
    } catch (error: JSchException) {
        throw SshFailure(if (cancelled) "E_CANCELLED" else "E_SSH", "No se pudo ejecutar el comando: ${error.message}")
    }

    private fun drain(input: InputStream, output: ByteArrayOutputStream) {
        val buffer = ByteArray(4096)
        while (input.available() > 0) {
            val read = input.read(buffer, 0, minOf(buffer.size, input.available()))
            if (read < 0) return
            output.write(buffer, 0, read)
        }
    }

    private fun remaining(deadline: Long) =
        (deadline - System.currentTimeMillis()).coerceIn(1, Int.MAX_VALUE.toLong()).toInt()

    private fun validTarget(host: String, port: Double, timeoutMs: Double) =
        UdpExchange.ipv4Bytes(host) != null && integerInRange(port, 1, 65535) &&
            integerInRange(timeoutMs, 1000, 30000)

    private fun integerInRange(value: Double, min: Int, max: Int) =
        value.isFinite() && value >= min && value <= max && value == value.toInt().toDouble()

    companion object {
        const val NAME = "NativeSshClient"
        private const val MAX_OUTPUT = 64 * 1024
        private val REFERENCE = Regex("^ssh:[0-9.]{7,15}:[0-9]{1,5}$")
        private val USERNAME = Regex("^[A-Za-z0-9._@-]{1,64}$")
        private val FINGERPRINT = Regex("^SHA256:[A-Za-z0-9+/]{43}$")
    }
}
