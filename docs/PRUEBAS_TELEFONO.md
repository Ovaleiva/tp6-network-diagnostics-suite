# Pruebas con teléfono físico

Checklist para cerrar lo que el emulador no puede probar: un equipo real de la
LAN (RF01, RF02, RF03), la lectura de QR con cámara (RF04) y la evidencia para
el video demo. Se prueba el **APK release**, que es el entregable.

Marcar cada casilla al cumplirla y anotar el resultado en la tabla del final.
Si algo falla, anotar el mensaje exacto de la app y seguir con la prueba
siguiente.

## 0. Antes de empezar

### Material

- [ ] Teléfono Android 8 o superior, con cable USB de datos.
- [ ] PC y teléfono **en la misma red Wi-Fi**. Evitar redes de invitados: suelen
      aislar a los clientes y bloquear mDNS.
- [ ] Al menos un equipo en esa red para cada prueba (puede ser el mismo):

| Prueba | Sirve | Cómo comprobarlo desde la PC |
| --- | --- | --- |
| mDNS (RF01) | Impresora de red, NAS, Raspberry Pi o Linux con avahi, router que anuncie servicios | Que aparezca en "Red" del explorador de Windows o en la app de la impresora |
| SNMP (RF02) | Router o switch con SNMP v2c de solo lectura, o Linux con `snmpd` | Saber la comunidad (por ejemplo `public`) y que esté habilitado para la red local |
| SSH (RF03) | Raspberry Pi, OpenWrt o Linux con SSH | `ssh usuario@IP` funciona desde la PC |

- [ ] Las etiquetas de `docs/etiquetas/` impresas, o abiertas en la pantalla de la PC.

### Datos a anotar

- Modelo del teléfono y versión de Android (Ajustes > Acerca del teléfono).
- IP del teléfono (Ajustes > Wi-Fi > red conectada) y de cada equipo.

### Teléfono

- [ ] Activar Opciones de desarrollador (tocar 7 veces "Número de compilación")
      y **Depuración por USB**.
- [ ] Conectar por USB, aceptar la huella de la PC en el teléfono y comprobar:

```powershell
D:/Android/Sdk/platform-tools/adb.exe devices
```

Debe aparecer el teléfono como `device`, no `unauthorized`. Si también está
el emulador abierto, cerrarlo o agregar `-s <serie>` a cada comando `adb`.

### APK release para el teléfono

Compilar solo la arquitectura del teléfono (`arm64-v8a`; casi todos los
teléfonos actuales). Ocupa mucho menos disco que las cuatro.

- [ ] C: con al menos 10 GB libres.
- [ ] Metro detenido.
- [ ] Compilar en una terminal nueva desde `C:/dev/tp6`:

```powershell
Remove-Item Env:NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue
$env:GRADLE_USER_HOME = 'D:/Android/gradle-home'
$env:ANDROID_HOME = 'D:/Android/Sdk'
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a
cd ..
```

- [ ] Instalar:

```powershell
D:/Android/Sdk/platform-tools/adb.exe install -r android/app/build/outputs/apk/release/app-release.apk
```

Si responde `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, había otra compilación con
otra firma: desinstalarla con
`adb uninstall com.networkdiagnosticssuite` (borra los datos de la app) y
reinstalar.

### Backend por USB

El APK release solo permite HTTP hacia `127.0.0.1` en un teléfono (ver el
informe, 5.6). El teléfono llega a la PC por el cable con `adb reverse`.

- [ ] En una terminal, dejar corriendo: `npm.cmd run backend`.
- [ ] Reenviar el puerto: `D:/Android/Sdk/platform-tools/adb.exe reverse tcp:3000 tcp:3000`.
      Hay que repetirlo **cada vez que se reconecta el cable**.
- [ ] En la app, Sincronización > URL del backend: `http://127.0.0.1:3000` >
      "Guardar URL" > "Sincronizar ahora". Debe decir "Última ronda (manual)…
      0 enviada(s)" y el backend debe registrar `GET /health -> 200`.

> **Importante:** con el cable conectado y `adb reverse`, el modo avión
> **no corta** el backend, porque ese tráfico va por USB. Para simular "sin
> conexión" hay que activar el modo avión **y desconectar el cable**.

### Capturas

Desde la PC, sin tocar el teléfono (con `cmd /c`; PowerShell corrompe la
imagen):

```powershell
cmd /c "D:\Android\Sdk\platform-tools\adb.exe exec-out screencap -p > docs\evidencia\NOMBRE-telefono.png"
```

Para grabar video: `adb shell screenrecord /sdcard/demo.mp4` (máximo 3 min;
Ctrl+C para cortar) y después `adb pull /sdcard/demo.mp4`. También sirve la
grabación de pantalla del propio teléfono.

## 1. RF01 · Descubrimiento en la LAN

- [ ] Equipos en la red > "Buscar equipos". Si Android pide permiso para
      dispositivos cercanos o red local, aceptar.
- [ ] Aparece al menos un equipo real con su IP. Comprobar que la IP es la del
      equipo.
- [ ] Se ven los servicios anunciados (por ejemplo `_ipp._tcp.`, `_ssh._tcp.`).
- [ ] Hostname: aparece en Android 16; en versiones anteriores dice "no
      disponible". Anotar cuál.
- [ ] MAC: dice "no disponible por mDNS". Es lo esperado (ver el informe, 6.1).
- [ ] Captura: `descubrimiento-telefono.png`.

Si no aparece nada:

1. Confirmar que el equipo anuncia servicios mDNS: una impresora suele hacerlo;
   un router muchas veces no.
2. Probar con el Wi-Fi principal, no la red de invitados.
3. Anotar "búsqueda vacía": no prueba que la red esté vacía.

## 2. RF02 · SNMP a un equipo real

- [ ] En el detalle del equipo descubierto, tocar "Consultar SNMP": abre
      Diagnóstico con la IP cargada y el puerto `161`. Si el equipo no apareció en la
      búsqueda, abrir Diagnóstico desde Inicio y cambiar IP y puerto (`161`)
      a mano: por defecto trae el laboratorio (`10.0.2.2:1161`).
- [ ] Comunidad de solo lectura del equipo e índice de interfaz.
      - El índice suele ser `1` o `2`.
      - Si hay net-snmp en la PC, se puede ver la lista con
        `snmpwalk -v2c -c <comunidad> <IP> 1.3.6.1.2.1.2.2.1.2`.
- [ ] "Consultar SNMP": se ve el sysName del equipo, el uptime y los octetos.
      Comparar el nombre y el uptime con lo que muestra la web de
      administración del equipo.
- [ ] Repetir la consulta: los contadores son iguales o mayores, y el uptime
      creció.
- [ ] Comunidad incorrecta: "El dispositivo no respondió dentro del plazo de
      espera." No debe mostrar valores.
- [ ] Índice de interfaz inexistente (por ejemplo `999`): error de OID, sin
      contadores en cero.
- [ ] Captura: `snmp-telefono.png`.

## 3. RF03 · SSH a un equipo real

- [ ] Desde Diagnóstico, "Abrir diagnóstico SSH": IP del equipo, puerto `22`,
      perfil Linux (o el que corresponda).
- [ ] Antes de conectar, obtener la huella del servidor **en el equipo**.
      - Linux:
        `for f in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf "$f"; done`
      - OpenWrt (dropbear):
        `dropbearkey -y -f /etc/dropbear/dropbear_ed25519_host_key`
- [ ] Primera conexión: la huella `SHA256:…` de la app coincide con una de las
      del equipo. Confirmar.
- [ ] Contraseña incorrecta: "Usuario o contraseña incorrectos."
- [ ] Contraseña correcta:
      - `uptime` y las interfaces muestran datos reales con código 0.
      - Las interfaces deben incluir la IP del equipo.
- [ ] Historial: los diagnósticos SSH y SNMP aparecen bajo el sitio y el equipo.
- [ ] Captura: `ssh-telefono.png`.
- [ ] Opcional, si hay un Cisco o un MikroTik: probar su perfil y anotar la
      salida. Hoy figuran como "sin probar".

## 4. RF04 · QR con la cámara

- [ ] Identificar equipo > "Escanear código" > aceptar el permiso de cámara.
- [ ] Apuntar a `qr-TP6-ONT-001.png`:
      - la cámara se cierra sola;
      - el código queda `TP6-ONT-001`;
      - la ficha muestra "ONT GPON de ejemplo" y "Ficha actualizada desde el
        backend".
- [ ] Repetir con `qr-TP6-RTR-002.png`.
- [ ] Apuntar a un QR cualquiera que no sea de equipo (por ejemplo, una URL):
      - la app dice "…no es un código de equipo";
      - la cámara sigue abierta.
- [ ] Sin conexión (modo avión **y** cable desconectado): buscar `TP6-ONT-001`.
      Debe mostrar la copia guardada con su fecha.
- [ ] Captura: `qr-telefono.png`.

## 5. RF05 y RF06 · Instalación y PDF con GPS real

- [ ] Ubicación del teléfono activada. Conviene estar cerca de una ventana o
      afuera para que el GPS fije.
- [ ] Instalación: sitio, notas y dos fotos.
      - Las fotos deben quedar georreferenciadas, no "sin GPS".
      - Guardar.
- [ ] Reportes > "Generar PDF" > "Abrir PDF": se ven las notas, las coordenadas
      y las fotos derechas.
- [ ] Las coordenadas del PDF corresponden al lugar (verificarlas en un mapa).
- [ ] Captura: `pdf-telefono.png`.

## 6. RF07 · Sincronización tras recuperar conectividad

Este es el recorrido que pide el video.

1. - [ ] Con el backend y `adb reverse` activos, "Sincronizar ahora" deja la
         cola vacía.
2. - [ ] Cortar la conexión: modo avión y **desconectar el cable USB**.
3. - [ ] Hacer un cambio sin red:
         - una consulta SNMP no es posible sin red;
         - sí sirven una instalación nueva con foto o un PDF regenerado.
4. - [ ] Sincronización:
         - el cambio figura en "Pendientes";
         - la última ronda dice "Backend no disponible".
5. - [ ] Reconectar el cable y volver a correr `adb reverse tcp:3000 tcp:3000`.
         Después, desactivar el modo avión.
6. - [ ] En pocos segundos aparece "Última ronda (al volver la red)… 1
         enviada(s)" (o las que hubiera) y la cola queda vacía.
7. - [ ] En la PC, `tmp/backend/state.json` tiene la entidad nueva, y
         `tmp/backend/files/` sus archivos.
8. - [ ] Captura: `sincronizacion-telefono.png`.

Si el paso 6 no ocurre solo, puede ser que el modo avión se haya desactivado
antes de `adb reverse`. En ese caso, "Sincronizar ahora" debe enviar todo:
anotarlo.

## 7. RF08 · Historial sin red desde cero

- [ ] Cerrar la app (quitarla de recientes).
- [ ] Modo avión y cable desconectado.
- [ ] Abrir la app: Historial muestra los diagnósticos de los pasos 2 y 3 y
      filtra por sitio.

## 8. Guion del video demo

La consigna pide: descubrimiento de un equipo real, consulta SNMP exitosa, PDF
con foto y GPS, y sincronización tras recuperar conectividad. Orden sugerido,
en una sola grabación o en tramos:

1. Inicio: la app y sus módulos (5 s).
2. Equipos en la red: buscar y abrir el equipo real (paso 1).
3. Diagnóstico SNMP sobre ese equipo (paso 2). Opcional: SSH (paso 3).
4. Identificar: escanear la etiqueta QR (paso 4).
5. Instalación con foto y GPS; generar y abrir el PDF (paso 5).
6. Cortar la conexión, hacer un cambio, ver la cola pendiente, recuperar la
   conexión y ver el envío (paso 6). Mostrar el backend en la PC.
7. Historial en modo avión (paso 7).

## Resultados

Completar y pasar al informe (sección 1) y a `TRASPASO.md`.

Teléfono: ____________ · Android: ____ · Fecha: __/__/2026

| Paso | Equipo / dato | Resultado | Captura |
| --- | --- | --- | --- |
| 1 RF01 | | | |
| 2 RF02 | | | |
| 3 RF03 | | | |
| 4 RF04 | | | |
| 5 RF05/06 | | | |
| 6 RF07 | | | |
| 7 RF08 | | | |
