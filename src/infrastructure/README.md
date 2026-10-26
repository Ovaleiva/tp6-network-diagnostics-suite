# Adaptadores nativos (a implementar)

Esta carpeta contendrá implementaciones de los contratos de `src/features`.
Por ejemplo, un adaptador UDP implementará `SnmpService` y uno de WatermelonDB
implementará `LocalRepository`. Una interfaz TypeScript no implementa esas funciones.

No importar sockets, base de datos, cámara ni credenciales desde las pantallas.
Instalar cada biblioteca al validar su función y su compatibilidad con la Nueva
Arquitectura y la versión de React Native fijada en este repositorio.

Las pantallas de la etapa 1 no instancian servicios falsos ni generan resultados.
