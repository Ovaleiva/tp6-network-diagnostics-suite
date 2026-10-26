# TP6 · Network Diagnostics Suite

Base de una aplicación React Native para técnicos de campo. Esta entrega corresponde
a la **etapa 1: alcance, arquitectura y navegación**. No implementa todavía RF01–RF08:
prepara sus pantallas, modelos y contratos. No se ejecutan escaneos ni consultas SNMP/SSH.

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

Consultar [preparación de Windows](docs/ENTORNO.md) antes de ejecutar Android.
La app no usa Expo Go.

## Recorrido de lectura

1. [Etapa 1 explicada, bloque por bloque](docs/ETAPA_1.md).
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
  infrastructure/          Adaptadores nativos futuros
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
