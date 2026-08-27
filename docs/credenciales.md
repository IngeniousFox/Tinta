# Credenciales y configuración externa de Tinta

Nada de este fichero es secreto: son identificadores públicos que viajan dentro del APK.
Las claves privadas (keystore) las custodia EAS y nunca tocan este repositorio.

## Identidad de la app

| Dato | Valor |
|---|---|
| Nombre de paquete Android | `com.ingeniousfox.tinta` |
| Slug de Expo | `tinta` |
| Proyecto EAS | `@andress17/tinta` |
| Project ID de EAS | `63937611-99fd-4a85-9221-d709079243e9` |

> El nombre de paquete está congelado. Cambiarlo obliga a rehacer los clientes OAuth
> y a reinstalar la app desde cero en el móvil de la usuaria.

## Google Cloud — proyecto `Tinta`

- **Drive API**: habilitada.
- **Pantalla de consentimiento**: tipo Externo, estado **En producción**.
  En modo *Prueba* los refresh tokens caducan a los 7 días; publicado, no caducan.
- **Scope**: `https://www.googleapis.com/auth/drive.file`, clasificado como **no sensible**
  (por eso no hay proceso de verificación de Google). Da acceso solo a los ficheros que crea
  la propia app — ver TINTA-SPEC §6.4.

### Clientes OAuth

| Tipo | Nombre | Para qué sirve |
|---|---|---|
| Web | `Tinta Web Client` | Su **Client ID** es el que consume la app (`webClientId`). El *client secret* no se usa en apps nativas. |
| Android | `Tinta Android (release)` | Autoriza la firma del APK. No aporta ningún valor al código. |

Client ID web: `629475390589-sbf36462ndnrunaktdhsaunlofn3tiu4.apps.googleusercontent.com`

No es secreto (viaja dentro del APK). El código lo lee de la variable de entorno
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, nunca escrito a mano en un fichero fuente.

### Huellas del certificado

| Origen | SHA-1 |
|---|---|
| Keystore de release (EAS, «Tinta release») | `96:B3:A0:1E:F8:41:B6:BD:4A:FA:C6:F7:24:E8:26:D8:48:96:1A:28` |
| Debug local (`~/.android/debug.keystore`) | PENDIENTE — no existe hasta la primera build local |

El de debug hará falta como **segundo cliente Android** para probar el Sign-In en el emulador.

## Dónde está cada cosa en la consola

La antigua «pantalla de consentimiento de OAuth» está partida en secciones bajo
**Google Auth Platform**:

| Qué buscas | Sección |
|---|---|
| Nombre, logo, emails de la app | Información de la marca |
| Externo/Interno y **Publicar aplicación** | Público |
| Scopes | Acceso a los datos |
| Client IDs | Clientes |

## Distribución

`eas.json` fuerza `buildType: apk` en los tres perfiles. Por defecto EAS genera **AAB**,
que es el formato de Google Play — inservible para el sideload que describe TINTA-SPEC §8.

## Variables de entorno y builds de EAS

`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` vive en `.env` (local, fuera de git). Eso alcanza para
desarrollo, porque el development client carga el JS desde Metro y Metro lee `.env`.

**Para las builds de EAS hace falta registrarla en el servidor**, porque EAS no recibe el `.env`
(está en `.gitignore`) y el APK saldría sin client ID, con el Sign-In roto. **Ya está hecho** en
los tres entornos (`production`, `preview`, `development`), con visibilidad *plaintext*:

```
npx eas-cli env:list production
```

Si algún día hay que cambiarla:

```
npx eas-cli env:set --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <nuevo> \
  --environment production --visibility plaintext --type string --scope project
```

Dos matices que confunden:

1. El **development build carga el JS desde Metro**, así que en desarrollo manda el `.env` local,
   no la variable de EAS. La de EAS es la que acaba dentro del APK de release.
2. **El perfil `production` NO usa el entorno `production`.** EAS resuelve el entorno por el tipo
   de distribución, no por el nombre del perfil: como nuestro `production` lleva
   `distribution: "internal"` (sideload, sin tienda — TINTA-SPEC §8), carga el entorno
   **`preview`**. Por eso la variable está registrada en los tres entornos; con ella solo en
   `production`, el APK de entrega saldría sin client ID y el Sign-In fallaría en el móvil de la
   usuaria. Se ve en la primera línea del log de la build:
   `Resolved "preview" environment for the build`.

## Actualizaciones OTA

`expo-updates` configurado con `runtimeVersion.policy = "appVersion"`: los cambios de JS
llegan solos por EAS Update al canal del perfil; un cambio de librerías nativas exige subir
la versión de la app y generar APK nuevo (TINTA-SPEC §8).
