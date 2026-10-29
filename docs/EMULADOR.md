# Ejecutar el TP6 en el emulador Android

## Entorno instalado en esta PC

- Microsoft OpenJDK 17.0.21 y compilador javac.
- Android Studio 2026.2.1.8.
- SDK en C:/Android/Sdk.
- SDK Platform 37.0 (compileSdk 37), Build Tools 37.0.0 y 36.0.0.
- NDK 27.1.12297006, CMake 3.22.1, Platform Tools y Android Emulator.
- AVD TP6_Pixel_API36: Pixel 7, Android 16 / API 36, x86_64.
- AVD con 2048 MB de RAM, 2 núcleos y renderizado por software.
- Aceleración WHPX comprobada: disponible y utilizable.

## Preparar la terminal de Antigravity

Los comandos Android del proyecto preparan el entorno antes de ejecutar las herramientas:

- npm.cmd run android valida JDK 17 y el SDK y pasa las opciones a React Native.
- npm.cmd run doctor:android usa el mismo entorno resuelto.
- npm.cmd run android:env muestra Java, ADB y los emuladores disponibles.

En Windows, scripts/android.cjs consulta las instalaciones registradas para el usuario
y la máquina. Valida Java y javac 17, agrega las rutas del SDK al PATH del proceso hijo
y fija ANDROID_USER_HOME / ANDROID_AVD_HOME para encontrar el emulador.
Esto permite ejecutar esos comandos desde una terminal que conserva Java 8 o rutas antiguas.

Para comprobarlo:

```powershell
npm.cmd run android:env
npm.cmd run doctor:android
```

La salida debe mostrar JDK 17, C:/Android/Sdk y TP6_Pixel_API36.

Para usar java, adb o emulator directamente desde una terminal PowerShell que ya
estaba abierta antes de instalar las herramientas, actualizar sus variables:

```powershell
$env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Machine')
$env:ANDROID_HOME = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User')
$env:Path = "$env:JAVA_HOME/bin;$env:ANDROID_HOME/platform-tools;$env:ANDROID_HOME/emulator;$env:Path"
```

El lanzador modifica el entorno de sus procesos hijos. Las variables persistentes
de Windows conservan la configuración realizada durante la instalación.

## Arrancar el emulador

En Android Studio, comprobar que Android SDK Location sea C:/Android/Sdk.
Abrir Device Manager y pulsar Play junto a TP6_Pixel_API36.

También se puede iniciar desde PowerShell:

```powershell
& "$env:ANDROID_HOME/emulator/emulator.exe" -avd TP6_Pixel_API36 -gpu swiftshader -feature -Vulkan -no-snapshot-load -scale 0.25
```

Ese comando permanece abierto mientras se ejecuta el emulador. Usar otras terminales
para Metro y la compilación. Si el emulador ya está abierto, continuar con el siguiente paso.

## Ejecutar la aplicación

Todas las terminales deben estar en la carpeta network-diagnostics-suite.

Terminal 1: iniciar Metro y mantenerlo abierto:

```powershell
npm.cmd start
```

Si Metro de este proyecto ya está activo, mantener esa instancia.

Terminal 2: comprobar el entorno y compilar/instalar:

```powershell
npm.cmd run doctor:android
npm.cmd run android -- --active-arch-only --no-packager
```

--active-arch-only compila para la arquitectura del emulador conectado; reduce el
trabajo nativo necesario. --no-packager usa Metro de la primera terminal.
La primera compilación descarga dependencias y tarda más que las siguientes.

Si se necesita restablecer la comunicación con Metro:

```powershell
adb -s emulator-5554 reverse tcp:8081 tcp:8081
```

Confirmar primero el identificador con adb devices si hay más de un emulador.

## Qué comprobar en esta etapa

- Inicio muestra Herramientas de campo.
- Se abren Equipos, Diagnóstico, Identificación, Instalación, Reportes,
  Sincronización e Historial.
- Atrás de Android vuelve a Inicio.
- El contenido permite desplazarse cuando no entra en pantalla.
- Instalación pide permisos de ubicación y cámara, toma fotos, obtiene el GPS
  simulado y guarda la instalación con su acción pendiente en la cola.
- Diagnóstico guarda cada consulta SNMP exitosa; Equipos guarda los equipos
  encontrados.
- Las pantallas pendientes (Identificación, Reportes, Sincronización e
  Historial) lo indican claramente.

Para simular la ubicación del emulador:

```powershell
adb -s emulator-5554 emu geo fix -64.1888 -31.4201
```

El orden es longitud y luego latitud.

## Ajuste de rutas para Windows

La primera compilación encontró rutas de archivos C++ mayores a 260 caracteres.
android/app/build.gradle configura un buildStagingDirectory corto bajo
la caché del usuario (.cache/tp6-cxx), con un identificador para este checkout.
Así Ninja puede generar sus archivos objeto dentro de los límites de Windows.

Ese ajuste solo cubre el módulo app. Las librerías con C++ propio, como
react-native-nitro-image, compilan dentro de node_modules. Con el proyecto en
una carpeta profunda la compilación falla con:

```text
ninja: error: manifest 'build.ninja' still dirty after 100 tries
```

El Ninja 1.10.2 del SDK no admite rutas largas aunque Windows tenga
LongPathsEnabled activo. Por eso el proyecto se trabaja en una ruta corta,
C:/dev/tp6.

Si `npm.cmd run android` responde que `"gradlew.bat" no se reconoce`, la terminal
tiene definida la variable NoDefaultCurrentDirectoryInExePath. Quitarla antes de
compilar:

```powershell
Remove-Item Env:NoDefaultCurrentDirectoryInExePath
```

El diagnóstico también reconoce la carpeta platforms/android-37.0 que publica Google.

## APK generado

Ruta: android/app/build/outputs/apk/debug/app-debug.apk.

Es una build debug x86_64 para el emulador y necesita Metro para cargar JavaScript.
El APK autónomo de entrega y la validación en una LAN real corresponden a etapas posteriores.

## Si la carga queda detenida en Downloading

Comprobar la conexión sin recompilar la aplicación:

```powershell
& 'C:/Android/Sdk/platform-tools/adb.exe' devices -l
```

El estado esperado es device. Si aparece offline, reconectar y restablecer el
puente con Metro:

```powershell
& 'C:/Android/Sdk/platform-tools/adb.exe' reconnect offline
& 'C:/Android/Sdk/platform-tools/adb.exe' -s emulator-5554 reverse tcp:8081 tcp:8081
& 'C:/Android/Sdk/platform-tools/adb.exe' -s emulator-5554 shell am force-stop com.networkdiagnosticssuite
& 'C:/Android/Sdk/platform-tools/adb.exe' -s emulator-5554 shell am start -n com.networkdiagnosticssuite/.MainActivity
```

Metro debe seguir abierto. Los comandos usan emulator-5554; si devices muestra
otro identificador, sustituirlo. metro.config.js limita maxWorkers a 2 para reducir
el consumo al ejecutar Metro y el emulador juntos. El cambio requiere reiniciar
Metro si estaba abierto antes de modificar la configuración.
## Resolución usada en el laboratorio SNMP

El 28/10/2026 se redujo la resolución del emulador existente a 540×1200 y su
densidad a 210 para limitar el trabajo gráfico. No se creó otro dispositivo.
Para repetir ese ajuste desde PowerShell:

```powershell
& 'C:/Android/Sdk/platform-tools/adb.exe' -s emulator-5554 shell wm size 540x1200
& 'C:/Android/Sdk/platform-tools/adb.exe' -s emulator-5554 shell wm density 210
```

Para volver a los valores originales, usar `wm size reset` y `wm density reset`
en esos mismos comandos. Cerrar el emulador mientras se compila y detener el
daemon Gradle al terminar evita ejecutar ambas cargas al mismo tiempo.
