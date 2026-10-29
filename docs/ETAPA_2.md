# Etapa 2: primera función de red

La etapa 1 solo preparaba pantallas y contratos. No era la suite terminada.
Ahora Equipos en la red ejecuta una búsqueda mDNS real con el servicio NSD de
Android. RF01 sigue parcial. RF02–RF08 aún son pantallas pendientes.

## Qué probar en la app

1. Mantener Metro abierto con `npm.cmd start`.
2. Al incorporar el código Kotlin es necesario reinstalar el APK una vez:
   `npm.cmd run android -- --active-arch-only --no-packager`.
3. Abrir Equipos en la red. Se muestra la IP local y, si corresponde, el aviso
   sobre la red virtual del emulador.
4. Pulsar Buscar equipos. Debe indicar búsqueda durante 12 segundos, permitir
   cancelar y volver a habilitar el botón al terminar.
5. Si aparecen equipos, abrir uno para ver su IP y los servicios anunciados.
   Si no aparecen, se explica que mDNS no descubre todos los hosts.

Los comandos se ejecutan en la raíz network-diagnostics-suite. Las pruebas visuales
se hacen en el teléfono virtual, sin volver a compilar para cada cambio TypeScript.

## Por qué mDNS

Un dispositivo puede anunciar servicios como HTTP, SSH o impresión por DNS-SD/mDNS.
Android ofrece NsdManager para buscarlos y resolver su dirección y puerto.
Usamos esa API mediante un TurboModule propio y Codegen, compatibles con la nueva
arquitectura que ya utiliza el proyecto. No se agregó otra dependencia de terceros.

Se buscan `_http._tcp.`, `_https._tcp.`, `_ssh._tcp.`, `_workstation._tcp.`,
`_ipp._tcp.`, `_printer._tcp.` y `_smb._tcp.`. Es una lista explícita y acotada;
no se exploran todos los tipos existentes ni se ejecutan comandos SSH al encontrar
un anuncio. Tampoco se envían consultas SNMP.

## El código, por bloques

- `src/specs/NativeNetworkDiscovery.ts` declara los métodos y la respuesta entre
  TypeScript y Kotlin. Codegen genera la clase base para evitar interfaces incompatibles.
- `MdnsDiscovery.kt` obtiene una red Wi-Fi o Ethernet con IPv4 y crea una sesión
  NSD. Una LAN sin salida a Internet sigue siendo válida. Los listeners reciben
  anuncios y se resuelven de a uno, para soportar Android anteriores.
- Cada sesión tiene un plazo. Al terminar, cancelar, salir de la pantalla o poner
  la app en segundo plano, se liberan los listeners y se ignoran callbacks tardíos.
  Si cambia la dirección de red, se pide reintentar; no se presenta el escaneo
  anterior como si correspondiera a la red actual.
- `NetworkDiscoveryModule.kt` convierte esos resultados al formato del TurboModule.
  `NetworkDiscoveryPackage.kt` y MainApplication lo registran en React Native.
- `android/app/src/main/jni/CMakeLists.txt` normaliza PROJECT_BUILD_DIR en Windows
  e incluye la configuración oficial de React Native. Sin ese ajuste, en esta PC
  se compilaba Kotlin pero el proveedor generado no quedaba enlazado y la pantalla
  informaba que faltaba el módulo. No se modificó código de node_modules.
- `src/infrastructure/discovery/androidDiscovery.ts` agrupa por IP. Dos servicios
  del mismo equipo se muestran juntos. Un nombre de servicio no se presenta como
  hostname. Desde esta mejora conserva el hostname resuelto por NSD cuando está
  disponible; si llega con un segundo servicio de la misma IP, completa ese dato.
  No se genera una MAC supuesta.
- `DevicesScreen.tsx` maneja los estados inicial, búsqueda, cancelación, error,
  resultado vacío y resultados disponibles. DeviceDetailsScreen muestra el equipo.
  Las pantallas restantes siguen marcadas como pendientes.

Permisos: INTERNET y ACCESS_NETWORK_STATE. El proyecto apunta a SDK 36. Si se
actualiza targetSdk a 37, habrá que declarar y solicitar ACCESS_LOCAL_NETWORK
antes de iniciar búsquedas; no basta con aumentar el número del SDK.

### Hostname resuelto

Desde Android 16 (API 36) se usa `NsdServiceInfo.getHostname()` después de resolver
el servicio. Android devuelve el host sin el sufijo `.local.`. En versiones
anteriores se conserva el estado no disponible, sin invocar esa API ni sustituir
el hostname por el nombre del servicio. El detalle del equipo ya muestra el campo.

Para comprobarlo, abrir un resultado y revisar Hostname. Un servicio podría llamarse
"Impresora de oficina" y estar en el host "printer-01": son datos diferentes.
La prueba nativa exige un hostname no vacío en API 36+, y las pruebas de JavaScript
comprueban que se conserva al agrupar servicios. Esto no añade una MAC ni completa RF01.

[Referencia de getHostname](https://developer.android.com/reference/android/net/nsd/NsdServiceInfo#getHostname()).

## Pruebas automatizadas

`npm.cmd test -- --runInBand` comprueba navegación y el comportamiento de pantalla
ante resultados, duplicados, búsqueda vacía, error, reintento y cancelación.
Estas pruebas sustituyen el módulo nativo: por sí solas no demuestran tráfico mDNS.

Para probar el motor nativo existe DiscoveryInstrumentation en androidTest.
Abre un socket local, registra un servicio HTTP mediante NSD, ejecuta el motor real,
verifica su nombre y puerto resueltos y comprueba plazo, exclusión de búsquedas
simultáneas y cancelación. Retira el anuncio y cierra el socket al terminar.
El anuncio existe únicamente en la prueba; no se incluye como resultado de la app
normal ni se presenta como equipo externo real.

Con JDK/SDK configurados, desde android:

```powershell
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest -PreactNativeArchitectures=x86_64 --max-workers=2
```

Desde la raíz, con emulator-5554 conectado:

```powershell
& 'C:/Android/Sdk/platform-tools/adb.exe' -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
& 'C:/Android/Sdk/platform-tools/adb.exe' -s emulator-5554 install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
& 'C:/Android/Sdk/platform-tools/adb.exe' -s emulator-5554 shell am instrument -w -r com.networkdiagnosticssuite.test/com.networkdiagnosticssuite.DiscoveryInstrumentation
```

Esperar `stream=PASS` e `INSTRUMENTATION_CODE: -1`. Un resultado FAIL no es una
prueba aprobada aunque adb haya terminado sin error de proceso.

## Qué falta para cerrar RF01

La prueba de aceptación necesita un Android con acceso a la LAN y un equipo externo
que anuncie alguno de los tipos buscados. El emulador usa una red virtual y puede
no recibir los anuncios de la LAN del host. No sirve una lista inventada para
reemplazar esa evidencia. La prueba nativa controlada valida otra cosa.

La consigna pide MAC. NSD no garantiza ese dato; falta validar un método viable
en Android real y resolver/documentar la limitación con la cátedra si corresponde.
También quedan fuera de esta integración hosts que no anuncian servicios, IPv6,
persistencia, selección de sitios, historial, consultas de protocolos y sincronización.
Una búsqueda vacía no equivale a una red sin dispositivos.

Referencias: [NSD de Android](https://developer.android.com/develop/connectivity/wifi/use-nsd),
[TurboModules](https://reactnative.dev/docs/turbo-native-modules-android),
[permisos de red local](https://developer.android.com/privacy-and-security/local-network-permission).
