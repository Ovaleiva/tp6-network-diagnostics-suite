# Etapa 1 explicada paso a paso

## 1. Leer antes de instalar

La consigna no pide una app de formularios conectados a HTTP. Pide hablar con
equipos de la LAN y conservar evidencia aun sin Internet. Eso determina dos
decisiones: compilación nativa propia y persistencia local como base del flujo.

Esta etapa deja armado el esqueleto; los ocho requisitos funcionales se implementan
en etapas posteriores. Consultar ALCANCE.md para no confundir pantallas con funciones.

## 2. Crear el proyecto

Se ejecutó desde la carpeta contenedora:

```powershell
npx @react-native-community/cli@20.2.0 init NetworkDiagnosticsSuite --version 0.88.0 --directory network-diagnostics-suite --skip-git-init
cd network-diagnostics-suite
```

npx ejecuta la CLI; init genera el proyecto. NetworkDiagnosticsSuite es el nombre
nativo (sin espacios), mientras que el directorio usa minúsculas y guiones.
--skip-git-init permite iniciar después Git con una rama explícita.
Las versiones son deliberadas: actualizar todo automáticamente puede romper
compatibilidad de módulos nativos. pnpm-lock.yaml permite repetir la instalación.

La instalación automática de la plantilla y los reintentos con npm encontraron EPERM en Windows.
Se migró a pnpm 11.25.0, se importó el lock inicial y se eligió nodeLinker hoisted.
El procedimiento reproducible usa pnpm-lock.yaml y pnpm-workspace.yaml; consultar el
registro final en VERIFICACION.md. No cambiar la política de PowerShell global:
si npm.ps1 está bloqueado, usar npm.cmd.

## 3. Incorporar navegación

```powershell
npx --yes pnpm@11.25.0 add --save-exact @react-navigation/native@7.5.1 @react-navigation/native-stack@7.21.0 react-native-screens@4.30.0 react-native-safe-area-context@5.10.1
```

native es el contenedor de navegación; native-stack administra la pila de pantallas.
screens integra las pantallas nativas y safe-area-context evita superponer contenido
con bordes y barras del teléfono. El lockfile conserva las versiones resueltas. El comando add sirve para agregar estas
dependencias desde cero; en el proyecto ya preparado ejecutar install --frozen-lockfile.

MainActivity.kt configura RNScreensFragmentFactory antes de super.onCreate para
restaurar correctamente las pantallas. El Manifest desactiva el gesto predictivo
según la guía de React Navigation consultada. Esto requiere comprobación nativa;
un test JavaScript no ejecuta Kotlin.

## 4. Entender App.tsx

```tsx
<SafeAreaProvider>
  <StatusBar barStyle="light-content" />
  <AppNavigator />
</SafeAreaProvider>
```

SafeAreaProvider comparte las medidas de los bordes seguros. StatusBar ajusta el
color del texto de la barra del sistema. AppNavigator decide qué pantalla mostrar.
No colocamos aquí escaneos ni conexiones: App sería difícil de leer y probar.

## 5. Rutas con tipos

```ts
type RootStackParamList = {
  Home: undefined;
  Devices: undefined;
  Diagnostics: {deviceId: string} | undefined;
  // ...
};
```

Cada clave es un nombre interno de pantalla. undefined indica que no exige parámetros.
Diagnóstico puede abrirse desde Inicio sin equipo o recibir el id del equipo.
El id permite consultar el repositorio local; pasar una contraseña aquí sería incorrecto.

AppNavigator crea el stack, registra cada pantalla y define títulos y colores.
NavigationContainer conserva el estado y maneja el recorrido de ida y vuelta.
Elegimos la API de componentes para que cada Screen sea visible al alumno;
la API estática también sería válida.

## 6. Componentes reutilizables y pantallas

Screen contiene SafeAreaView y ScrollView: evita recortes y permite desplazarse.
ModuleScreen recibe título, requisito, explicación y próximos pasos. No usa
servicios de red ni muestra resultados inventados.

Cada feature tiene una pantalla propia. Modificar la explicación de Equipos no
modifica Reportes. HomeScreen usa Pressable para abrir las rutas con etiquetas
accesibles; los textos escalan y el contenido se puede desplazar.

Para probarlo en dispositivo: abrir cada tarjeta, comprobar el título y volver
con Atrás. En Diagnóstico debe avisar que falta seleccionar un equipo. No debe
aparecer una lista de equipos ficticios.

## 7. Modelos: qué información existe

Device representa un equipo; Diagnostic un resultado; Installation una visita.
PhotoEvidence conserva URI y metadatos de la captura; InstallationReport referencia
el archivo PDF. Los campos opcionales usan ?: una MAC o coordenada ausente no debe
reemplazarse con un valor inventado.

OutboxAction representa trabajo pendiente y contiene id, revisión, estado e intentos.
Estos son tipos, no una base de datos. TypeScript ayuda a usar las formas correctas;
la validación de datos recibidos del exterior se implementará en los adaptadores.

## 8. Contratos: qué podrá hacer cada módulo

```ts
export interface DiscoveryService {
  discover(options: {
    siteId: string;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<Device[]>;
}
```

interface declara una capacidad sin implementarla. Promise expresa una operación
asíncrona. timeoutMs evita esperar indefinidamente y signal permitirá cancelar.
El adaptador nativo futuro cumplirá este contrato; la pantalla no necesita conocer
la biblioteca UDP o mDNS concreta.

LocalRepository exige guardar entidad + acción en la misma transacción. Si se
guardara solo la instalación y la app cerrara antes de encolarla, perderíamos el
envío pendiente. El contrato deja explícita esa condición desde el comienzo.

SnmpService y SshService solo declaran métodos. Todavía no hay paquetes binarios,
conexiones SSH ni contraseñas almacenadas. Es el límite acordado para esta etapa.

## 9. Comprobar y guardar en Git

```powershell
npm run typecheck
npm run lint
npm test -- --runInBand
npm run bundle:android
git status
```

typecheck controla tipos sin emitir archivos. lint busca problemas de código.
Los tests recorren la navegación JavaScript con sustitutos de las vistas nativas.
Metro resuelve y empaqueta los imports para Android. Ninguno demuestra que un
socket o módulo nativo funciona: para eso falta compilar e instalar Android.

Git guarda el código, los contratos y la documentación; node_modules y artefactos
generados están excluidos. El APK y video pertenecen al cierre del TP.

## 10. Fundamento que debe quedar entendido

Antes de SNMP/SSH, comprobar que el proyecto arranca en Android y que entendemos:
ruta vs pantalla, modelo vs almacenamiento real, contrato vs implementación,
LAN vs Internet y guardado local vs confirmación de sincronización.

El siguiente paso es completar el entorno Android y validar descubrimiento nativo
con un equipo real. Después explicaremos el transporte y el protocolo antes de
implementar consultas.
