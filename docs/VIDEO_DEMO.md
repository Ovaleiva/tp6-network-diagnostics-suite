# Guion del video demo

La consigna pide mostrar: descubrimiento de al menos un dispositivo real en la
LAN, una consulta SNMP exitosa, un PDF con foto y GPS, y la sincronización tras
recuperar la conectividad. Se graba en el emulador con el **APK release**
final, porque no hubo un teléfono Android disponible (ver el informe,
sección 1).

## Qué se puede mostrar y qué no

| Pedido | En el video |
| --- | --- |
| Descubrimiento en la LAN | La búsqueda mDNS (vacía en el emulador) y el barrido de rango, que encuentra el router y otros equipos reales de la LAN |
| Consulta SNMP exitosa | Contra net-snmp real (Debian en Docker): sysName, uptime y contadores de `eth0` |
| PDF con foto y GPS | Foto con la webcam de la PC y GPS simulado con `adb emu geo fix` |
| Sincronización tras recuperar conectividad | Modo avión → cambio en la cola → sin modo avión → envío automático |
| Extras | SSH con huella verificada y QR leído con la webcam |

## Preparación

1. Docker Desktop abierto y `npm.cmd run lab:linux` corriendo.
2. `npm.cmd run backend` corriendo.
3. Emulador con la webcam:
   `emulator -avd Pixel_10_Pro -no-snapshot-load -no-boot-anim -camera-back webcam1`.
4. APK release instalado: `adb install -r android/app/build/outputs/apk/release/app-release.apk`.
   - Instalado encima del debug conserva los datos: credencial SSH, huella
     y diagnósticos anteriores.
5. GPS simulado: `adb emu geo fix -64.1888 -31.4201`. Reemplazar por las
   coordenadas reales del lugar si se prefiere.
6. Sincronización con la cola vacía antes de empezar.
7. `qr-TP6-ONT-001.png` abierto en el monitor y la webcam lista para girarla
   hacia la pantalla.

## Tramos

Cada tramo es un archivo. `adb shell screenrecord` graba en negro en el
emulador con la GPU de la PC, así que se usa el grabador del emulador, que
escribe un `.webm` directo en la PC (máximo 3 minutos):

```powershell
adb emu screenrecord start --time-limit 180 C:\dev\tp6\tmp\video\tramo1.webm
adb emu screenrecord stop
```

Los diagnósticos manuales quedan en `sitio-local`, así que en el tramo 8 el
filtro por sitio no cambia la lista: lo que se muestra es que el historial
abre sin red.

| # | Pantalla | Qué hacer | Texto sugerido para la narración o un cartel | Duración |
| --- | --- | --- | --- | --- |
| 1 | Inicio | Mostrar los módulos | "Herramienta de campo offline-first: descubrimiento, SNMP, SSH, QR, evidencia, PDF y sincronización." | 10 s |
| 2 | Equipos en la red | "Buscar equipos" (mDNS, vacío en el emulador) → rango `192.168.1.1-254` → "Barrer rango" → abrir el router `192.168.1.1` | "mDNS no recibe anuncios en el emulador. El barrido de rango prueba conexiones TCP a puertos de administración de cada IP y encuentra equipos reales de la LAN. La MAC no está disponible en Android 10+." | 35 s |
| 3 | Diagnóstico | IP `10.0.2.2`, puerto `1162`, comunidad `tp6-lab`, interfaz `2` → "Consultar SNMP" | "GetRequest SNMPv2c armado con un códec BER propio y enviado por UDP. Responde net-snmp real: nombre, uptime y contadores de la interfaz." | 40 s |
| 4 | Diagnóstico SSH | Puerto `2223` → "Ejecutar uptime" y "Ejecutar interfaces" | "Comandos predefinidos por SSH. La huella del servidor se verificó antes de enviar la contraseña, que está cifrada con el Keystore." | 30 s |
| 5 | Identificar equipo | "Escanear código" → QR del monitor frente a la webcam | "El QR se lee con ML Kit sin conexión y la ficha técnica se descarga del backend y queda guardada." | 30 s |
| 6 | Instalación → Reportes | Sitio, notas, dos fotos con GPS → Guardar → "Generar PDF" → "Abrir PDF" | "La instalación se guarda en el teléfono con fotos georreferenciadas; el PDF se genera localmente." | 60 s |
| 7 | Sincronización | Activar el modo avión (`adb shell cmd connectivity airplane-mode enable`) → regenerar el PDF o guardar otra instalación → Sincronización muestra el pendiente y "Backend no disponible" → desactivar el modo avión → "Última ronda (al volver la red)… enviada(s)" | "Sin red todo queda en una cola persistente. Al volver la conexión, la app sincroniza sola, sin duplicados." | 60 s |
| 8 | Historial | Con el modo avión activado: abrir Historial, filtrar `sitio-local` y abrir "Ver detalle" de un diagnóstico SSH | "Historial por sitio y equipo, consultable sin conexión." | 25 s |

Total: unos 4 a 5 minutos.

En el emulador, el modo avión **sí** corta el backend: el emulador llega a la
PC por la red virtual, no por un cable como el teléfono con `adb reverse`.

## Edición

1. Unir los tramos en orden con Clipchamp (viene con Windows 11) u otro
   editor.
2. Agregar los textos de la tabla como carteles o narración.
3. Opcional: en el tramo 7, mostrar al lado la terminal del backend con los
   `POST /sync/actions -> 200`.
