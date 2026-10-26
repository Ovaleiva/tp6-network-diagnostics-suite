# Informe técnico inicial · TP6

Fecha: 26/10/2026. Estado: fundamento de etapa 1, no informe final.

## Arquitectura y entorno

React Native Community CLI + TypeScript. Android primero, Nueva Arquitectura
de la plantilla. Pantallas separadas de modelos y contratos; adaptadores nativos
pendientes. Ver ARQUITECTURA.md para flujo, decisiones y bibliotecas candidatas.

## Subconjunto SNMP previsto

Según la consigna: v1/v2c, GetRequest/GetResponse sobre UDP/161, codificación y
decodificación BER/ASN.1 propias para OIDs básicos de MIB-II. Se consultarán uptime,
sysName y contadores de interfaces. Falta definir y probar el formato del resultado,
errores, límites de longitud, request-id, timeouts y contadores.

No se escribió un encoder, parser ni cliente SNMP en esta etapa. Community strings
de v1/v2c no ofrecen la seguridad de SNMPv3; limitar la práctica a la red de
laboratorio acordada y documentar ese alcance en el informe final.

## Credenciales SSH previstas

Contratos con referencias a credenciales, nunca contraseñas dentro de equipos,
rutas, outbox o logs. El adaptador deberá usar Keystore/Keychain, validar la identidad
del host y limitar comandos por vendor. La biblioteca y su compatibilidad nativa
no se han validado. No existe una sesión SSH en esta entrega.

## Cola offline prevista

Entidad y acción se guardarán en una transacción local. Un identificador estable
permitirá reintentar sin duplicar efectos en el backend. Persistir estado, intentos,
revisión y contenido exacto; recuperar envíos interrumpidos al reiniciar la app.
Separar fallos temporales de conflictos 409 y errores permanentes. Ver contrato
del backend para archivos y confirmaciones.

No hay base local ni worker implementado; no se afirma cumplimiento de RF07 aún.

## Evidencia final pendiente

Resultados de dispositivo real, pruebas de parser, errores de autenticación,
reapertura offline, fotos/GPS, inspección de PDF, recuperación tras desconexión,
APK autónomo y video. Actualizar este informe con decisiones verificadas a medida
que se implementen las etapas.
