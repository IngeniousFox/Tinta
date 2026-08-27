# Tinta — App de escritura de historias (Android)

> Especificación completa: diseño visual (extraído del prototipo `Tinta - App de escritura v2.dc.html` con valores exactos), stack técnico, modelo de datos, sincronización con Google Drive, autenticación, actualizaciones y flujo de desarrollo. Documento de referencia para construir — el objetivo es que al picar no haya que re-decidir nada.

---

## 1. Visión y requisito central

App Android de escritura de historias para **una sola usuaria** (la prima). Organiza proyectos de escritura (manuscrito por capítulos, fichas de personajes, notas de mundo, línea temporal, notas sueltas) con una estética cálida de papel y tinta, tema claro.

**El requisito que manda sobre todos: resiliencia de los datos.** La usuaria ya perdió una cuenta de Google y su correo de respaldo en el pasado. La app debe garantizar que sus historias sobreviven a:

1. **La destrucción o pérdida del móvil** → todo sincroniza a Google Drive; el móvil es solo caché.
2. **La pérdida de acceso** → su cuenta de Google ya quedó blindada (correo de respaldo + teléfono de una persona de confianza estable). Contexto externo a la app, pero es la pieza que hace válido apoyarse en Drive.
3. **La muerte de la propia app** → los ficheros en Drive son **visibles y legibles sin Tinta** (ver §6): si algún día la app deja de existir, las historias siguen siendo ficheros normales que se abren desde Drive/Docs.
4. **Estar sin conexión** → escritura offline como caso normal, no como excepción; sync cuando vuelva la red.

Todo lo demás (features, pantallas, estética) se subordina a esto.

---

## 2. Stack tecnológico

| Capa | Elección | Notas |
|---|---|---|
| Framework | **Expo (React Native)** + TypeScript | App nativa Android real (APK). NO es web (Next) ni hay backend propio (Nest): la app habla directo con la API de Drive. |
| Estilos | **NativeWind v4** | Tailwind para React Native — mismas clases que en AfterPlay. |
| Componentes | **React Native Reusables** | El equivalente directo de shadcn para RN: componentes copiados al proyecto, personalizables. Los básicos (button, card, dialog, input, tabs) cubren toda la app. |
| Estado servidor | **TanStack Query** | Para las operaciones contra Drive (listados, sync). Mismo modelo mental que AfterPlay. |
| Estado UI | React state / Zustand si hiciera falta | La app es pequeña; empezar sin Zustand y añadirlo solo si se echa en falta. |
| Auth | **Google Sign-In nativo** | La cuenta ya vive en el teléfono → selector del sistema, un toque, sin contraseñas. |
| Persistencia remota | **Google Drive API**, scope `drive.file` | Ver §6 y §7. Sin servidor propio: cero infraestructura que mantener, cero responsabilidad sobre sus datos en máquinas ajenas. |
| Persistencia local | Ficheros locales (FileSystem de Expo) + índice SQLite (expo-sqlite) | Local-first: se escribe siempre en local, Drive es la réplica. |
| Actualizaciones | **EAS Update** (OTA) + APK para cambios nativos | Ver §8. |
| Tipografías | Lora, Manrope, Courier Prime (Google Fonts, bundleadas con expo-font) | Ver §3.2. |
| Iconos | **Material Symbols Rounded** | Los que usa el prototipo. |

**Descartado a propósito:**
- Backend propio (NestJS o similar): convertiría al desarrollador en responsable de la infraestructura de los datos de otra persona para siempre. Drive + local elimina esa responsabilidad.
- `appDataFolder` de Drive (carpeta oculta): más "limpia" pero encierra los datos dentro de la app — si Tinta muere, las historias quedan inaccesibles. Va contra el requisito §1.3.
- Modo oscuro: descartado en esta fase (posible extra futuro).

---

## 3. Sistema de diseño visual (valores exactos del prototipo)

> Nota: el prototipo HTML incluye un marco de "teléfono" decorativo (gradiente `#3a2f2a→#241c19`, lienzo `#e9e0d4`) que NO forma parte de la app — es solo la presentación del mockup. Todo lo de abajo sí es app.

### 3.1 Paleta

**Colores de acción y significado**

| Rol | Valor | Uso |
|---|---|---|
| Vino (principal) | `#7B2D3B` | Botones primarios, FAB, capítulo activo, enlaces, selección, estado "Escribiendo ahora" |
| Vino oscuro | `#5E1F2B` | Hover/pressed, iconos de nav, extremo de gradientes vino |
| Vino muy oscuro | `#4d1b25` | Extremo profundo del gradiente de cabecera del drawer |
| Verde bosque | `#35513F` | Progreso, objetivo diario, estado Drive/offline, estado "Listo" |
| Verde texto | `#2b4234` / `#3f5c48` | Variantes de texto/acento verde en contexto |
| Marrón | `#6E5241` | Carpetas, iconos secundarios, texto de apoyo, estado "Revisado" |
| Marrón claro | `#8B7D72` | Iconografía y metadatos suaves |

**Superficies (papel)**

| Rol | Valor |
|---|---|
| Fondo de pantalla | `#FBF7F1` |
| Tarjetas | `#FFFFFF` |
| Superficies suaves | `#FDFBF7`, `#F1E9DE`, `#F2F0E6` (verde-crema), `#F7F1E8`, `#F5EFE6` |
| Bordes | `#EDE4D8` (estándar), `#E4D9CC` (más marcado) |

**Tinta (texto)**

| Rol | Valor |
|---|---|
| Titular | `#2A2320` |
| Cuerpo literario | `#3f352f` |
| Apagado / metadatos | `#9b8a7c` |
| Deshabilitado / placeholder | `#b3a597` |

**Tints translúcidos** (fondos suaves de acción): vino `rgba(123,45,59,.07/.09/.10)`, marrón `rgba(110,82,65,.08/.10)`, verde `rgba(53,81,63,.10)`, crema-sobre-vino `rgba(251,247,241,.13–.16)` (elementos dentro de la cabecera vino del drawer).

**Estados de capítulo** (puntos de color, exactos del código del prototipo):

| Estado | Color |
|---|---|
| Listo | `#35513F` |
| Revisado | `#6E5241` |
| Borrador | `#D8C9B6` |
| Escribiendo ahora | `#7B2D3B` (además, la fila lleva borde vino) |

**Lomos de proyecto**: cada proyecto tiene su pareja de colores (fondo del lomo + barra de progreso) según género; en el prototipo: verde (`#2b4234`/`#35513F`), marrón (`#5b4334`/`#6E5241`), etc. Al crear proyecto se asigna una pareja de la paleta.

### 3.2 Tipografía

- **Lora (serif)** — todo lo literario: títulos de pantalla, nombres de proyectos/capítulos, texto del editor. Escala real usada: 12–16px (nombres y fichas, denso en 13.5–15px), 20–22px (títulos de pantalla).
- **Manrope (sans)** — toda la interfaz: labels, botones, metadatos, navegación. Escala real: 10.5–14px (el grueso vive en 11–13px). Labels de sección en mayúsculas: 9.5–11.5px con `letter-spacing: .14em–.16em`.
- **Courier Prime** — opción "Máquina" del editor (19px).
- **Iconos**: Material Symbols Rounded en 15px (status bar), 20px (dentro de componentes), 24px (navegación/toolbar).

### 3.3 Formas, sombras y animación

**Radios**: 9–14px (elementos pequeños, botones, inputs), 14–20px (tarjetas), `26px 26px 0 0` (bottom sheets), `99px` (píldoras), `50%` (círculos/avatares), `4px 8px 8px 4px` (lomo de libro — el lado izquierdo menos redondeado simula el lomo).

**Sombras**:
- Tarjeta estándar: `0 1px 2px rgba(60,40,30,.05)` — casi imperceptible, el borde crema hace el trabajo.
- CTA vino / tarjeta "Continuar": `0 10px 24px rgba(94,31,43,.34)`.
- Drawer abierto: `12px 0 40px rgba(42,35,32,.22)`.
- Lomo de libro: `inset 5px 0 0 rgba(0,0,0,.25)` — la franja interior que da el efecto lomo.

**Animaciones** (keyframes del prototipo, a replicar con Reanimated o el API de RN):
- `tt-fade`: aparición de contenido — opacity 0→1 + translateY(6px)→0.
- `tt-slide`: drawer entra desde la izquierda (translateX(-100%)→0).
- `tt-up`: bottom sheets suben desde abajo (translateY(100%)→0).
- `tt-dim`: overlay oscuro fade-in.

**Táctil**: objetivos ≥ 40–44px (los botones de icono del prototipo son 40×40). Acciones de "añadir" siempre como recuadro de **borde discontinuo** (patrón consistente en toda la app: nueva ficha, nueva regla, nuevo suceso, nueva relación...).

### 3.4 Componentes con medidas

- **Drawer**: 308px de ancho, cabecera con gradiente vino (`#5E1F2B→#4d1b25`), avatar 34×34px radio 11px con inicial en Lora, nombre + email de la cuenta.
- **Anillo de objetivo diario**: círculo de 48px con el porcentaje centrado (Manrope 600 14px, verde `#35513F`) sobre disco `#F2F0E6`; anillo de progreso alrededor.
- **Lomo de proyecto**: 42×56px, radio `4px 8px 8px 4px`, sombra interior de lomo, icono centrado 20px.
- **Tarjeta "Continuar donde lo dejaste"**: fondo gradiente vino, texto crema, sombra vino profunda; muestra último capítulo + proyecto + "ayer/hace X".
- **Barra de estado de Drive**: icono `cloud_done` + "Guardado en Drive · hace 2 min" (o estado offline); presente en barra superior del proyecto, drawer (pie: "Google Drive — Tinta / Proyectos · al día") y pie del editor.

---

## 4. Estructura, navegación y pantallas

### 4.1 Navegación

- **Menú lateral (drawer, hamburguesa)**: cabecera vino con la cuenta; selector/acceso al proyecto actual; entradas: Biblioteca, Carpetas del proyecto (Manuscrito, Personajes, Mundo, Notas sueltas anidados, con contadores), Línea temporal, Buscar; tarjeta de objetivo diario; pie con estado de Drive y Ajustes.
- **Barra superior**: hamburguesa + buscador siempre. En Biblioteca: "Tinta · tu biblioteca" (sin proyecto seleccionado). Dentro de un proyecto: conmutador de proyecto con estado de guardado.
- **Selector de proyecto**: bottom sheet (radio superior 26px) con lista, check en el actual, y "Nuevo proyecto en Drive".
- **Jerarquía libre**: Proyecto → carpetas (Manuscrito con partes, Personajes, Mundo, Notas sueltas + las que cree la usuaria) → capítulos/fichas/notas. Todo renombrable tocando el nombre.

### 4.2 Pantallas (9)

1. **Biblioteca (inicio)** — saludo con nombre ("Buenas tardes, Marta."), tarjeta vino "Continuar donde lo dejaste", anillo de objetivo diario con racha ("Llevas 4 días seguidos escribiendo 🌱"), lista de proyectos (lomo + nombre + meta + barra de progreso + %), FAB "Nuevo proyecto". Ningún proyecto preseleccionado al abrir.
2. **Interior del proyecto** — acciones rápidas (Seguir escribiendo, Línea temporal), carpetas expandibles con contadores, crear carpeta/documento.
3. **Lista de capítulos** — número, título, punto de estado (colores §3.1), palabras, asa de reordenar; el activo con borde vino; "Nuevo capítulo" abre el editor vacío con estado Borrador.
4. **Editor** — toolbar: deshacer/rehacer, B/I/U, título (formatBlock), separador de escena `✦ ✦ ✦`, alineación cíclica, botón "Aa". Texto editable real en Lora. Pie: contador en vivo ("4.210 palabras · 21 min") + `offline_pin` "Disponible sin conexión". **Modo enfoque**: pantalla completa con botón visible "Salir del modo enfoque".
   - **Hoja "Aa"**: fuente (Lora / Manrope / Máquina), tamaño 14–26px, interlineado (Justo / Normal / Aire), interruptor "Ancho de página completo".
5. **Ficha de personaje** — hueco de foto (pendiente subida real), nombre, apodos como chips («La forastera», «Ada»), edad, "Aparece en N capítulos" (derivado), tarjetas: Aspecto físico, Personalidad, Trasfondo, Arco narrativo (hitos con estado + añadir), Relaciones (+ añadir), Notas libres. Todo editable al tocar.
6. **Nota de mundo** — título, etiquetas (+ añadir), descripción, "Reglas del mundo" numeradas (+ añadir), enlaces "Mencionada en" hacia capítulos.
7. **Notas sueltas** — tarjetas de ideas con fecha ("Ideas que todavía no tienen sitio"), editables, "Nueva nota".
8. **Línea temporal** — sucesos con fecha/título/descripción, punto de color por estado, enlaces a capítulos, "Añadir suceso"; sucesos aún no escritos con punto de borde discontinuo ("Lo que pasó, aunque no esté escrito todavía").
9. **Búsqueda global** — filtra en vivo capítulos, personajes, mundo y notas; resultados con tipo coloreado + fragmento.
10. **Ajustes** — accesible desde el pie del drawer. Mismo lenguaje visual que el resto (tarjetas blancas sobre papel, secciones con label en mayúsculas). Cuatro secciones:
   - **Cuenta**: tarjeta con avatar (inicial en Lora), nombre y email de la cuenta de Google conectada — siempre visible para que nunca haya duda de contra qué cuenta se está sincronizando (relevante por su historial de cuentas). Botones "Cambiar de cuenta" y "Cerrar sesión" (con aviso claro de que los datos locales no se borran y volverán a sincronizar al re-entrar).
   - **Objetivo diario**: número de palabras al día (stepper o input numérico). Alimenta el anillo de progreso de la biblioteca y la tarjeta del drawer.
   - **Google Drive**: estado de la sincronización (última vez, pendientes en cola si los hay), botón "Sincronizar ahora" (fuerza el ciclo completo), y enlace "Ver mis ficheros en Drive" que abre la carpeta `Tinta/Proyectos` en la app/web de Drive — refuerza la confianza de que sus historias existen fuera de Tinta y son suyas.
   - **Acerca de**: versión de la app y aviso de actualización disponible cuando aplique (APK nuevo en GitHub Releases, ver §8).

### 4.3 Comportamientos transversales

- Guardado automático continuo (ver §6.3), con estado siempre visible.
- Objetivo diario de palabras con anillo y racha de días.
- Todo lo creable tiene camino visible: proyecto, carpeta, documento, capítulo, ficha, relación, hito, regla, etiqueta, nota, suceso.
- Textos de fichas/mundo/notas/línea temporal se editan tocándolos directamente (sin modo edición aparte).

---

## 5. Modelo de datos

Local-first. La verdad vive en **ficheros locales** del móvil; Drive es la réplica sincronizada; un índice SQLite local acelera listados y búsqueda (regenerable desde los ficheros — es caché, no verdad).

```
Proyecto
├── manifest        (nombre, género/color de lomo, orden de carpetas)
├── Manuscrito/
│   ├── Parte I/
│   │   ├── capitulo-01  (título, estado, texto, palabras)
│   │   └── ...
│   └── Parte II/...
├── Personajes/
│   └── ficha        (nombre, apodos[], edad, secciones, arco[hitos], relaciones[], notas)
├── Mundo/
│   └── nota         (título, etiquetas[], descripción, reglas[], menciones→capítulos)
├── Notas sueltas/
│   └── nota         (texto, fecha)
└── linea-temporal   (sucesos[]: fecha, título, descripción, estado, enlaces→capítulos)
```

Derivados (nunca almacenados como verdad): palabras por capítulo/proyecto, % de progreso, "Aparece en N capítulos" (búsqueda del nombre del personaje en el manuscrito), racha de días, objetivo diario cumplido.

> **Enmienda (21-08-2026)**: el objetivo diario NO vive en el manifest de cada proyecto, como decía la
> versión original de este documento — la interfaz (§4.2.10) siempre lo trató como un único ajuste
> global, y tener N copias solo generaba incoherencias. Vive en `Tinta/ajustes.json`, local, junto
> al registro de actividad.

---

## 6. Persistencia y sincronización con Google Drive

### 6.1 Formato de ficheros — legibles sin la app (decisión de resiliencia)

- **Capítulos: Markdown (`.md`)** — el texto literario con formato ligero (negrita/cursiva/títulos/`✦ ✦ ✦`). Un fichero por capítulo. Metadatos (estado, orden) en frontmatter YAML al inicio.
- **Fichas, mundo, línea temporal, manifest: JSON legible** (indentado) — estructura que la app parsea, pero abrible y comprensible a mano.
- Razón: si Tinta desaparece, la prima abre su Drive y ve carpetas con sus capítulos en ficheros de texto legibles desde Docs o cualquier editor. Requisito §1.3 cumplido a nivel de formato, no solo de acceso.

### 6.2 Estructura en Drive

```
Mi unidad/
└── Tinta/
    └── Proyectos/
        └── <Nombre del proyecto>/
            ├── manifest.json
            ├── Manuscrito/Parte I/01 - La casa que no dormía.md
            ├── Personajes/Adela.json
            ├── Mundo/La niebla de Valdeserena.json
            ├── Notas sueltas/...
            └── linea-temporal.json
```

Carpetas y nombres de fichero espejo de la estructura de la app — navegable a mano.

### 6.3 Mecánica de sync

- **Escritura siempre local primero** (instantánea, funciona sin red). El editor guarda con debounce (~2s tras dejar de teclear) y al salir de pantalla.
- **Cola de subida**: cada fichero modificado se marca sucio; un proceso de sync lo sube a Drive cuando hay red. Reintentos con backoff si falla.
- **Conflictos: last-write-wins.** Con una sola usuaria y un solo dispositivo es suficiente; no se construye merge. (Si algún día hubiera segundo dispositivo, revisar — mismo aviso que los IDs de AfterPlay.)
- **Estado visible**: "Guardado en Drive · hace X min" / "Disponible sin conexión" / "Sincronizando..." en barra superior, drawer y pie del editor. La usuaria nunca duda de si su texto está a salvo.
- **Arranque Y vuelta al primer plano**: el chequeo "comparar timestamps locales vs Drive y bajar lo cambiado" se dispara al abrir la app **y también cada vez que vuelve del segundo plano** (evento `AppState` de React Native, `background → active`). Razón: Android puede mantener la app viva en segundo plano durante días sin un "arranque" real — sin este disparador, el chequeo de arranque podría no ejecutarse en mucho tiempo. Con él, cada vez que la usuaria vuelve a la app tras un rato, se sincroniza en ambas direcciones sin hacer nada. (Con debounce razonable: no re-chequear si el último chequeo fue hace menos de ~1 min, para no disparar en cada cambio rápido de app.)
- **Reinstalación / móvil nuevo**: login con su cuenta → la app encuentra `Tinta/Proyectos/` → restaura todo. La prueba de fuego del requisito §1.1: debe probarse explícitamente antes de entregarla.

### 6.4 Scope de Drive: `drive.file` (no `appDataFolder`)

`drive.file` da acceso solo a los ficheros que la propia app crea — suficiente, **no sensible** (sin proceso de verificación pesado de Google), y los ficheros son visibles en el Drive normal de la usuaria. Elegido frente a `appDataFolder` (oculto, app-locked) por resiliencia (§1.3).

---

## 7. Autenticación (Google)

- **Google Sign-In nativo** (la cuenta ya está en el teléfono): selector del sistema, un toque, sin contraseña. Una sola vez.
- **Configuración en Google Cloud Console** (manual, no vibecodeable — reservar un rato con calma):
  1. Crear proyecto + pantalla de consentimiento OAuth.
  2. Credencial Android con el **SHA-1 de la firma del APK** (el de EAS).
  3. Scope declarado: `drive.file` (no sensible).
  4. **Publicar la app OAuth a Producción.** Crítico: en modo "Testing", los refresh tokens caducan a los 7 días → la prima tendría que re-loguearse cada semana, lo contrario de transparente. Con scopes no sensibles, publicar es trámite ligero, sin la verificación completa.
- Tokens gestionados por la librería de Sign-In; la app nunca ve ni guarda contraseñas.

---

## 8. Distribución y actualizaciones

- **APK inicial**: build con EAS, instalación directa (sideload) — sin Google Play. Se lo instala el desarrollador en persona o se lo manda.
- **Actualizaciones OTA (EAS Update)**: todo cambio de JS/UI/lógica llega solo al abrir la app — sin reinstalar, sin tienda, invisible para ella. Cubre ~95% de los cambios futuros. Capa gratuita de Expo sobra para una usuaria.
- **Cambios nativos** (nueva librería nativa, subir versión de Expo): requieren APK nuevo → aviso dentro de la app apuntando a GitHub Releases (mismo patrón que AfterPlay) o "la próxima vez que nos veamos te lo actualizo". Serán raros.

---

## 9. Flujo de desarrollo

1. **Emulador de Android Studio** como entorno principal (sin móvil en la mano): crear dispositivo virtual **con imagen que incluya Google Play** (icono de Play en la lista — sin Play Services el Sign-In de Google falla con errores confusos). Con `npx expo start` corriendo, tecla `a` → instala y abre en el emulador. Hot reload igual que Vite/electron-vite.
2. **Fase 1 — Expo Go**: UI, editor, navegación, todo lo JS puro. Arranque inmediato.
3. **Fase 2 — Development build** (`eas build --profile development`): necesario al integrar Google Sign-In (librería nativa). Mismo flujo de QR/hot reload, con todas las librerías nativas. Se regenera solo al añadir otra librería nativa.
4. **Validación final en móvil real**: la app es 90% teclear — el teclado táctil, el scroll con el dedo y los tamaños reales no los reproduce el emulador. Probar una sesión de escritura real antes de entregar.
5. **Prueba de restauración** (§6.3): borrar la app, reinstalar, login → todo vuelve. Obligatoria antes de dársela.

---

## 10. Pendiente / fuera de alcance de esta fase

- Subida real de foto de personaje.
- Modo oscuro (descartado en esta fase; posible extra futuro).
- Exportación a EPUB/PDF (idea futura natural; el formato Markdown la deja fácil).
- Segundo dispositivo / edición simultánea (el last-write-wins actual no lo cubre; revisar si algún día pasa).

---

## 11. Exportación a PDF (añadido 21-08-2026)

No estaba en la versión original de este documento. Decisiones tomadas al implementarlo:

- **Formato**: PDF, generado con `expo-print` a partir de HTML propio (`src/exportar/html.ts`,
  función pura y con pruebas). EPUB queda para más adelante — el Markdown lo deja fácil.
- **Salto de página entre capítulos**: cada capítulo empieza en página nueva, siempre.
- **El título del capítulo se imprime automáticamente** como encabezado de su página, numerado
  («3. El nombre de Adela»). La usuaria NO tiene que escribirlo dentro del texto. Es un
  interruptor por si algún día prefiere titular a mano.
- **Partes**: con dos o más partes con contenido, cada una abre con su página de título. Con
  una sola se omite, porque sería ruido. También es interruptor.
- **Portada**: género en versalitas, título del proyecto y recuento. Automática.
- **Excluir documentos**: cada capítulo tiene `exportar` en su frontmatter. Un capítulo puede
  seguir en el manuscrito (notas de trabajo, una versión alternativa) y no salir en el PDF. Se
  cambia manteniéndolo pulsado en su lista; los excluidos se ven atenuados y con la marca
  «fuera del PDF». En el `.md` solo se escribe la línea `exportar: false` cuando aplica, para
  que un capítulo corriente no lleve metadatos de más.
- **Entrega**: se abre la hoja de compartir del sistema, con el fichero ya nombrado como el
  proyecto («El jardín de las horas muertas.pdf»). Desde ahí va a Drive, a WhatsApp o a donde
  ella quiera.

### Género «poemario»

Cuarto tipo de proyecto, con su pareja de colores propia (añil). Cambia la terminología en toda
la app: los documentos del manuscrito son **poemas**, no capítulos. Además:

- El conversor de Markdown **conserva los saltos de línea dentro del párrafo** (`<br>`), que es
  lo que necesita un verso. En prosa no cambia nada visible.
- El editor añade un botón de salto de verso, solo en poemarios.
