package com.networkdiagnosticssuite

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.io.File

// Subclase propia para no chocar con los FileProvider que declaren las bibliotecas.
class ReportFileProvider : FileProvider()

class PdfViewerModule(context: ReactApplicationContext) : NativePdfViewerSpec(context) {
    override fun getName() = NAME

    override fun open(path: String, promise: Promise) {
        val context = reactApplicationContext
        // Solo se comparten PDF de files/reports, la carpeta declarada en report_paths.xml.
        val reports = File(context.filesDir, "reports").canonicalFile
        val file = File(path).canonicalFile
        if (file.parentFile != reports || !file.isFile || file.extension != "pdf") {
            promise.reject("E_NOT_FOUND", "No se encontró el PDF en el dispositivo.")
            return
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.reports", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/pdf")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
            promise.resolve(null)
        } catch (error: ActivityNotFoundException) {
            promise.reject("E_NO_VIEWER", "No hay una app instalada para abrir PDF.")
        }
    }

    companion object { const val NAME = "NativePdfViewer" }
}
