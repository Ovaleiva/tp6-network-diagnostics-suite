# Verificación de la etapa 1

Fecha: 26/10/2026. Este registro separa pruebas JavaScript de ejecución nativa.

## Comprobaciones iniciales

- Consigna recuperada e inspeccionada: ocho páginas, incluidos los tres diagramas.
- Imports relativos del código: todos resuelven a archivos existentes.
- AndroidManifest.xml: XML válido.
- Sintaxis de los scripts Node: válida.
- Repositorio Git local iniciado en codex/tp6-stage-1.

## Entorno nativo

`npm run doctor:android` detectó Java 8, ausencia del SDK esperado y de adb.
Por eso **no hay compilación nativa, instalación en teléfono ni APK validado**.
El código Kotlin y la integración nativa de navegación requieren ese ensayo.

## Comprobaciones de código

- Instalación completada con pnpm 11.25.0, lock importado y nodeLinker hoisted.
- TypeScript: npm run typecheck, correcto.
- ESLint: npm run lint, correcto tras declarar entornos Jest y Node.
- Formato: npm run format:check, correcto.
- Jest: 9 pruebas aprobadas (Inicio, siete destinos con regreso y parámetro deviceId).
- Metro: npm run bundle:android, bundle Android generado con 19 archivos de assets.
  El bundle es un artefacto JavaScript, no un APK.

El primer intento de npm falló con EPERM al crear directorios. Los reintentos con
npm no resolvieron el problema; se adoptó pnpm con lockfile y almacenamiento local
dentro del proyecto. Los primeros intentos de pruebas encontraron un error de caché
y necesitaron sustituir SafeAreaView nativo por View en Jest. Se corrigió la
configuración, manteniendo el navegador real en las pruebas.

Se excluyeron cachés y artefactos de Jest, Metro, ESLint y Git. El trabajo no
modificó dependencias de terceros para forzar resultados favorables.

## Prueba manual al completar el entorno

1. Instalar dependencias siguiendo README.md.
2. Ejecutar Metro con npm start y la app con npm run android.
3. Inicio debe mostrar siete tarjetas, cada una con su requisito.
4. Abrir cada tarjeta: debe mostrar el título correcto y avisar que falta implementar
   la función. Volver con botón del encabezado y Atrás de Android.
5. Girar el teléfono o recrear la Activity y comprobar que no se cierre la app.
6. Probar texto grande y desplazamiento; no debe quedar contenido inaccesible.
7. Sin Internet, recorrer las pantallas debe seguir funcionando.
   Esto solo valida navegación: **no demuestra persistencia ni cumplimiento de RF07**.

## Evidencia que todavía falta

Descubrimiento LAN real, SNMP, SSH, permisos de cámara/GPS, base local, lector,
PDF, outbox persistente, backend stub ejecutable, recuperación de sincronización,
APK autónomo y video demo. Las pantallas y contratos no reemplazan esas pruebas.
