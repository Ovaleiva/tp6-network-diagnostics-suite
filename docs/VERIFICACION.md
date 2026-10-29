# Verificación de la etapa 1

Fecha: 26/10/2026. Este registro separa pruebas JavaScript de ejecución nativa.

## Comprobaciones iniciales

- Consigna recuperada e inspeccionada: ocho páginas, incluidos los tres diagramas.
- Imports relativos del código: todos resuelven a archivos existentes.
- AndroidManifest.xml: XML válido.
- Sintaxis de los scripts Node: válida.
- Repositorio Git local iniciado en codex/tp6-stage-1.

## Entorno nativo

El diagnóstico inicial detectó Java 8 y ausencia del SDK. Después se instalaron
JDK 17, Android Studio y el SDK en C:/Android/Sdk. El diagnóstico actual pasa con
el emulador emulator-5554 conectado.

La compilación nativa finalizó con BUILD SUCCESSFUL y generó app-debug.apk.
El APK debug x86_64 se instaló correctamente en TP6_Pixel_API36 (Android API 36).
La Activity MainActivity abrió con Status: ok y cargó el JavaScript desde Metro.

La primera compilación encontró un límite de 260 caracteres en Ninja. Se corrigió
el directorio temporal CMake en android/app/build.gradle y se repitió la compilación
con el SDK definitivo. No se modificó código de las dependencias.

Prueba nativa: se abrieron las siete pantallas desde Inicio, se verificó el mensaje
de cada módulo y se volvió con Atrás de Android en todos los casos. El desplazamiento
de Inicio permitió acceder a los módulos inferiores. Al terminar se dejó Inicio abierto.

Durante el primer arranque de Android apareció un aviso de System UI sin respuesta
mientras se preparaba el entorno; se esperó su recuperación. Después completó
la prueba de navegación sin repetir ese aviso. El emulador usa renderizado por software.

Evidencia: [Inicio](evidencia/inicio-android.png) y
[Diagnóstico](evidencia/diagnostico-android.png). Procedimiento reproducible:
[Ejecutar en el emulador](EMULADOR.md).

La instalación de Windows Hypervisor Platform informó reinicio pendiente (3010).
WHPX se comprobó utilizable y el emulador arrancó en esta sesión. Conviene completar
el reinicio de Windows después de guardar el trabajo.

## Comprobaciones de código

- Instalación completada con pnpm 11.25.0, lock importado y nodeLinker hoisted.
- TypeScript: npm run typecheck, correcto.
- ESLint: npm run lint, correcto tras declarar entornos Jest y Node.
- Formato: npm run format:check, correcto.
- Jest: 9 pruebas aprobadas (Inicio, siete destinos con regreso y parámetro deviceId).
- Metro: npm run bundle:android, bundle Android generado con 19 archivos de assets.
  El bundle es un artefacto JavaScript, no un APK.

El primer intento de npm falló con EPERM al crear directorios. Los reintentos con
npm no resolvieron el problema; se adoptó pnpm con lockfile y almacenamiento local
dentro del proyecto. Los primeros intentos de pruebas encontraron un error de caché
y necesitaron sustituir SafeAreaView nativo por View en Jest. Se corrigió la
configuración, manteniendo el navegador real en las pruebas.

Se excluyeron cachés y artefactos de Jest, Metro, ESLint y Git. El trabajo no
modificó dependencias de terceros para forzar resultados favorables.

## Prueba manual al completar el entorno

1. Instalar dependencias siguiendo README.md.
2. Ejecutar Metro con npm start y la app con npm run android.
3. Inicio debe mostrar siete tarjetas, cada una con su requisito.
4. Abrir cada tarjeta: debe mostrar el título correcto y avisar que falta implementar
   la función. Volver con botón del encabezado y Atrás de Android.
5. Girar el teléfono o recrear la Activity y comprobar que no se cierre la app.
6. Probar texto grande y desplazamiento; no debe quedar contenido inaccesible.
7. Sin Internet, recorrer las pantallas debe seguir funcionando.
   Esto solo valida navegación: **no demuestra persistencia ni cumplimiento de RF07**.

## Evidencia que todavía falta

Descubrimiento LAN real, SNMP, SSH, permisos de cámara/GPS, base local, lector,
PDF, outbox persistente, backend stub ejecutable, recuperación de sincronización,
APK autónomo y video demo. El APK debug del emulador no reemplaza la entrega autónoma.

## Corrección de terminal con entorno antiguo

Los comandos android y doctor:android usan scripts/android.cjs para preparar el
entorno en Windows. El lanzador consulta las instalaciones registradas, valida
java y javac 17, resuelve el SDK y prepara PATH y la carpeta de AVD para el proceso hijo.

Se reprodujo una terminal con Java 8, JAVA_HOME apuntando al JRE 8 y sin rutas del
SDK en PATH. Desde ese entorno:

- android:env encontró JDK 17, ADB 37.0.1 y TP6_Pixel_API36.
- npm.cmd run android -- --active-arch-only --no-packager terminó con
  BUILD SUCCESSFUL en 35 s, instaló el APK en el emulador y abrió MainActivity.
- doctor:android pasó con emulator-5554 conectado.

La comprobación de dispositivo se ejecutó fuera del aislamiento de herramientas,
que impedía comunicarse con el servidor ADB. El proceso normal del IDE no necesita
permisos de administrador para este lanzador, que solo lee la configuración de Windows.

## Recuperación de la carga detenida en 33,1 %

El 26/10/2026 Metro respondía a /status pero ADB mostraba emulator-5554 offline.
Tras reconnect offline, el estado pasó a device; se restableció reverse de 8081
y se reabrió MainActivity. La captura y el árbol de accesibilidad confirmaron
la pantalla Herramientas de campo. Evidencia local: tmp/android-run/current.png
y current-ui.xml (archivos de diagnóstico ignorados por Git).

Se agregó maxWorkers: 2 a metro.config.js. loadConfig de Metro confirmó el valor 2.
El servidor existente cargó la app tras recuperar la conexión; la reducción de
procesos se aplicará al próximo inicio de Metro. No se atribuye esta recuperación
al ajuste de procesos ni se midió una mejora de rendimiento.

## Etapa 2: descubrimiento mDNS nativo

Comprobaciones del 26/10/2026, sobre el emulador Android API 36:

- TypeScript, ESLint, formato y bundle Android: aprobados.
- Jest: 15 pruebas aprobadas, incluyendo búsqueda vacía, error/reintento,
  agrupación por IP, navegación a detalle, exclusión de búsquedas simultáneas,
  cancelación y limpieza al salir de la pantalla.
- Build debug x86_64 y APK de androidTest: generados.
- DiscoveryInstrumentation: PASS, código -1. Registró un servicio mDNS controlado,
  lo encontró/resolvió mediante el motor real y comprobó plazo, exclusión y
  cancelación. No es evidencia de un equipo externo en la LAN.
- Recorrido en la app instalada: mostró la IP 10.0.2.16 y el aviso de red virtual;
  Buscar equipos inició la búsqueda, Cancelar la detuvo, y una nueva búsqueda
  terminó en plazo indicando que no encontró servicios. Evidencia visual:
  evidencia/descubrimiento-android.png. Registro local ignorado por Git:
  tmp/android-run/discovery-ui-result.json.

La primera prueba desde la pantalla detectó que no estaba disponible el
TurboModule, aunque Kotlin compilaba y el motor funcionaba por separado. Se
normalizó PROJECT_BUILD_DIR en un CMakeLists propio que incluye la configuración
oficial de React Native. Después de recompilar e instalar se verificó el recorrido
completo desde JavaScript al motor nativo. No se editó node_modules.

RF01 sigue parcial: faltan un equipo externo real y la resolución del requisito
de MAC. RF02–RF08, persistencia y entregables finales siguen pendientes. Los
resultados controlados del test no se incluyen en la búsqueda normal de la app.

## Hostname resuelto (28/10/2026)

- Se observaron dos fallos nuevos antes del cambio: el adaptador descartaba el
  hostname tanto en el primer servicio como en un servicio posterior de la misma IP.
  Ambos casos pasan después de conservar el campo opcional de NSD.
- Se mantuvo la prueba que prohíbe usar el nombre del servicio como hostname o
  inventar una MAC. La prueba focalizada aprobó sus ocho casos.
- npm.cmd run verify terminó correctamente: TypeScript, ESLint, 17 pruebas Jest y
  bundle Android. format:check también aprobó.
- Se compilaron el APK debug x86_64 y androidTest. En API 36 la instrumentación
  obtuvo un hostname no vacío mediante mDNS y terminó con PASS/código -1.
  El anuncio controlado pertenece al propio emulador, no a un equipo externo.
- El primer intento nativo fue interrumpido por un ANR durante el arranque del
  proceso. dumpsys activity exit-info registró "failed to complete startup";
  también hubo errores de procesos del sistema del emulador. El único reintento,
  con el mismo APK y la compilación terminada, aprobó sin cambios de código.
- Los registros locales están en tmp/android-run/hostname-build.log,
  hostname-instrumentation.txt y hostname-instrumentation-retry.txt, ignorados por Git.

No se ejecutó una prueba nativa en Android API 24–35. El acceso a getHostname está
protegido por SDK_INT >= 36 y se mantiene no disponible cuando NSD no entrega el dato.
La MAC y la validación con un equipo físico de la LAN siguen pendientes de RF01.

Una verificación independiente en una copia nueva del código, bajo el directorio
temporal del host, aprobó los tres casos de conversión de hostname. Los otros cinco
casos de esa suite se omitieron intencionalmente por el filtro de nombres; ya
estaban cubiertos por la ejecución completa de 17 pruebas. Los hashes de los cinco
archivos de código y pruebas revisados permanecieron iguales después de la prueba.
Los intentos iniciales en el temporal aislado no ejecutaron pruebas por restricciones
de escritura/visibilidad; no se contabilizan como comprobaciones aprobadas.

## Laboratorio SNMP (28/10/2026)

- Agente de PC: cinco pruebas Node aprobaron con intercambio UDP real en loopback.
  El aislamiento inicial produjo timeouts; el reintento con acceso al host aprobó.
- TypeScript y ESLint aprobaron. La batería final Jest aprobó 40/40 casos con
  `npm.cmd test -- --runInBand --testTimeout=15000`. El formato y el bundle Android
  también aprobaron.
- La primera batería completa tuvo dos timeouts de montaje inicial de 5 s con
  unos 450 MB de RAM libres. La siguiente detectó tres fallos de simulación del
  servicio: se mantenía `virtual: true` después de crear el módulo real. Corregida
  esa configuración de pruebas, los tres casos focalizados y los 40 generales
  aprobaron. Los intentos fallidos no se contabilizan como aprobados.
- Se compilaron los APK debug y androidTest para x86_64: 136 tareas, 7m37s.
  Esto demuestra compilación, todavía no ejecución de la instrumentación.
- Consulta real emulador→PC aprobada desde la app instalada: `TP6-LAB-PC`,
  uptime e interfaz 1. La última lectura registrada mostró 546 octetos de entrada
  y 209 de salida, acumulados en el agente controlado. Se verificaron timeout
  con comunidad incorrecta, cancelación de una consulta en curso y lectura
  exitosa posterior al restablecer `public` y 3000 ms.
- Capturas: `docs/evidencia/snmp-laboratorio-android.png`,
  `snmp-timeout-android.png` y `snmp-cancelacion-android.png`.
- La inspección independiente no encontró bloqueos en códec, cliente o
  concurrencia UDP. El primer intento en una copia temporal no tuvo resultado
  confirmado. La ejecución independiente final sí aprobó 24/24 pruebas de códec,
  cliente y pantalla, en tres suites y 23,383 s, usando una copia nueva en TEMP.
  Los hashes SHA256 de 42 archivos originales permanecieron iguales antes y
  después. Esa prueba reutilizó las dependencias mediante una junction, sin
  copiar node_modules ni modificar el código original.
- La instrumentación UDP compiló, pero Android solo registró el runner anterior
  de descubrimiento. Se agregó un manifiesto de pruebas y su ruta explícita;
  los dos builds posteriores conservaron tareas de manifiesto como UP-TO-DATE.
  El primer recheck para forzar esa tarea no devolvió salida ni un identificador
  de proceso y fue interrumpido después de 275,3 s; no se puede afirmar si se ejecutó.
  La ronda autorizada siguiente sí reprodujo el procesamiento: AGP leyó el manifiesto
  de pruebas y reemplazó su runner por el `testInstrumentationRunner` de Gradle.
  El registro anterior no fallaba por caché. La corrección se documenta abajo.
  No se ha probado un router físico.

Registros: `tmp/android-run/snmp-build.log`, `snmp-jest-final.log`,
`snmp-bundle.log` y `snmp-format.log`. El emulador se cerró durante la compilación
para liberar memoria; también se detuvo el daemon Gradle al finalizar.

Metro presentó un error 500 en su grafo de dependencias durante la primera apertura.
Reiniciar únicamente el Metro del proyecto con `--reset-cache --max-workers 1`
permitió cargar y ejecutar la app. No se modificaron dependencias.
El emulador se dejó en 540×1200 y densidad 210 para reducir el trabajo gráfico.
Un tutorial de lápiz del teclado interceptó entradas de la automatización; se
cerró con Cancelar. Los intentos con controles fuera de pantalla o texto recibido
por ese tutorial no cuentan como pruebas de cancelación aprobadas.

### Registro y ejecución nativa corregidos

`tp6TestSuite` selecciona el runner en la configuración Gradle que genera el
manifiesto. Se retiraron el manifiesto adicional y su mapeo redundante.

| Comprobación | Resultado observado |
| --- | --- |
| Sin propiedad | Build exit 0; manifiesto con `DiscoveryInstrumentation`, valor anterior conservado |
| `-Ptp6TestSuite=invalid` | Gradle exit 1 con `Invalid tp6TestSuite 'invalid'. Expected discovery or udp.`; rechazo esperado aprobado |
| `-Ptp6TestSuite=udp` | APK de pruebas compilado; manifiesto binario con `UdpTransportInstrumentation` |
| Instalación en emulator-5554 | ADB exit 0, `Success`; se instaló solo el APK de pruebas |
| Instrumentación UDP | `stream=PASS:` e `INSTRUMENTATION_CODE: -1`, con ADB exit 0 |

La ejecución nativa aprobó UDP real en loopback, validación de entradas, límite
de respuesta, timeout, rechazo por consulta simultánea, cancelación antes del
worker y durante recepción, reintento, cierre y rechazo del ejecutor. No se
modificó el transporte ni el cliente SNMP para obtener este resultado.

Evidencia: `tmp/android-run/native-manifest-probe.log` muestra la causa;
`native-suite-default.log`, `native-suite-invalid.log`, `native-suite-udp-build.log`
y `native-suite-udp-apk-manifest.txt` registran la configuración comprobada;
`native-udp-result.txt` contiene el PASS nativo.

La revisión independiente final aprobó S1–S4 dentro del alcance de laboratorio.
La prueba emulador→PC conserva la evidencia observada por el implementador;
el verificador no la repitió ni la presenta como una prueba de router físico.
El registro de la copia aislada quedó en
`C:/Users/54344/AppData/Local/Temp/tp6-independent-b70f42aaebca41848c3faf618c971311/jest-result.log`.

El implementador repitió como comprobación puntual el comando de instrumentación
instalado: volvió a obtener `stream=PASS:` y `INSTRUMENTATION_CODE: -1`
(`tmp/android-run/native-udp-parent-check.txt`). `git diff --check` también aprobó.
