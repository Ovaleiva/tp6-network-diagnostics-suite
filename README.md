# TP6 · Network Diagnostics Suite

Aplicación React Native (Android) para técnicos de campo. Funciona sin conexión:
descubre equipos por mDNS, consulta SNMPv2c con un códec propio, ejecuta comandos
SSH predefinidos, lee QR y barras, registra instalaciones con fotos y GPS, genera
el PDF en el teléfono y sincroniza todo con un backend cuando vuelve la red.

Los ocho requisitos (RF01–RF08) están implementados y probados en el emulador
contra laboratorios en la PC, incluidos net-snmp y OpenSSH reales en Docker. No
hubo un teléfono Android ni un equipo de red físico para probar: RF01 queda
parcial (el emulador no recibe mDNS de la LAN y Android 10+ no entrega la MAC).
El estado por requisito está en la sección 1 del
[informe técnico](docs/INFORME_TECNICO.md); el detalle del trabajo, en
[el traspaso](docs/TRASPASO.md).

## Instalar el APK

El APK release (4 ABI, unos 125 MB) se descarga de la
[Release v1.0.0](https://github.com/Ovaleiva/tp6-network-diagnostics-suite/releases/tag/v1.0.0);
no se versiona en el repositorio. Para generarlo, ver [Compilar](#compilar).
Se instala con:

```powershell
adb install -r tp6-network-diagnostics-suite-v1.0.0.apk
```

Está firmado con la clave debug de la plantilla, así que se instala encima de
una compilación debug y conserva los datos. En release la app solo permite HTTP
hacia el backend de laboratorio (`10.0.2.2` en el emulador, `127.0.0.1` con
`adb reverse` en un teléfono por cable).

## Probar con los laboratorios

Cada comando en su propia terminal, desde esta carpeta. En Windows usar
`npm.cmd` si PowerShell bloquea `npm.ps1`.

| Comando | Qué levanta | Desde el emulador |
| --- | --- | --- |
| `npm.cmd run backend` | Backend de sincronización y fichas técnicas (estado en `tmp/backend`) | `http://10.0.2.2:3000` |
| `npm.cmd run lab:linux` | Debian en Docker con net-snmp y OpenSSH reales (requiere Docker Desktop) | SNMP `10.0.2.2:1162`, SSH `10.0.2.2:2223` |
| `npm.cmd run lab:snmp` | Agente SNMP simulado en Node, con contadores controlados | `10.0.2.2:1161` |
| `npm.cmd run lab:ssh` | Servidor SSH simulado en Node | `10.0.2.2:2222` |

Recorrido sugerido con `backend` y `lab:linux`:

1. **Diagnóstico:** IP `10.0.2.2`, puerto `1162`, comunidad `tp6-lab`,
   interfaz `2` → **Consultar SNMP**. Responde `tp6-linux-lab` con los
   contadores reales de `eth0`.
2. **Diagnóstico → Diagnóstico SSH:** puerto `2223`, perfil Linux, credencial
   `tecnico` / `laboratorio`. La primera vez la app muestra la huella del
   servidor para confirmarla; se compara con:
   `docker exec tp6-linux-lab sh -c 'for f in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf $f; done'`.
3. **Identificar equipo:** escanear `docs/etiquetas/qr-TP6-ONT-001.png` (en el
   emulador, con `-camera-back webcam1`) o escribir el código.
4. **Instalación** y **Reportes:** fotos, GPS (`adb emu geo fix -64.1888 -31.4201`
   lo simula) y PDF.
5. **Sincronización:** con el modo avión los cambios quedan en la cola; al
   desactivarlo se envían solos.

La [guía de etapa 3](docs/ETAPA_3_SNMP.md) explica SNMP y sus OIDs;
[ejecución en el emulador](docs/EMULADOR.md), cómo abrirlo en esta PC; y
[pruebas en un teléfono](docs/PRUEBAS_TELEFONO.md), la lista para un equipo
físico.

## Compilar

Dependencias y verificación (typecheck, lint, pruebas y bundle de JavaScript):

```powershell
npx --yes pnpm@11.25.0 install --frozen-lockfile
npm.cmd run verify
```

Se usa pnpm 11.25.0 para instalar y su lockfile para fijar las versiones. El
bundle de `verify` comprueba la resolución de JavaScript; **no compila un APK**.

Con JDK 17 y el SDK de Android (ver [preparación de Windows](docs/ENTORNO.md)):

```powershell
# Debug, con Metro: npm start en una terminal y en otra
npm.cmd run android
# Release
cd android; .\gradlew.bat assembleRelease
```

Los comandos `android` y `doctor:android` resuelven JDK 17 y el SDK aunque la
terminal conserve el entorno anterior; `npm.cmd run android:env` muestra las
rutas elegidas. La compilación nativa ocupa unos 24 GB en `node_modules` y
`android/app/build`: revisar el espacio libre antes de compilar. La app no usa
Expo Go.

## Recorrido de lectura

1. [Informe técnico](docs/INFORME_TECNICO.md) ([PDF](docs/INFORME_TECNICO.pdf)):
   estado por requisito, SNMP, credenciales SSH y outbox.
2. [Alcance y trazabilidad RF01–RF08](docs/ALCANCE.md).
3. [Arquitectura y decisiones](docs/ARQUITECTURA.md).
4. [Pruebas y estado de la validación](docs/VERIFICACION.md).
5. [Backend de laboratorio](backend/README.md).
6. Etapas explicadas: [1](docs/ETAPA_1.md), [2](docs/ETAPA_2.md),
   [3 SNMP](docs/ETAPA_3_SNMP.md).
7. [Guion del video demo](docs/VIDEO_DEMO.md).

## Estructura

```text
App.tsx                    Composición de la aplicación
src/
  app/navigation/          Rutas y navegador
  core/                    Lógica sin React Native: modelos, códec SNMP, cola
  features/
    home/                  Inicio
    discovery/             RF01: descubrimiento mDNS
    protocols/             RF02–03: SNMP y SSH
    identification/        RF04: QR, barras y ficha técnica
    evidence/              RF05: instalación con fotos y GPS
    reporting/             RF06: PDF
    local-store/           Contrato de la base local
    sync/                  RF07: motor de sincronización
    history/               RF08: historial
  infrastructure/          Adaptadores Android: NSD, UDP, SSH, cámara, SQLite, PDF, HTTP
  specs/                   Contrato TurboModule para Codegen
  shared/                  Componentes visuales y colores
android/                   Proyecto nativo Android
ios/                       Plantilla iOS; no validada en Windows
backend/                   Backend de laboratorio (Node, sin dependencias)
scripts/                   Laboratorios SNMP/SSH, Docker Linux, compilación y PDF del informe
docs/                      Informe, guías, evidencia y etiquetas QR
__tests__/                 Pruebas de Jest
```

No guardar contraseñas, fotos personales, claves privadas ni archivos de entorno
en Git. El keystore de debug de la plantilla es solo para desarrollo.

## Entregables

- [x] Código RF01–RF08 en el repositorio
  ([GitHub](https://github.com/Ovaleiva/tp6-network-diagnostics-suite)).
  RF01 parcial por falta de un teléfono y de equipos físicos.
- [x] APK release con instrucciones de instalación
  ([Release v1.0.0](https://github.com/Ovaleiva/tp6-network-diagnostics-suite/releases/tag/v1.0.0)).
- [x] Informe técnico de SNMP, credenciales SSH y outbox.
- [x] Backend ejecutable y sincronización de extremo a extremo.
- [ ] Video: tramos grabados en el emulador (SNMP, PDF con foto y GPS,
  reconexión); falta editarlos. El descubrimiento de un equipo real de la LAN
  no se pudo mostrar.
