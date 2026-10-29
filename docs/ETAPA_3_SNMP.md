# Ejecutar las pruebas nativas UDP

Gradle genera el registro de instrumentación del APK de pruebas a partir de
`testInstrumentationRunner`. Compilar una clase Kotlin no basta para que Android
pueda ejecutarla. La propiedad `tp6TestSuite` selecciona el runner de ese APK:

| Valor | Runner |
| --- | --- |
| `discovery` (predeterminado) | `DiscoveryInstrumentation`, pruebas de mDNS |
| `udp` | `UdpTransportInstrumentation`, transporte UDP |

Un valor distinto detiene Gradle con `Invalid tp6TestSuite`. Cada APK de pruebas
registra el runner seleccionado; para cambiar de batería hay que recompilar e
instalar ese APK de pruebas. El APK de la aplicación no cambia por esta selección.

Con la app ya instalada y el emulador encendido, ejecutar desde la raíz del
proyecto en esta PC:

```powershell
$env:JAVA_HOME = 'C:/Program Files/Microsoft/jdk-17.0.21.21-hotspot'
$env:ANDROID_HOME = 'C:/Android/Sdk'
Set-Location android
.\gradlew.bat :app:assembleDebugAndroidTest -Ptp6TestSuite=udp -PreactNativeArchitectures=x86_64 --max-workers=1 '-Dorg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=512m'
.\gradlew.bat --stop
& "$env:ANDROID_HOME/platform-tools/adb.exe" -s emulator-5554 install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
& "$env:ANDROID_HOME/platform-tools/adb.exe" -s emulator-5554 shell am instrument -w -r com.networkdiagnosticssuite.test/com.networkdiagnosticssuite.UdpTransportInstrumentation
Set-Location ..
```

El resultado esperado incluye `PASS` y `INSTRUMENTATION_CODE: -1`. La salida de
ADB por sí sola no acredita que todas las comprobaciones internas aprobaron.
Para volver a descubrimiento, compilar sin `-Ptp6TestSuite=udp` o usar
`-Ptp6TestSuite=discovery` y volver a instalar el APK de pruebas.

La instrumentación usa sockets en el loopback del emulador. No depende del
agente de PC ni demuestra conectividad con un router físico. Véase la
[configuración oficial del manifiesto de pruebas](https://developer.android.com/build/gradle-tips).
