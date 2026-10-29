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

## Plan restante

4. RF03 — SSH con comandos predefinidos (`uptime`, `interfaces`), credenciales en
   Keystore (react-native-keychain). Nunca contraseñas en texto plano ni en la cola.
   Evaluar módulo nativo propio con JSch si react-native-ssh-sftp no funciona en RN 0.88.
5. RF04 — QR/barras con el code scanner de vision-camera; asociar a ficha técnica.
6. RF07 — backend stub (ver backend/README.md) + servicio de sync con NetInfo:
   `listReadyActions` → `markSending` → enviar → `markSent` / `markFailed` /
   `markConflict` (HTTP 409 por revisión vieja).
7. RF08 — pantalla Historial por equipo/sitio leyendo la base sin conexión.
8. Entregables: repo remoto, APK, informe técnico (SNMP, credenciales SSH, outbox),
   video demo.

## Convenciones del proyecto

- Textos de UI y comentarios en español.
- Lógica pura en `src/core` o archivos de feature sin React Native, con pruebas.
- Adaptadores nativos en `src/infrastructure`, inyectables en pantallas para tests.
- Correr `npm.cmd run verify` antes de cada commit.
