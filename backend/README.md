# Backend stub: contrato inicial, implementación pendiente

El entregable final necesita un backend mínimo. En la etapa 1 reservamos su lugar
y acordamos el contrato; todavía no existe un servidor ejecutable ni conexión móvil.

Propuesta para la etapa de sincronización:

- `GET /health`: comprobar alcance del backend, distinto de detectar Wi-Fi.
- `GET /technical-sheets/:code`: ficha de un equipo; 404 si no existe.
- `POST /sync/actions`: acción con id estable, tipo, revisión y datos de la entidad.
  Una repetición del mismo id devuelve la misma confirmación sin duplicar datos.
  Un id repetido con distinto contenido se rechaza.
- `POST /sync/files`: carga de foto o PDF con identificador estable.
  Una URI local del teléfono no sirve como archivo accesible desde el servidor.
- Respuestas: confirmación con actionId; 409 para conflictos de revisión;
  fallos temporales reintentables, errores permanentes visibles al técnico.

El móvil conserva evidencia y acciones hasta confirmar el envío. La implementación
del stub deberá probar idempotencia, reintentos tras desconexión y conflictos.
Documentar si el stub persiste en disco o pierde su estado al reiniciarse.

Para emulador Android, el host suele ser `10.0.2.2`; en teléfono físico usar la IP
LAN de la PC. `localhost` desde el teléfono apunta al propio teléfono.
No se configura aún una URL real ni se envía información.
