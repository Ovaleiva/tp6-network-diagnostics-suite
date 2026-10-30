# Traspaso de trabajo (29/10/2026)

Contexto para continuar el TP6 en otra sesión (por ejemplo, Claude Code).
Leer también README.md, docs/ALCANCE.md y docs/ARQUITECTURA.md.

El proyecto se trabaja en C:/dev/tp6. La ruta anterior, dentro de Documents,
superaba el límite de 260 caracteres del Ninja del SDK al compilar Nitro
(ver docs/EMULADOR.md, "Ajuste de rutas para Windows").

El 29/10 el trabajo pasó a otra PC (32 GB de RAM), porque en la anterior
(16 GB) el emulador no llegaba a abrir. El entorno de esta PC está en
docs/EMULADOR.md, "PC actual". Tras clonar: `npx --yes pnpm@11.25.0 install
--frozen-lockfile` y `npm.cmd test -- --runInBand` (56/56 OK).

## Estado verificado antes de estos cambios

- Typecheck OK. Tests: 40/40 OK (App, discovery, snmp-screen, snmp-codec, snmp-client).
- Lint: no se traba; tarda (~15 s solo de arranque) y bajo carga `verify` completo
  puede demorar varios minutos. Verificado OK el 29/10.
- RF01 (mDNS) y RF02 (SNMPv2c con agente de laboratorio) implementados.
- Pendientes de RF01: probar con un equipo físico de la LAN y documentar la MAC.
  Desde Android 10 no se puede leer la tabla ARP; mostrar "MAC no disponible"
  (o tomarla del TXT de mDNS si el equipo la publica) y justificarlo en el informe.

## Paso 1 — Base local SQLite + outbox (HECHO)

Decisión: SQLite con `@op-engineering/op-sqlite` en lugar de WatermelonDB
(transacciones reales, menos configuración nativa con RN 0.88). Justificar en el informe.

- `src/infrastructure/storage/sql.ts`: puerto `SqlDatabase` (execute + transaction).
- `src/infrastructure/storage/schema.ts`: migraciones con `PRAGMA user_version`.
- `src/infrastructure/storage/sqliteRepository.ts`: `LocalRepository` + `OutboxStore`.
  Entidad y acción se guardan en la misma transacción. Una revisión nueva reemplaza
  la acción pendiente de la misma entidad. `markSent` borra la acción.
- `src/infrastructure/storage/opSqlite.ts`: adaptador real; `getRepository()` singleton,
  migra y llama `recoverInterrupted()` al abrir.
- `src/core/sync/outboxPolicy.ts`: backoff 30 s → 30 min, tope 8 intentos → `failed`.
- `src/features/local-store/contracts.ts`: contrato ampliado (saveDevices, listSites,
  findInstallation, listInstallations, findReport, OutboxStore).
- `__tests__/local-store.test.ts`: 8 pruebas con `node:sqlite` real. PASARON.
- Paquete instalado y typecheck OK.

## Paso 2 — Instalación con fotos, GPS y notas, RF05 (HECHO y probado en emulador)

- `src/core/ids.ts`: ids locales.
- `src/features/evidence/installationDraft.ts`: lógica pura (validación, fotos,
  georreferencia si el GPS tiene < 5 min, revisión + acción outbox).
- `src/features/evidence/contracts.ts`: `EvidenceService` y `EvidenceError`.
- `src/infrastructure/evidence/androidEvidence.ts`: permisos, GPS
  (`@react-native-community/geolocation`), mover foto a `DocumentDirectoryPath/evidence`
  (`@dr.pogodin/react-native-fs`).
- `src/features/evidence/CameraScreen.tsx`: `react-native-vision-camera` v5
  (`usePhotoOutput` + `capturePhotoToFile`, JPEG), vuelve con
  `navigation.popTo('Installation', { capturedPhotoPath }, { merge: true })`.
- `src/features/evidence/InstallationScreen.tsx`: formulario completo + lista guardada.
- Rutas: `Installation` acepta params; nueva ruta `Camera`.
- Manifest: permisos CAMERA, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION.
- `android/build.gradle`: minSdkVersion 26.
- `jest.setup.js`: mock de `react-native-vision-camera` (API v5).
- `__tests__/App.test.tsx`: Instalación ya no es placeholder; prueba propia con
  repositorio y evidencia mockeados.
- `__tests__/installation-draft.test.ts`: 5 pruebas.

### Dependencias instaladas

- `react-native-vision-camera` 5.2.3 (basada en Nitro, nueva arquitectura). Requiere
  `react-native-nitro-modules` y `react-native-nitro-image`, también instalados.
  La API cambió respecto de v4: no hay `takePhoto` ni prop `photo`; el permiso se
  pide con `VisionCamera.requestCameraPermission()` (devuelve boolean).
- `@react-native-community/geolocation` 3.4.0 y `@dr.pogodin/react-native-fs` 2.41.0.
- En Windows, si `pnpm add` falla con `ERR_PNPM_ENOENT ... _tmp_...`, borrar la carpeta
  del paquete que quedó a medias en `node_modules` y reintentar.

`npm.cmd run verify` OK (typecheck, lint, 53/53 pruebas, bundle Android).

### Prueba en emulador (29/10, HECHA)

Compilación nativa OK (15 min la primera vez). Con GPS simulado
(`adb emu geo fix -64.1888 -31.4201`) se tomaron dos fotos: la primera, antes
del GPS, quedó "sin GPS"; la segunda quedó georreferenciada. Al guardar, la base
del dispositivo tenía la instalación (revisión 1) y la acción
`installation.upsert` pendiente; los JPEG quedaron en `files/evidence`.

Con adb, el obturador necesita una pulsación (`input swipe x y x y 150`);
`input tap` no lo dispara en el emulador cargado.

## Paso 3 — Guardar diagnósticos y equipos (HECHO)

- Diagnóstico guarda cada consulta SNMP exitosa con `saveDiagnosticWithAction`
  (kind `diagnostic.upsert`, revisión 1). La comunidad no se guarda. Las
  consultas fallidas o canceladas no se guardan.
- Equipos guarda lo descubierto con `saveDevices`.
- Sitio unificado `LOCAL_SITE_ID = 'sitio-local'` (antes Diagnóstico usaba
  `'local'`). Diagnóstico recibe el `siteId` del equipo seleccionado.
- `src/core/sync/outboxAction.ts`: creación compartida de acciones de la cola.
- `src/features/local-store/useRepository.ts`: abre la base o usa la inyectada.
- `getRepository()` comparte la apertura entre pantallas simultáneas.

### Prueba en emulador (29/10, HECHA para Diagnóstico)

Primera prueba en la PC nueva (ver docs/EMULADOR.md, "PC actual"). Compilación
nativa OK en 9 min 37 s. Con el agente `npm.cmd run lab:snmp` y los valores por
defecto de Diagnóstico (`10.0.2.2:1161`, `public`, interfaz 1):

- Cada consulta exitosa mostró `TP6-LAB-PC` y "Guardado en el dispositivo".
  La base del dispositivo quedó con 2 diagnósticos (`site_id = sitio-local`,
  `device_id = manual:10.0.2.2`) y 2 acciones `diagnostic.upsert` en estado
  `pending`, revisión 1 y 0 intentos. Ningún payload contiene la comunidad.
- Comunidad incorrecta: "El dispositivo no respondió dentro del plazo de
  espera." Cancelación: "La consulta UDP fue cancelada." En ambos casos la base
  no cambió.
- Equipos: la búsqueda mDNS en el emulador vuelve vacía (la red virtual no
  recibe los anuncios de la LAN), así que `saveDevices` no se ejecutó y la tabla
  `devices` quedó vacía. **Pendiente:** probarlo con un teléfono físico en la
  misma Wi-Fi que un equipo que anuncie servicios mDNS (sirve también para RF01).

Para leer la base del emulador:

```powershell
cmd /c "adb -s emulator-5554 exec-out run-as com.networkdiagnosticssuite cat databases/network-diagnostics.db > nd.db"
```

y abrirla con `node:sqlite` (`new DatabaseSync('nd.db', { readOnly: true })`).

## Paso 4 — PDF de instalación, RF06 (HECHO y probado en emulador)

Decisión: **pdf-lib** (JavaScript puro) en lugar de react-native-html-to-pdf.
Justificar en el informe:

- No agrega código nativo para generar el PDF; embebe los JPEG directamente.
- La generación se prueba en Jest con PDF reales (páginas, imágenes, título).
- react-native-html-to-pdf (1.3.0) depende del WebView de Android y no estaba
  verificada con RN 0.88 y la nueva arquitectura.
- Contra: pdf-lib no publica versiones desde 2022 (1.17.1, estable). Solo usa
  las fuentes estándar del PDF (WinAnsi); los caracteres fuera de ese conjunto
  (emojis, otros alfabetos) se reemplazan por `?`.

Para abrir el PDF se escribió un módulo Kotlin propio (sin dependencias nuevas).

- `src/features/reporting/installationPdf.ts`: lógica pura. A4 con cabecera
  (sitio, equipo, instalación, revisión, fechas, GPS, cantidad de fotos), notas
  con ajuste de línea y cada foto con su epígrafe (fecha y GPS o "sin GPS").
  Lee las fotos de a una (`PhotoReader`) para no tener todas en memoria.
  Respeta la orientación EXIF: la cámara guarda los píxeles del sensor y marca
  el giro (orientación 6 en el emulador); sin girarlas, las fotos salían de costado.
- `reportId` = `rep-<instalación>-r<revisión>`: regenerar la misma revisión
  reemplaza el reporte y su acción `report.upload` en la cola.
- `InstallationReport.installationRevision`: revisión documentada por el PDF.
  La pantalla avisa si el último PDF es de una revisión anterior.
- `src/infrastructure/reporting/androidReporting.ts`: escribe en `files/reports`.
- `src/specs/NativePdfViewer.ts` + `PdfViewerModule.kt`: `ReportFileProvider`
  (subclase propia de FileProvider, para no chocar con los de las bibliotecas)
  y `ACTION_VIEW`. Solo comparte PDF de `files/reports` (`res/xml/report_paths.xml`).
  Errores: `E_NOT_FOUND`, `E_NO_VIEWER`.
- `ReportsScreen`: lista instalaciones; "Generar PDF" guarda reporte + acción
  en una transacción (`saveReportWithAction`); "Abrir PDF".
- Repositorio: `listReports(installationId?)`.
- Pruebas: `installation-pdf.test.ts` (19, con JPEG real en
  `__tests__/fixtures/photo.jpg`), `reports-screen.test.tsx` (6), repositorio (+1).
  Total 82/82.

### Prueba en emulador (29/10, HECHA)

Instalación `torre-norte` con GPS simulado, notas en dos líneas y 2 fotos.
Reportes generó `rep-inst-…-r1.pdf` (263 KB, 2 páginas, 2 imágenes); la base
quedó con el reporte (revisión 1) y una acción `report.upload` pendiente.
Regenerar la misma revisión no duplicó ni el reporte ni la acción. "Abrir PDF"
lo mostró en el visor de Google Drive del emulador
(`docs/evidencia/pdf-instalacion-android.png`).

En modo debug, la primera vez que se abre Reportes Metro arma el bloque diferido
de pdf-lib (~800 módulos) y la pantalla muestra "Cargando instalaciones…"
unos segundos.

## Paso 5 — SSH con comandos predefinidos, RF03 (HECHO y probado en emulador)

Decisiones (justificar en el informe):

- **Módulo Kotlin propio con JSch 0.2.25** (`com.github.mwiede:jsch`, fork
  mantenido) en lugar de `@dylankenneally/react-native-ssh-sftp` 1.11.0. Esa
  biblioteca fija `StrictHostKeyChecking=no` (acepta cualquier servidor: un
  intermediario podría quedarse con la contraseña), conecta sin timeout, usa
  el puente viejo de módulos y JSch 0.2.17.
- **Contraseña cifrada desde el módulo nativo**, sin react-native-keychain:
  AES-256-GCM con una clave del Android Keystore (no exportable); la referencia
  `ssh:<ip>:<puerto>` va como dato autenticado (AAD). En SharedPreferences
  queda solo usuario, IV y texto cifrado (`allowBackup=false`). JavaScript
  envía la contraseña una vez al guardarla y nunca la vuelve a leer; el módulo
  la descifra al conectar y borra el arreglo después.
- **Identidad del servidor (TOFU)**: la primera vez la app muestra la huella
  SHA256 (formato OpenSSH) para compararla con la del equipo y el técnico la
  confirma. Después solo se acepta esa huella. JSch la verifica durante el
  intercambio de claves, **antes** de autenticar: si no coincide no se envía la
  contraseña. Cambiarla exige "Olvidar huella guardada" explícitamente.
- **Lista cerrada de comandos en Kotlin** (`SshCommands`): JavaScript envía
  perfil + comando, nunca texto libre. Linux: `uptime`, `ip -brief address`.
  Cisco IOS y RouterOS están definidos pero **sin probar** con equipos reales;
  su salida se muestra sin interpretar.
- **Laboratorio** `npm.cmd run lab:ssh` (`scripts/ssh-lab.cjs`, con `ssh2` como
  devDependency): 127.0.0.1:2222, usuario `tecnico`, contraseña `laboratorio`,
  solo `exec` de los dos comandos Linux con salidas simuladas; no ejecuta nada
  en la PC. La clave del servidor queda en `tmp/ssh-lab/` (ignorado) para que
  la huella no cambie; se imprime al iniciar. `pnpm-workspace.yaml` deja en
  `false` los scripts de compilación de `ssh2`/`cpu-features` (no hacen falta).

Archivos:

- `android/.../SshSecurity.kt`: `SshCommands`, `SshCredentialStore`,
  `SshKnownHosts` y `PinnedHostKeyRepository`.
- `android/.../SshClientModule.kt` (`NativeSshClient`): `run`, `scanHostKey`,
  `trustHostKey`, `forgetHostKey`, `saveCredential`, `credentialUser`,
  `deleteCredential`, `cancel`. Un hilo por conexión, plazo total, salida
  máxima 64 KB. Errores: `E_HOST_KEY_UNKNOWN`, `E_HOST_KEY_CHANGED`, `E_AUTH`,
  `E_NO_CREDENTIAL`, `E_TIMEOUT`, `E_UNREACHABLE`, `E_CANCELLED`.
- `src/features/protocols/sshDiagnostic.ts`: lógica pura (perfiles, uptime e
  `ip -brief`, diagnóstico, traducción de errores).
- `src/features/protocols/SshScreen.tsx` (ruta `SshDiagnostics`, se abre desde
  Diagnóstico con el mismo equipo). Guarda con `saveDiagnosticWithAction`
  solo los comandos con código 0; la salida guardada se recorta a 8000 caracteres.
- Pruebas: `ssh-diagnostic.test.ts` (23), `ssh-screen.test.tsx` (9),
  App (+1), `npm.cmd run test:ssh-lab` (6). Jest: 115/115.

### Prueba en emulador (29/10, HECHA)

Con `npm.cmd run lab:ssh` y la app en 10.0.2.2:2222:

- Primera conexión: la app mostró `SHA256:Y+MBs6zJByxrpHcRsfM0oEfZ5u+BS6rmkuZVidYYSNk`,
  idéntica a la del laboratorio. Con contraseña incorrecta: "Usuario o contraseña
  incorrectos."
- Con la correcta: uptime ("Encendido hace 6 min") e interfaces (lo, eth0,
  wlan0) con código 0, guardados con su acción `diagnostic.upsert`
  (`docs/evidencia/ssh-laboratorio-android.png`).
- Laboratorio reiniciado con otra clave: "La huella del equipo no coincide…
  no se envió la contraseña." "Olvidar huella" volvió a pedir confirmación con
  la huella nueva; "No confiar" no ejecutó nada.
- Laboratorio detenido: "No se pudo conectar: puerto cerrado o equipo inaccesible."
- En el teléfono, `ssh_credentials.xml` contiene solo usuario, IV y texto
  cifrado; ni `laboratorio` ni `incorrecta` aparecen en la base, la cola ni
  las preferencias.

Observación: una vez, tras ejecutar uptime y deslizar la pantalla enseguida, la
interfaz siguió mostrando "Cancelar conexión" hasta el siguiente toque, aunque
el diagnóstico ya estaba guardado. No se repitió en los intentos siguientes.

**Pendiente:** probar con un equipo real (router Linux/OpenWrt, Cisco o
MikroTik) en la LAN con un teléfono físico.

## Paso 6 — Historial sin conexión, RF08 (HECHO y probado en emulador)

- `src/features/history/historyView.ts`: lógica pura. Describe diagnósticos
  SNMP (sysName, uptime, octetos) y SSH (comando, código, uptime, interfaces,
  huella, salida); los registros sin datos estructurados usan su resumen.
  Lista y filtra equipos.
- `src/features/history/HistoryScreen.tsx`: filtro por sitio (consulta
  `listDiagnostics({ siteId })` a la base) y por equipo (aparece si hay más de
  uno), del más reciente al más antiguo; cada registro se expande para ver el
  detalle y la salida SSH. Botón "Actualizar".
- `src/shared/format.ts`: `formatDate` se movió acá. Reportes lo importaba de
  `installationPdf.ts` y eso cargaba pdf-lib con la pantalla.
- Pruebas: `history.test.tsx` (10) y App (+1). Jest: 125/125.

### Prueba en emulador (29/10, HECHA)

Con la app abierta se activó el modo avión
(`adb shell cmd connectivity airplane-mode enable`). "Actualizar" y los filtros
siguieron funcionando: `sitio-local` mostró 5 diagnósticos (3 SSH, 2 SNMP),
`torre-norte` "No hay diagnósticos para este filtro" y el detalle SSH se
expandió con interfaces, huella y salida
(`docs/evidencia/historial-modo-avion-android.png`).

Límite de la compilación debug: no puede **arrancar** en modo avión, porque
pide el JavaScript a Metro ("Unable to load script"), y cada `import()`
dinámico es un bloque que se descarga de Metro la primera vez ("Could not load
bundle"). Por eso la app se abrió con red y el modo avión se activó después.
Abrir la app desde cero sin red se debe repetir con el **APK release**, que
incluye el bundle completo.

## Paso 7 — Sincronización, RF07 (EN CURSO, 29/10)

Hecho y probado en Node/Jest (todavía no en el emulador):

- `backend/server.cjs` (`npm.cmd run backend`, pruebas `npm.cmd run test:backend`,
  11/11): Node sin dependencias, solo 127.0.0.1:3000 (emulador:
  `http://10.0.2.2:3000`). Persiste en `tmp/backend/state.json` y
  `tmp/backend/files/` (escritura atómica), así que **conserva el estado al
  reiniciarse**. `GET /health`; `POST /sync/actions` idempotente por `actionId`
  (mismo id con otro contenido → 422), 409 si el servidor tiene una revisión
  mayor o la misma con otro contenido, 422 si falta un archivo referenciado;
  `POST /sync/files` en JSON con base64 y SHA-256 verificado (solo JPEG y PDF,
  máx. 20 MB); `GET /technical-sheets/:code` con dos fichas de ejemplo para RF04
  (`TP6-ONT-001`, `TP6-RTR-002`). `backend/` se agregó al lint.
- Repositorio: migración 2 (tabla `settings`), `getSetting`/`setSetting`,
  `findDiagnostic`, `markRejected` (error permanente → `failed` sin reintento
  automático), `discard` (descarta la acción, conserva la entidad) y
  `lastError` en `OutboxAction`.
- `src/features/sync/syncEngine.ts` (lógica pura): health primero (sin backend
  no toca la cola); por acción `markSending` → sube archivos (fotos con
  `fileId` = id de la foto, PDF con `fileId` = id del reporte, sin rutas locales)
  → acción. ok → `markSent`; 409 → `markConflict`; rechazo → `markRejected`;
  temporal → `markFailed` (espera creciente) y **corta la ronda**.
- `src/features/sync/httpTransport.ts`: `fetch` con timeout; 2xx ok, 409
  conflicto, 408/429/5xx y errores de red temporales, otros 4xx permanentes.
  `DEFAULT_BACKEND_URL` y `normalizeBackendUrl`.
- `test-support/memoryDb.ts`: SQLite en memoria compartido por las pruebas.
- Pruebas: `sync-engine.test.ts` (unitarias + integración contra el backend
  real: envío completo, reenvío tras cierre sin duplicar, conflicto y descarte,
  backend apagado) y `local-store.test.ts` ampliado.

Falta (siguiente sesión):

1. Instalar `@react-native-community/netinfo` 12.0.1 (señal para reintentar al
   volver la red; la disponibilidad real la decide `/health`). La instalación se
   interrumpió: **no está en package.json**.
2. `src/infrastructure/sync/`: lector de archivos (RNFS `readFile` base64 +
   `hash` sha256) y servicio con el repositorio, el transporte HTTP y la URL
   guardada en `settings` (`backendUrl`).
3. Controlador: una sola ronda a la vez; dispara al abrir la app, al volver la
   red (NetInfo), cada 60 s con la app abierta y con "Sincronizar ahora".
4. Pantalla Sincronización: URL del backend, estado de la última ronda,
   pendientes (intentos y próximo intento), conflictos con "Descartar (conserva
   los datos locales)", fallidas con "Reintentar" (`retryFailed`). Montar el
   controlador en `App.tsx`.
5. Prueba en emulador: backend arriba → enviar las 7 acciones (2 SNMP, 3 SSH,
   instalación con 2 fotos, reporte PDF) y revisar `tmp/backend`; backend caído
   → reintento con espera; conflicto creado con otro POST de revisión mayor.
6. APK release: `usesCleartextTraffic` es false en release y el backend de
   laboratorio usa HTTP; decidir y documentar antes de armar el APK.

## Plan restante

5. RF07 — completar lo pendiente del Paso 7.
6. RF04 — QR/barras con el code scanner de vision-camera; asociar a ficha técnica.
7. Pruebas con teléfono físico en la LAN: RF01 (equipo real y MAC), RF02 (SNMP
   a un equipo de red), RF03 (SSH a un equipo real).
8. Entregables: APK release (repetir ahí la prueba de Historial abriendo la app
   en modo avión), informe técnico (SNMP, credenciales SSH, outbox), video demo.

## Convenciones del proyecto

- Textos de UI y comentarios en español.
- Lógica pura en `src/core` o archivos de feature sin React Native, con pruebas.
- Adaptadores nativos en `src/infrastructure`, inyectables en pantallas para tests.
- Correr `npm.cmd run verify` antes de cada commit.
