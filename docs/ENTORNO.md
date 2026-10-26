# Entorno Windows y Android

## Estado detectado al crear el proyecto

- Node 22.19.0 y npm 11.6.2.
- Git 2.47.0.
- java -version devuelve Java 8 (JRE 1.8.0_371).
- JAVA_HOME y ANDROID_HOME no estaban configurados.
- No se encontró adb en PATH ni SDK en la ubicación habitual.
- No se instalaron herramientas globales ni se modificaron variables del sistema.

Node satisface el engine del paquete React Native 0.88.0. El proyecto requiere
Node ^22.13.0, ^24.3.0 o >=26 según ese paquete. Para reproducir usar Node 22.19.0.
Java 8 no sirve para compilar esta plantilla. Instalar JDK 17 y Android Studio.

## Preparación manual

1. Instalar JDK 17 y configurar JAVA_HOME apuntando a su carpeta, no a bin.
   Agregar %JAVA_HOME%\\bin a PATH y reabrir la terminal.
2. Instalar Android Studio. En SDK Manager instalar las versiones que pide
   android/build.gradle: SDK Platform 37, Build Tools 37.0.0 y NDK 27.1.12297006.
   Instalar Platform Tools y Command-line Tools. Aceptar licencias.
3. Definir ANDROID_HOME con la ruta real del SDK; habitualmente
   C:\\Users\\54344\\AppData\\Local\\Android\\Sdk. Agregar su platform-tools a PATH.
   Si se usa android/local.properties con sdk.dir, no subirlo a Git.
4. Crear un emulador o habilitar depuración USB en Android físico y autorizar la PC.
   La plantilla usa minSdk 24 y targetSdk 36. Un teléfono físico será necesario
   para evaluar la LAN real; el emulador no reproduce todas las condiciones.

No copiar ciegamente el SDK mencionado en una guía genérica: Gradle de esta
plantilla es la fuente concreta para las versiones de compilación.

```powershell
node --version
java -version
javac -version
adb devices
npm run doctor:android
```

doctor:android comprueba herramientas sin instalar nada. Hasta que termine con
código 0 el entorno nativo sigue incompleto. También verificar que adb devices
muestre un equipo con estado device, no unauthorized.

## Ejecutar

En la carpeta del proyecto:

```powershell
npx --yes pnpm@11.25.0 install --frozen-lockfile
npm start
```

En otra terminal en la misma carpeta:

```powershell
npm run android
```

En teléfono USB, si Metro no es accesible:

```powershell
adb reverse tcp:8081 tcp:8081
```

## APK

```powershell
cd android
.\\gradlew.bat assembleDebug
```

Resultado esperado: android/app/build/outputs/apk/debug/app-debug.apk.
Un APK debug normalmente necesita Metro para obtener JavaScript; no sirve como
entrega autónoma offline. Para una demo sin Metro se deberá generar una variante
que incluya el bundle (por ejemplo assembleRelease, tras revisar firma/configuración).

La plantilla firma release con el keystore de debug. Eso permite un APK de prueba,
pero no es una configuración de distribución de producción. En la etapa final,
revisar firma, generar APK con JavaScript incluido, instalarlo y comprobar arranque
con Metro apagado y modo avión. No se generó un APK en la etapa 1.
