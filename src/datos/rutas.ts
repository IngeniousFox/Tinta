/**
 * Rutas del almacén local.
 *
 * El árbol local es **espejo exacto** del de Drive (TINTA-SPEC §6.2). No es una
 * casualidad de implementación: si las dos estructuras coinciden, sincronizar
 * es un mapeo uno a uno de rutas y no hace falta ninguna tabla de equivalencias
 * que pueda desincronizarse.
 *
 *   Tinta/Proyectos/<Proyecto>/
 *     manifest.json
 *     Manuscrito/Parte I/01 - La casa que no dormía.md
 *     Personajes/Adela.json
 *     Mundo/La niebla de Valdeserena.json
 *     Notas sueltas/<id>.json
 *     linea-temporal.json
 */

export const RAIZ = 'Tinta';
export const PROYECTOS = 'Proyectos';

export const CARPETA_MANUSCRITO = 'Manuscrito';
export const CARPETA_PERSONAJES = 'Personajes';
/** Las fotos aparte, para que `Personajes/` siga siendo una lista de fichas. */
export const CARPETA_FOTOS = 'Personajes/fotos';
export const CARPETA_MUNDO = 'Mundo';
export const CARPETA_NOTAS = 'Notas sueltas';

export const FICHERO_MANIFIESTO = 'manifest.json';
export const FICHERO_LINEA_TEMPORAL = 'linea-temporal.json';

/**
 * Caracteres que no admiten Android, Windows o Drive en un nombre de fichero,
 * más el rango de control (que un editor externo puede colar al pegar texto).
 *
 * El rango va escrito con escapes y no con los bytes literales que había aquí:
 * con los bytes de verdad dentro del fichero, cualquier herramienta que lea el
 * código lo trata como binario y el guion del final parece prohibido cuando en
 * realidad es el operador del rango. El guion sí se conserva en los nombres.
 */
const PROHIBIDOS = /[/\\:*?"<>|\u0000-\u001f]/g;

/**
 * El límite de ext4 y de f2fs son 255 BYTES, no 255 caracteres: en español un
 * acento ocupa dos, y una raya o unas comillas tipográficas, tres. Se recorta
 * por lo que llegue antes de 120 puntos de código o 180 bytes, dejando sitio al
 * prefijo de orden, a la extensión y a un posible sufijo de desambiguación.
 */
const LIMITE_PUNTOS = 120;
const LIMITE_BYTES = 180;

/** Bytes que ocupa un punto de código en UTF-8. */
function bytesUtf8(punto: number): number {
  if (punto < 0x80) return 1;
  if (punto < 0x800) return 2;
  if (punto < 0x10000) return 3;
  return 4;
}

/**
 * Recorta por puntos de código, no por unidades UTF-16: partir por la mitad un
 * par suplente (un emoji) deja un nombre que ya no es UTF-8 válido, y entonces
 * lo que acaba en el disco y en Drive no es lo que la app cree tener.
 */
function recortar(texto: string): string {
  let bytes = 0;
  let puntos = 0;
  let salida = '';

  for (const caracter of Array.from(texto)) {
    const coste = bytesUtf8(caracter.codePointAt(0) ?? 0);
    if (bytes + coste > LIMITE_BYTES || puntos + 1 > LIMITE_PUNTOS) break;
    bytes += coste;
    puntos += 1;
    salida += caracter;
  }

  return salida;
}

/**
 * Convierte un título escrito por la usuaria en un nombre de fichero válido,
 * conservando acentos y eñes: el objetivo es que al abrir Drive reconozca sus
 * capítulos por el nombre, no que el nombre sea ASCII.
 */
export function nombreSeguro(titulo: string, porDefecto = 'Sin título'): string {
  const limpio = titulo
    .replace(PROHIBIDOS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows no admite nombres que terminen en punto o espacio.
    .replace(/[. ]+$/, '');

  if (limpio === '') return porDefecto;
  return recortar(limpio).replace(/[. ]+$/, '') || porDefecto;
}

/**
 * Primer nombre libre de la serie «base.ext», «base (2).ext», «base (3).ext»…
 *
 * Desambiguar es la única forma de que dos elementos que calculan el mismo
 * nombre —dos capítulos «Capítulo sin título», dos fichas todavía sin
 * renombrar— no se coman el uno al otro. Quién está ocupado lo decide quien
 * llama, que es el único que sabe que un fichero suyo no le estorba.
 */
export function nombreLibre(
  base: string,
  extension: string,
  ocupado: (candidato: string) => boolean,
): string {
  if (!ocupado(`${base}${extension}`)) return `${base}${extension}`;

  for (let n = 2; n <= 99; n += 1) {
    const candidato = `${base} (${n})${extension}`;
    if (!ocupado(candidato)) return candidato;
  }

  // Cien homónimos es absurdo, pero antes que devolver un nombre ocupado —y
  // machacar lo que hubiera dentro— vale un sufijo único aunque sea feo.
  return `${base} (${nuevoId('n')})${extension}`;
}

/** `01 - La casa que no dormía`, sin extensión. */
function baseCapitulo(orden: number, titulo: string): string {
  const prefijo = String(Math.max(0, orden)).padStart(2, '0');
  return `${prefijo} - ${nombreSeguro(titulo, 'Capítulo sin título')}`;
}

/** `01 - La casa que no dormía.md` — el prefijo mantiene el orden al listar. */
export function nombreCapitulo(orden: number, titulo: string): string {
  return `${baseCapitulo(orden, titulo)}.md`;
}

/**
 * Como `nombreCapitulo`, pero esquivando los ficheros que ya son de otro
 * capítulo: dos capítulos con el mismo nombre calculado son fáciles de tener
 * —todos nacen «Capítulo sin título»— y al renumerar una parte los nombres se
 * cruzan entre sí.
 */
export function nombreCapituloLibre(
  orden: number,
  titulo: string,
  ocupado: (candidato: string) => boolean,
): string {
  return nombreLibre(baseCapitulo(orden, titulo), '.md', ocupado);
}

/** Recupera el orden de un nombre de fichero de capítulo. */
export function ordenDesdeNombre(nombre: string): number | null {
  const m = /^(\d+)\s*-\s/.exec(nombre);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export function nombreJson(titulo: string, porDefecto: string): string {
  return `${nombreSeguro(titulo, porDefecto)}.json`;
}

/** Como `nombreJson`, esquivando los ficheros que ya son de otra ficha. */
export function nombreJsonLibre(
  titulo: string,
  porDefecto: string,
  ocupado: (candidato: string) => boolean,
): string {
  return nombreLibre(nombreSeguro(titulo, porDefecto), '.json', ocupado);
}

/** Extensiones de imagen que aceptamos; cualquier otra se guarda como .jpg. */
const EXTENSIONES_IMAGEN = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];

/** Saca la extensión de un uri de imagen, en minúsculas y con punto. */
export function extensionImagen(uri: string): string {
  const limpio = uri.split('?')[0].split('#')[0];
  const punto = limpio.lastIndexOf('.');
  if (punto === -1) return '.jpg';
  const ext = limpio.slice(punto).toLowerCase();
  return EXTENSIONES_IMAGEN.includes(ext) ? ext : '.jpg';
}

/** `Personajes/fotos/Adela Rivas.jpg` — legible al abrirlo desde Drive. */
export function rutaFoto(nombrePersonaje: string, extension: string): string {
  return `${CARPETA_FOTOS}/${nombreSeguro(nombrePersonaje, 'Personaje')}${extension}`;
}

/** Nombre base de la portada, en la raíz del proyecto junto a `manifest.json`. */
export const BASE_PORTADA = 'portada';

/** `portada.jpg` — la portada personalizada del proyecto. */
export function rutaPortada(extension: string): string {
  return `${BASE_PORTADA}${extension}`;
}

/** Tipo MIME a partir de la extensión, para subir a Drive. */
export function mimeDeImagen(extension: string): string {
  switch (extension) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.heic':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

/** Segmentos desde la raíz del almacén hasta la carpeta de un proyecto. */
export function segmentosProyecto(nombreProyecto: string): string[] {
  return [RAIZ, PROYECTOS, nombreSeguro(nombreProyecto, 'Proyecto sin título')];
}

/** Divide una ruta relativa en segmentos, ignorando vacíos. */
export function segmentos(ruta: string): string[] {
  return ruta.split('/').filter(Boolean);
}

/** Identificador corto y único, suficiente para un solo dispositivo. */
export function nuevoId(prefijo: string): string {
  const azar = Math.random().toString(36).slice(2, 8);
  return `${prefijo}-${Date.now().toString(36)}-${azar}`;
}

/** FNV-1a de 32 bits: corto, determinista y sin dependencias. */
function fnv1a(texto: string, base: number): number {
  let h = base;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Identificador derivado de una semilla (normalmente, la ruta del fichero).
 *
 * Existe para lo que se lee sin identidad propia: un `.md` cuyo frontmatter la
 * usuaria borró desde Drive no puede estrenar id en cada lectura —sería un
 * capítulo distinto cada vez para la caché y para «Continuar donde lo
 * dejaste»— y persistirlo reescribiendo el fichero convertiría una lectura en
 * una escritura (y en una subida a Drive) que nadie ha pedido.
 */
export function idEstable(prefijo: string, semilla: string): string {
  const alto = fnv1a(semilla, 0x811c9dc5);
  const bajo = fnv1a(semilla, 0x01000193);
  return `${prefijo}-${alto.toString(36)}${bajo.toString(36)}`;
}

export function ahora(): string {
  return new Date().toISOString();
}
