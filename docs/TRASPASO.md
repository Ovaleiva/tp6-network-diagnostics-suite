# Traspaso de trabajo (29/10/2026)

Contexto para continuar el TP6 en otra sesión (por ejemplo, Claude Code).
Leer también README.md, docs/ALCANCE.md y docs/ARQUITECTURA.md.

El proyecto se trabaja en C:/dev/tp6. La ruta anterior, dentro de Documents,
superaba el límite de 260 caracteres del Ninja del SDK al compilar Nitro
(ver docs/EMULADOR.md, "Ajuste de rutas para Windows").

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
- Pendiente de probar en emulador.

## Plan restante

3. RF06 — PDF de instalación con fotos y GPS (react-native-html-to-pdf u otra
   compatible con RN 0.88). Guardar con `saveReportWithAction` (`report.upload`).
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
