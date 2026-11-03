# Alcance y trazabilidad

Fuente: TP6_Network_Diagnostics_Suite.pdf, ocho páginas; requisitos en página 3,
arquitectura en páginas 4–7 y entregables en página 8.

## Producto final

Una aplicación Android para descubrir equipos de una LAN, diagnosticarlos y
documentar visitas. Las visitas y el historial se guardan primero en el teléfono;
el backend recibe los cambios cuando vuelve a ser accesible.

| Requisito | Resultado final esperado | Base preparada en etapa 1 | Validación futura |
| --- | --- | --- | --- |
| RF01 | Listar equipos activos con IP y MAC; hostname si está disponible | Pantalla Equipos, Device, DiscoveryService | Encontrar un dispositivo real; distinguir escaneo vacío y error |
| RF02 | Uptime, sysName y tráfico de interfaces por SNMP | Pantalla Diagnóstico y SnmpService | GetRequest/GetResponse real, timeout, respuesta inválida |
| RF03 | SSH con comandos predefinidos | Pantalla Diagnóstico y SshService | Equipo real, credencial segura, error de autenticación |
| RF04 | QR/barras y ficha técnica remota | Pantalla Identificar y contrato | Código válido, desconocido, caché offline |
| RF05 | Instalación con fotos, GPS y notas | Pantalla Instalación y modelos de evidencia | Persistir y reabrir visita sin conexión |
| RF06 | PDF de instalación | Pantalla Reportes y ReportingService | Abrir PDF local con notas, foto y coordenadas |
| RF07 | Operación offline y sincronización diferida | Pantalla Sync, modelo outbox y contrato local transaccional | Cerrar app con cola pendiente, reabrir y sincronizar sin duplicados |
| RF08 | Historial por equipo/sitio sin Internet | Pantalla Historial y consulta del repositorio | Filtrar y consultar en modo avión |

Al terminar la etapa 1 todos los requisitos estaban pendientes de implementación
funcional. La etapa 2 incorpora descubrimiento mDNS nativo, listado por IP y detalle;
RF01 sigue parcial por la validación en LAN externa y la MAC. La etapa 3 implementa
GetRequest/Response SNMPv2c, sysName, uptime y contadores de una interfaz explícita,
con un agente controlado de PC. RF02 está en validación de laboratorio; falta
la prueba sobre un equipo de red físico. RF05 (instalación con fotos, GPS y notas)
y RF06 (PDF local con notas, fotos y coordenadas, abierto con el visor del sistema)
se probaron en el emulador; ver docs/TRASPASO.md. RF03 (SSH con credencial en el
Keystore y huella del servidor verificada) se validó contra un servidor de
laboratorio; falta un equipo real. RF08 (historial por sitio y equipo) se consultó
en modo avión con el APK release abierto sin red. RF07 (cola, reintentos,
conflictos y envío al backend de laboratorio) se probó en el emulador, también
con el APK release. RF04 leyó el QR con la cámara (webcam de la PC en el
emulador) y trajo la ficha técnica, con copia local para usarla sin red. RF02 y
RF03 también se probaron contra net-snmp y OpenSSH reales en un contenedor
Linux (`npm.cmd run lab:linux`); falta un equipo de red físico.
Disponer de un tipo o una pantalla no demuestra que un requisito funciona.
El descubrimiento también conserva el hostname resuelto que NSD devuelve en
Android API 36+; en versiones anteriores o sin respuesta se muestra no disponible.

## Etapas propuestas

1. Esta etapa: decisiones, proyecto nativo, navegación, contratos y comprobaciones.
2. Entorno Android operativo y primera integración nativa de descubrimiento,
   con un teléfono y un equipo real. Definir límites de la LAN y metadatos disponibles.
3. Explicar y validar UDP, BER/ASN.1 y subconjunto SNMP antes de implementar RF02.
   Evaluar compatibilidad del cliente SSH y credenciales antes de RF03.
4. Persistencia local e historial, lector, fotos y ubicación.
5. PDF, outbox persistente, backend stub y sincronización.
6. Prueba integral, APK, informe final y video.

La etapa 1 termina aquí. No saltar al parser binario ni al cliente SSH antes de
validar el fundamento nativo y explicar el flujo al alumno.

## Límites que deben quedar explícitos

- Offline-first significa que los registros locales funcionan sin backend. No permite
  consultar un router si el teléfono no tiene acceso a su LAN.
- La primera consulta de una ficha remota no puede completarse sin conectividad
  si nunca se descargó. Mostrarlo, conservar el código y permitir reintentar.
- mDNS descubre servicios anunciados, no todos los hosts de una subred. Un equipo
  que no anuncia servicios puede no aparecer con ese método.
- Un sondeo TCP no equivale a ARP ni identifica siempre una MAC. La disponibilidad
  de MAC y los permisos de descubrimiento deberán validarse en Android real.
  La consigna solicita MAC: que el modelo permita un dato aún desconocido no elimina\n  esa exigencia. Validar un método viable antes de cerrar RF01; si la plataforma\n  impide obtenerla, documentar la limitación y acordarla con la cátedra. No dar\n  RF01 por cumplido solo por encontrar servicios mDNS.
- SNMP final se limitará a v1/v2c, GetRequest/GetResponse y OIDs básicos. SNMPv3
  queda fuera del subconjunto propuesto por la consigna.
- El resultado de diagnóstico deberá conservar datos estructurados de OIDs y
  comandos; el modelo inicial con summary se ampliará al definir esos formatos.
- El stack del PDF es sugerido. La elección de cada biblioteca nativa necesita
  comprobar mantenimiento, compatibilidad y compilación antes de incorporarla.

Los casos de uso del PDF también enlazan descubrimiento con consulta SNMP inicial,
y registro de instalación con generación de PDF y encolado. Esas conexiones se
implementarán después de validar sus servicios; no están activas en esta etapa.

Actualización 03/11/2026: RF01 agrega un barrido TCP de rango (sección 6.1 del
informe técnico). Desde el emulador encontró el router y otros equipos reales de
la LAN `192.168.1.0/24`, con IP y puertos abiertos. La MAC sigue sin poder
obtenerse en Android 10+; la limitación está documentada y conviene confirmarla
con la cátedra.
