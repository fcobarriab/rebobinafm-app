# Rebobina FM para Android

Proyecto Android Studio que empaqueta la interfaz de la PWA y reproduce la señal con un servicio Android Media3. El servicio publica una biblioteca de medios para que Android Auto pueda encontrar y reproducir Rebobina FM desde su pantalla de audio.

## Abrir y ejecutar

1. Instala Android Studio y el Android SDK Platform 35.
2. Descomprime `rebobina-fm-android.zip` y abre la carpeta `android-app` en Android Studio.
3. Acepta la sincronización de Gradle y espera a que se descarguen las dependencias.
4. Ejecuta la configuración `app` en un teléfono Android o emulador con Android 6.0 o posterior. Para comprobar la radio, el dispositivo necesita conexión a Internet.
5. Para generar un APK de prueba, usa **Build > Build Bundle(s) / APK(s) > Build APK(s)**. Android Studio dejará el APK en `app/build/outputs/apk/debug/`.

## Android Auto

La app ofrece una sola emisora en su biblioteca de medios; Android Auto presenta la navegación y los controles de acuerdo con sus plantillas de audio. Prueba primero la reproducción y los metadatos en el teléfono, y luego con Android Auto o Desktop Head Unit.

La integración técnica no sustituye la revisión de Google. Para distribuirla públicamente y hacerla disponible como app de Android Auto, habrá que completar el proceso de publicación y cumplir los requisitos vigentes de Google Play y Android for Cars. Un APK de depuración sirve para probar la app en el teléfono, pero no garantiza que Android Auto la muestre.

## Alcance

La interfaz incluida se basa en `indexpwa.html`, `player.js`, `news.js` y los recursos de la PWA. La transmisión requiere Internet; el almacenamiento offline de la PWA solo conserva recursos de la interfaz, no el audio en vivo.
