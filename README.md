# TP6 · Network Diagnostics Suite

Aplicación React Native para técnicos de campo, todavía en desarrollo.
La etapa 1 preparó arquitectura y navegación. La etapa 2 agrega una **búsqueda mDNS
nativa en Android**, con cancelación, resultados por IP y detalle de servicios.
RF01 es parcial: falta validar un equipo externo de la LAN y resolver la exigencia
de MAC. La etapa 3 agrega consultas SNMPv2c y un agente de laboratorio en la PC.
RF02 está en validación de laboratorio. Luego se agregaron la base local SQLite con
cola de sincronización, el registro de instalaciones con fotos y GPS (RF05) y el PDF
de instalación (RF06) y SSH con comandos predefinidos (RF03, contra un servidor de
laboratorio), probados en el emulador. RF04, RF07 y RF08 siguen pendientes. El estado detallado está en [el traspaso](docs/TRASPASO.md).

## Empezar

Abrir PowerShell en esta carpeta. En Windows puede usarse `npm.cmd` si PowerShell
bloquea `npm.ps1` por su política de ejecución.

```powershell
npx --yes pnpm@11.25.0 install --frozen-lockfile
npm run typecheck
npm run lint
npm test -- --runInBand
npm run bundle:android
```

Se usa pnpm 11.25.0 para instalar y su lockfile para fijar las versiones.
Los comandos npm run ejecutan los scripts sobre esas mismas dependencias.

El bundle comprueba la resolución de JavaScript para Android. **No compila un APK**
ni valida el enlace o funcionamiento de los módulos nativos.

Con JDK 17, Android Studio, SDK y dispositivo configurados:

```powershell
# Terminal 1: mantener Metro abierto.
npm start
# Terminal 2: compilar, instalar y abrir la aplicación.
npm run android
```

En esta PC seguir [ejecución en el emulador](docs/EMULADOR.md). Para una instalación nueva,
consultar [preparación de Windows](docs/ENTORNO.md).
La app no usa Expo Go.

Para probar SNMP sin un teléfono físico, iniciar el agente en otra terminal:

```powershell
npm.cmd run lab:snmp
```

En la app abrir **Diagnóstico**, conservar `10.0.2.2:1161`, comunidad `public`
e interfaz `1`, y pulsar **Consultar SNMP**. El agente responde como `TP6-LAB-PC`.
Sus contadores son controlados; no miden una interfaz física de la PC.
La [guía de etapa 3](docs/ETAPA_3_SNMP.md) explica el código, los OIDs y las pruebas.

Para probar SSH, iniciar el servidor de laboratorio en otra terminal:

```powershell
npm.cmd run lab:ssh
```

Muestra la huella del servidor. En la app abrir **Diagnóstico → Diagnóstico SSH**,
conservar `10.0.2.2:2222`, guardar la credencial `tecnico` / `laboratorio`,
ejecutar un comando y comparar la huella antes de confiar. El laboratorio solo
responde `uptime` e `ip -brief address` con salidas simuladas.

En Windows, los comandos android y doctor:android resuelven JDK 17 y el SDK
aunque la terminal conserve el entorno anterior. Para ver las rutas y versiones
elegidas ejecutar npm.cmd run android:env.

## Recorrido de lectura

1. [Etapa 1 explicada, bloque por bloque](docs/ETAPA_1.md).
   Continuar con [etapa 2: descubrimiento real y pruebas](docs/ETAPA_2.md).
2. [Alcance y trazabilidad RF01–RF08](docs/ALCANCE.md).
3. [Arquitectura y decisiones](docs/ARQUITECTURA.md).
4. [Pruebas y estado real de la validación](docs/VERIFICACION.md).
5. [Informe técnico inicial](docs/INFORME_TECNICO.md).
6. [Contrato del futuro backend stub](backend/README.md).

## Estructura

```text
App.tsx                    Composición de la aplicación
src/
  app/navigation/          Rutas y navegador
  core/domain/             Modelos sin dependencia de React Native
  features/
    home/                  Inicio
    discovery/             RF01: descubrimiento
    protocols/             RF02–03: contratos SNMP y SSH
    identification/        RF04: identificación y ficha
    evidence/              RF05: evidencia de instalación
    reporting/             RF06: PDF
    local-store/           Contrato de persistencia local
    sync/                  RF07: cola y sincronización
    history/               RF08: consulta de historial
  infrastructure/          Adaptador de descubrimiento Android
  specs/                   Contrato TurboModule para Codegen
  shared/                  Componentes visuales y colores
android/                   Proyecto nativo Android
ios/                       Plantilla iOS; no validada en Windows
backend/                   Contrato inicial del stub
docs/                      Guía e informe
__tests__/                 Pruebas de navegación
```

El repositorio es local. No hay remoto de Git configurado ni publicación realizada.
No guardar contraseñas, fotos personales, claves privadas ni archivos de entorno
en Git. El keystore de debug de la plantilla es solo para desarrollo.

## Entregables finales

- [ ] Código funcional RF01–RF08 y repositorio remoto.
- [ ] APK de prueba con instrucciones de instalación.
- [ ] Informe técnico de SNMP, credenciales SSH y outbox.
- [ ] Backend stub ejecutable y flujo de sincronización de extremo a extremo.
- [ ] Video con dispositivo LAN real, SNMP, PDF con foto/GPS y reconexión.

Esta lista evita confundir la base inicial con la entrega completa del TP.
