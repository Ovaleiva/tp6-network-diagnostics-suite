# Backend de laboratorio

Servidor Node sin dependencias (`server.cjs`) que recibe la sincronización de la
app (RF07) y sirve las fichas técnicas (RF04). Es un stub para el TP: escucha
solo en `127.0.0.1` y no tiene autenticación.

```powershell
npm.cmd run backend              # puerto 3000
node backend/server.cjs --port 3100
npm.cmd run test:backend         # pruebas con node --test
```

Desde el emulador se llega en `http://10.0.2.2:3000`. En un teléfono por cable,
`adb reverse tcp:3000 tcp:3000` y `http://127.0.0.1:3000`. `localhost` desde el
teléfono apunta al propio teléfono.

## Endpoints

- `GET /health`: la app lo consulta antes de enviar. Tener Wi-Fi no alcanza.
- `GET /technical-sheets/:code`: ficha de `TP6-ONT-001` o `TP6-RTR-002`; 404
  para otro código.
- `POST /sync/files`: foto (JPEG) o PDF en base64 con su SHA-256, hasta 20 MB.
  Un `fileId` repetido con el mismo contenido se confirma sin duplicar; con
  otro contenido se rechaza (422).
- `POST /sync/actions`: acción con id estable, tipo, revisión y entidad. El
  mismo `actionId` con el mismo contenido devuelve la misma confirmación; con
  otro contenido, 422. Una revisión menor que la guardada, o la misma con otro
  contenido, es un conflicto (409). Los archivos referenciados deben haberse
  subido antes (422 si falta alguno).

## Estado

Se guarda en disco, en `tmp/backend/state.json` y `tmp/backend/files/`, así que
sobrevive a los reinicios. Para empezar de cero, borrar `tmp/backend` con el
servidor detenido. El estado no contiene rutas locales del teléfono, contraseñas
ni la comunidad SNMP.

La sección 5 del [informe técnico](../docs/INFORME_TECNICO.md) explica la cola
de la app y este contrato.
