package com.networkdiagnosticssuite

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.jcraft.jsch.HostKey
import com.jcraft.jsch.HostKeyRepository
import com.jcraft.jsch.UserInfo
import org.json.JSONObject
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// Comandos permitidos por perfil. JavaScript solo elige perfil y comando.
object SshCommands {
    private val commands = mapOf(
        "linux" to mapOf("uptime" to "uptime", "interfaces" to "ip -brief address"),
        "cisco-ios" to mapOf(
            "uptime" to "show version | include uptime",
            "interfaces" to "show ip interface brief",
        ),
        "routeros" to mapOf(
            "uptime" to "/system resource print",
            "interfaces" to "/interface print terse",
        ),
    )

    fun resolve(profile: String, command: String): String? = commands[profile]?.get(command)
}

class SshCredential(val username: String, val password: ByteArray)

// Contraseñas cifradas con AES-GCM; la clave vive en el Android Keystore y no
// puede exportarse. En SharedPreferences queda solo el texto cifrado.
class SshCredentialStore(context: Context) {
    private val prefs = context.getSharedPreferences("ssh_credentials", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(ALIAS, null) as SecretKey?)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    fun save(reference: String, username: String, password: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        // La referencia autentica el cifrado: no sirve copiar el valor a otra entrada.
        cipher.updateAAD(reference.toByteArray())
        val secret = password.toByteArray(Charsets.UTF_8)
        val encrypted = cipher.doFinal(secret)
        secret.fill(0)
        val entry = JSONObject()
            .put("user", username)
            .put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .put("data", Base64.encodeToString(encrypted, Base64.NO_WRAP))
        prefs.edit().putString(reference, entry.toString()).apply()
    }

    fun username(reference: String): String? =
        prefs.getString(reference, null)?.let { JSONObject(it).getString("user") }

    fun load(reference: String): SshCredential? {
        val entry = prefs.getString(reference, null)?.let(::JSONObject) ?: return null
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val iv = Base64.decode(entry.getString("iv"), Base64.NO_WRAP)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        cipher.updateAAD(reference.toByteArray())
        val password = cipher.doFinal(Base64.decode(entry.getString("data"), Base64.NO_WRAP))
        return SshCredential(entry.getString("user"), password)
    }

    fun delete(reference: String) = prefs.edit().remove(reference).apply()

    companion object {
        private const val KEYSTORE = "AndroidKeyStore"
        private const val ALIAS = "tp6-ssh-credentials"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}

// Huellas confirmadas por el técnico, por equipo y puerto. No son secretas.
class SshKnownHosts(context: Context) {
    private val prefs = context.getSharedPreferences("ssh_known_hosts", Context.MODE_PRIVATE)

    fun get(host: String, port: Int): String? = prefs.getString("$host:$port", null)

    fun trust(host: String, port: Int, fingerprint: String) =
        prefs.edit().putString("$host:$port", fingerprint).apply()

    fun forget(host: String, port: Int) = prefs.edit().remove("$host:$port").apply()

    companion object {
        // Mismo formato que OpenSSH: SHA256 del blob de la clave, base64 sin relleno.
        fun fingerprint(key: ByteArray): String {
            val digest = MessageDigest.getInstance("SHA-256").digest(key)
            return "SHA256:" + Base64.encodeToString(digest, Base64.NO_WRAP or Base64.NO_PADDING)
        }
    }
}

// Repositorio de JSch que acepta solo la huella esperada (o ninguna, para leerla).
// JSch lo consulta durante el intercambio de claves, antes de enviar la contraseña.
class PinnedHostKeyRepository(private val expected: String?) : HostKeyRepository {
    var seen: String? = null
        private set

    override fun check(host: String?, key: ByteArray): Int {
        seen = SshKnownHosts.fingerprint(key)
        return when {
            expected == null -> HostKeyRepository.NOT_INCLUDED
            seen == expected -> HostKeyRepository.OK
            else -> HostKeyRepository.CHANGED
        }
    }

    override fun add(hostkey: HostKey?, ui: UserInfo?) {}
    override fun remove(host: String?, type: String?) {}
    override fun remove(host: String?, type: String?, key: ByteArray?) {}
    override fun getKnownHostsRepositoryID() = "tp6-confirmed-hosts"
    override fun getHostKey(): Array<HostKey> = emptyArray()
    override fun getHostKey(host: String?, type: String?): Array<HostKey> = emptyArray()
}
