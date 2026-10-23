import { Directory, File, Paths } from 'expo-file-system';

import { parsearCapitulo, serializarCapitulo } from '@/lib/frontmatter';

import {
  BASE_PORTADA,
  CARPETA_MANUSCRITO,
  CARPETA_MUNDO,
  CARPETA_NOTAS,
  CARPETA_PERSONAJES,
  FICHERO_LINEA_TEMPORAL,
  FICHERO_MANIFIESTO,
  PROYECTOS,
  RAIZ,
  ahora,
  extensionImagen,
  idEstable,
  nombreCapituloLibre,
  nombreJson,
  nombreJsonLibre,
  nombreLibre,
  nombreSeguro,
  nuevoId,
  ordenDesdeNombre,
  rutaFoto,
  rutaPortada,
  segmentos,
} from './rutas';
import type {
  Capitulo,
  Carpeta,
  GeneroProyecto,
  LineaTemporal,
  Manifiesto,
  NotaMundo,
  NotaSuelta,
  Personaje,
  Proyecto,
} from './tipos';

/**
 * Almacén local (TINTA-SPEC §5 y §6.3).
 *
 * Escritura siempre local primero: es instantánea y funciona sin red. Drive es
 * la réplica, nunca el camino crítico — si la sincronización falla, la usuaria
 * no se entera mientras escribe.
 *
 * Todo lo que se escribe aquí queda marcado como sucio para la cola de subida.
 */

// ---------------------------------------------------------------------------
// Utilidades de bajo nivel
// ---------------------------------------------------------------------------

function raiz(): Directory {
  return new Directory(Paths.document, RAIZ, PROYECTOS);
}

function dirProyecto(nombreProyecto: string): Directory {
  return new Directory(raiz(), nombreSeguro(nombreProyecto, 'Proyecto sin título'));
}

function asegurar(dir: Directory): Directory {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function leerJson<T>(fichero: File, porDefecto: T): Promise<T> {
  if (!fichero.exists) return porDefecto;
  try {
    return JSON.parse(await fichero.text()) as T;
  } catch {
    // Un fichero corrupto no debe tumbar la app: se ignora y se sigue.
    return porDefecto;
  }
}

/**
 * Cadena defensiva: estos JSON se pueden abrir y editar desde Drive, así que
 * un campo puede llegar ausente o con otro tipo y eso no puede hacer estallar
 * la pantalla que los ordena.
 */
function cadena(valor: unknown, porDefecto = ''): string {
  return typeof valor === 'string' ? valor : porDefecto;
}

/**
 * Escribe a un fichero temporal y lo mueve encima del destino.
 *
 * `write` trunca el fichero definitivo a cero y luego lo rellena: si el proceso
 * muere entre las dos cosas —o si el apagón llega antes de que la caché baje a
 * disco— lo que queda es un capítulo vacío, y no hay vuelta atrás. Con el
 * temporal, en todo momento existe una copia íntegra: la vieja o la nueva.
 */
function escribirAtomico(fichero: File, contenido: string): void {
  asegurar(fichero.parentDirectory);

  const temporal = new File(fichero.parentDirectory, `.${fichero.name}.tmp`);
  const uriTemporal = temporal.uri;
  try {
    if (temporal.exists) temporal.delete();
    temporal.create({ overwrite: true });
    temporal.write(contenido);
    temporal.moveSync(fichero, { overwrite: true });
  } catch (e) {
    // Un temporal abandonado ensuciaría la carpeta y viajaría a Drive. Se
    // borra por su uri: tras un `move` a medias, `temporal` ya no apunta ahí.
    try {
      const resto = new File(uriTemporal);
      if (resto.exists) resto.delete();
    } catch {
      // Si ni siquiera se puede limpiar, manda el error original.
    }
    throw e;
  }
}

/** JSON indentado a propósito: tiene que poder leerse a mano desde Drive. */
function escribirJson(fichero: File, valor: unknown): void {
  escribirAtomico(fichero, `${JSON.stringify(valor, null, 2)}\n`);
  marcarSucio(fichero.uri);
}

function escribirTexto(fichero: File, texto: string): void {
  escribirAtomico(fichero, texto);
  marcarSucio(fichero.uri);
}

/** Borra un fichero del proyecto y propaga el borrado a Drive. */
function retirarFichero(fichero: File): void {
  const relativa = rutaRelativa(fichero.uri);
  if (fichero.exists) fichero.delete();
  marcarLimpio(fichero.uri);
  if (relativa) marcarBorrado(relativa);
}

// ---------------------------------------------------------------------------
// Cola de subida y de borrado
// ---------------------------------------------------------------------------

/**
 * Las dos colas de sincronización, persistidas en `Tinta/cola.json` para que
 * sobrevivan a un cierre de la app con cambios sin subir:
 *
 * - `sucios`: URIs locales modificadas pendientes de subir.
 * - `borrados`: rutas relativas (desde `Tinta/Proyectos`) cuyo homólogo en
 *   Drive hay que borrar. Sin esta cola, borrar algo aquí no borraría nada
 *   allí, y la siguiente restauración lo traería de vuelta como un fantasma.
 */
const sucios = new Set<string>();
const borrados = new Set<string>();

function ficheroCola(): File {
  return new File(new Directory(Paths.document, RAIZ), 'cola.json');
}

function guardarCola(): void {
  try {
    // Atómica como todo lo demás: la durabilidad de lo que falta por subir
    // depende entera de este fichero, y se reescribe en cada guardado.
    const contenido = { sucios: [...sucios], borrados: [...borrados] };
    escribirAtomico(ficheroCola(), `${JSON.stringify(contenido, null, 2)}\n`);
  } catch {
    // Si no se puede persistir, la cola sigue viva en memoria esta sesión.
  }
}

/**
 * Se llama una vez al arrancar, antes del primer ciclo de sincronización.
 *
 * Es síncrona a propósito: con un `await` por medio, el primer ciclo podía
 * arrancar con la cola todavía vacía y lo pendiente de la sesión anterior se
 * quedaba esperando al ciclo siguiente (60 s o el próximo regreso a primer
 * plano) sin que nada lo indicara.
 */
export function cargarCola(): void {
  const f = ficheroCola();
  if (!f.exists) return;
  try {
    const datos = JSON.parse(f.textSync()) as { sucios?: string[]; borrados?: string[] };
    for (const uri of datos.sucios ?? []) sucios.add(uri);
    for (const ruta of datos.borrados ?? []) borrados.add(ruta);
  } catch {
    // Cola corrupta. Nadie reconcilia contra Drive —la fase de subida solo
    // recorre esta lista y la bajada nunca empuja—, así que se marca sucio el
    // árbol entero: sobra tráfico una vez, pero no se queda nada solo en el
    // móvil mientras la barra dice «Guardado en Drive».
    marcarArbolSucio(raiz());
  }
}

/** Ruta relativa desde `Tinta/Proyectos`, con barras normales. */
export function rutaRelativa(uri: string): string | null {
  const base = raiz().uri;
  if (!uri.startsWith(base)) return null;
  return decodeURIComponent(uri.slice(base.length)).replace(/^\/+/, '').replace(/\\/g, '/');
}

export function marcarSucio(uri: string): void {
  sucios.add(uri);
  guardarCola();
}

export function pendientesDeSubida(): string[] {
  return [...sucios];
}

export function marcarLimpio(uri: string): void {
  if (sucios.delete(uri)) guardarCola();
}

/** Apunta un borrado para propagarlo a Drive. Acepta ruta relativa. */
export function marcarBorrado(ruta: string): void {
  borrados.add(ruta);
  guardarCola();
}

export function pendientesDeBorrado(): string[] {
  return [...borrados];
}

export function confirmarBorrado(ruta: string): void {
  if (borrados.delete(ruta)) guardarCola();
}

/** Marca sucio todo el árbol bajo un directorio (tras mover o renombrar). */
function marcarArbolSucio(dir: Directory): void {
  if (!dir.exists) return;
  for (const entrada of dir.list()) {
    if (entrada instanceof Directory) marcarArbolSucio(entrada);
    else sucios.add(entrada.uri);
  }
  guardarCola();
}

/** Quita de la cola de subida todo lo que cuelgue de un prefijo de URI. */
function limpiarSuciosBajo(prefijo: string): void {
  let cambiado = false;
  for (const uri of [...sucios]) {
    if (uri.startsWith(prefijo)) {
      sucios.delete(uri);
      cambiado = true;
    }
  }
  if (cambiado) guardarCola();
}

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------

export function inicializar(): void {
  asegurar(raiz());
}

const CARPETAS_POR_DEFECTO = [
  CARPETA_MANUSCRITO,
  CARPETA_PERSONAJES,
  CARPETA_MUNDO,
  CARPETA_NOTAS,
];

const GENEROS: GeneroProyecto[] = ['novela', 'relatos', 'poemario', 'borrador', 'nuevo'];

/**
 * Rellena lo que le falte a un `manifest.json`.
 *
 * La spec invita a abrir estos ficheros desde Drive, así que uno puede volver
 * sin `modificado` o con el género cambiado a mano. Sin esto, un solo campo
 * ausente rompía el `sort` de la biblioteca y la pantalla quedaba vacía — que
 * para quien escribe se lee como «he perdido todo».
 */
function normalizarManifiesto(valor: unknown, nombreCarpeta: string): Manifiesto | null {
  if (!valor || typeof valor !== 'object') return null;
  const m = valor as Partial<Manifiesto>;

  const carpetas = Array.isArray(m.ordenCarpetas)
    ? m.ordenCarpetas.filter((c): c is string => typeof c === 'string')
    : [];

  return {
    id: cadena(m.id) || idEstable('proy', nombreCarpeta),
    // Manda el nombre de la carpeta, no el que diga el fichero: es el que sabe
    // encontrar `dirProyecto`, y si difirieran la biblioteca navegaría a un
    // proyecto que no existe.
    nombre: nombreCarpeta,
    genero: GENEROS.includes(m.genero as GeneroProyecto) ? (m.genero as GeneroProyecto) : 'nuevo',
    ordenCarpetas: carpetas.length > 0 ? carpetas : [...CARPETAS_POR_DEFECTO],
    portada: typeof m.portada === 'string' && m.portada ? m.portada : null,
    creado: cadena(m.creado, cadena(m.modificado)),
    modificado: cadena(m.modificado, cadena(m.creado)),
  };
}

export async function listarProyectos(): Promise<Manifiesto[]> {
  inicializar();
  const manifiestos: Manifiesto[] = [];

  for (const entrada of raiz().list()) {
    if (!(entrada instanceof Directory)) continue;
    const fichero = new File(entrada, FICHERO_MANIFIESTO);
    const m = normalizarManifiesto(await leerJson<unknown>(fichero, null), entrada.name);
    if (m) manifiestos.push(m);
  }

  return manifiestos.sort((a, b) => cadena(b.modificado).localeCompare(cadena(a.modificado)));
}


export function crearProyecto(nombre: string, genero: GeneroProyecto): Manifiesto {
  const momento = ahora();
  inicializar();

  // Si la carpeta ya existe se busca un nombre libre en vez de escribir dentro.
  // Antes, crear un proyecto con un nombre repetido —o con uno que colapsa al
  // mismo nombre seguro, «El sueño: parte 2» y «El sueño parte 2»— reemplazaba
  // el manifiesto del proyecto viejo: sus capítulos seguían en disco pero
  // pasaban a colgar de un proyecto que no era el suyo.
  const nombreFinal = nombreLibre(
    nombreSeguro(nombre, 'Proyecto sin título'),
    '',
    (candidato) => new Directory(raiz(), candidato).exists,
  );

  const manifiesto: Manifiesto = {
    id: nuevoId('proy'),
    // Se guarda el nombre de la carpeta, que es a donde navega la interfaz.
    nombre: nombreFinal,
    genero,
    ordenCarpetas: [...CARPETAS_POR_DEFECTO],
    portada: null,
    creado: momento,
    modificado: momento,
  };

  const dir = asegurar(new Directory(raiz(), nombreFinal));
  for (const carpeta of manifiesto.ordenCarpetas) {
    asegurar(new Directory(dir, carpeta));
  }
  escribirJson(new File(dir, FICHERO_MANIFIESTO), manifiesto);

  // La línea temporal solo se estrena si no había ninguna: sobrescribirla
  // borraría todos los sucesos de lo que hubiera antes en esta carpeta.
  const linea = new File(dir, FICHERO_LINEA_TEMPORAL);
  if (!linea.exists) {
    escribirJson(linea, { sucesos: [], modificado: momento } satisfies LineaTemporal);
  }

  return manifiesto;
}

// ---------------------------------------------------------------------------
// Capítulos
// ---------------------------------------------------------------------------

/** Fecha de modificación del fichero, en ISO. */
function fechaFichero(fichero: File): string {
  const ms = fichero.lastModified;
  if (!ms || !Number.isFinite(ms)) return ahora();
  try {
    return new Date(ms).toISOString();
  } catch {
    return ahora();
  }
}

async function leerCapituloDeFichero(fichero: File, rutaRelativa: string): Promise<Capitulo> {
  const orden = ordenDesdeNombre(fichero.name) ?? 0;
  const tituloFichero = fichero.name.replace(/^\d+\s*-\s*/, '').replace(/\.md$/i, '');

  const { meta, texto } = parsearCapitulo(await fichero.text(), {
    titulo: tituloFichero,
    estado: 'Borrador',
    orden,
    exportar: true,
    // Un capítulo cuyo frontmatter no se reconoce necesita id y fecha, y los
    // dos tienen que ser los mismos en cada lectura: con un id al azar sería un
    // capítulo distinto cada vez, y con `ahora()` como fecha empataría siempre
    // en «lo más reciente» y se llevaría el foco de «Continuar donde lo
    // dejaste» un capítulo roto.
    id: idEstable('cap', rutaRelativa),
    modificado: fechaFichero(fichero),
  });

  return { ...meta, ruta: rutaRelativa, texto };
}

/** Id del capítulo que ya vive en un `.md`, o null si no se puede saber. */
function idDeCapituloEnDisco(fichero: File): string | null {
  try {
    const { meta } = parsearCapitulo(fichero.textSync(), {
      titulo: '',
      estado: 'Borrador',
      orden: 0,
      exportar: true,
      id: '',
      modificado: '',
    });
    return meta.id || null;
  } catch {
    return null;
  }
}

/** Recorre una carpeta del manuscrito y sus subcarpetas. */
async function leerCarpeta(dir: Directory, rutaRelativa: string): Promise<Carpeta> {
  const capitulos: Capitulo[] = [];
  const subcarpetas: Carpeta[] = [];

  if (dir.exists) {
    for (const entrada of dir.list()) {
      if (entrada instanceof Directory) {
        subcarpetas.push(await leerCarpeta(entrada, `${rutaRelativa}/${entrada.name}`));
      } else if (entrada.name.toLowerCase().endsWith('.md')) {
        capitulos.push(await leerCapituloDeFichero(entrada, `${rutaRelativa}/${entrada.name}`));
      }
    }
  }

  return {
    nombre: dir.name,
    ruta: rutaRelativa,
    icono: 'folder',
    subcarpetas: subcarpetas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    capitulos: capitulos.sort((a, b) => a.orden - b.orden),
  };
}

export function guardarCapitulo(nombreProyecto: string, capitulo: Capitulo): Capitulo {
  const dir = dirProyecto(nombreProyecto);
  const partes = segmentos(capitulo.ruta);
  const carpeta = asegurar(new Directory(dir, ...partes.slice(0, -1)));

  const anterior = new File(dir, ...partes);

  // El nombre sale del orden y del título, así que dos capítulos pueden pedir
  // el mismo fichero: todos nacen «Capítulo sin título», y al subir o bajar uno
  // se renumera la parte entera y los nombres se cruzan. Si el fichero que toca
  // ya es de OTRO capítulo, se desambigua; escribir encima era perder su prosa
  // en el móvil y —porque la ruta vieja se encolaba para borrar— también en
  // Drive.
  const nombreEsperado = nombreCapituloLibre(
    capitulo.orden,
    capitulo.titulo,
    (candidato) => {
      const otro = new File(carpeta, candidato);
      if (otro.uri === anterior.uri || !otro.exists) return false;
      // Si no se puede leer de quién es, se supone que es de otro: un nombre
      // feo se arregla; un capítulo machacado, no.
      return idDeCapituloEnDisco(otro) !== capitulo.id;
    },
  );
  const destino = new File(carpeta, nombreEsperado);

  const actualizado: Capitulo = {
    ...capitulo,
    ruta: [...partes.slice(0, -1), nombreEsperado].join('/'),
    modificado: ahora(),
  };

  // Primero se escribe el destino y solo después se retira el fichero viejo. Al
  // revés, un fallo al escribir (el disco lleno es de lo más real en un móvil)
  // dejaba el capítulo sin ningún fichero y con su borrado ya persistido en la
  // cola, que en el siguiente ciclo se lo llevaba también de Drive.
  escribirTexto(
    destino,
    serializarCapitulo(
      {
        titulo: actualizado.titulo,
        estado: actualizado.estado,
        orden: actualizado.orden,
        exportar: actualizado.exportar,
        id: actualizado.id,
        modificado: actualizado.modificado,
      },
      actualizado.texto,
    ),
  );

  // Si cambió el título o el orden, el fichero se renombra: el nombre en Drive
  // debe seguir describiendo el capítulo, o deja de ser navegable a mano. Solo
  // se retira si el fichero de la ruta vieja sigue siendo de este capítulo: si
  // ahí hay otro (estado en memoria desfasado), borrarlo se llevaría su prosa,
  // aquí y en Drive. Sin id legible sí se retira: es el fichero del que venimos
  // y su texto acaba de reescribirse entero en el destino.
  if (anterior.exists && anterior.uri !== destino.uri) {
    const dueño = idDeCapituloEnDisco(anterior);
    if (dueño === null || dueño === capitulo.id) retirarFichero(anterior);
  }

  return actualizado;
}

export async function leerCapitulo(
  nombreProyecto: string,
  rutaRelativa: string,
): Promise<Capitulo | null> {
  const fichero = new File(dirProyecto(nombreProyecto), ...segmentos(rutaRelativa));
  if (!fichero.exists) return null;
  return leerCapituloDeFichero(fichero, rutaRelativa);
}

export function borrarCapitulo(nombreProyecto: string, ruta: string): void {
  retirarFichero(new File(dirProyecto(nombreProyecto), ...segmentos(ruta)));
}

// ---------------------------------------------------------------------------
// Fichas, mundo, notas y línea temporal
// ---------------------------------------------------------------------------

async function leerColeccion<T>(dir: Directory): Promise<T[]> {
  if (!dir.exists) return [];
  const salida: T[] = [];
  for (const entrada of dir.list()) {
    if (entrada instanceof Directory) continue;
    if (!entrada.name.toLowerCase().endsWith('.json')) continue;
    const valor = await leerJson<T | null>(entrada, null);
    if (valor) salida.push(valor);
  }
  return salida;
}

/** Lee un campo de texto de un JSON de colección sin cargarlo entero al modelo. */
function campoDeJson(fichero: File, campo: string): string | null {
  try {
    const valor = JSON.parse(fichero.textSync()) as Record<string, unknown>;
    return typeof valor[campo] === 'string' ? (valor[campo] as string) : null;
  } catch {
    // Un JSON ilegible no dice de quién es; quien pregunte que suponga lo peor.
    return null;
  }
}

/**
 * ¿Ese fichero existe y es de otra ficha? Si no se puede saber de quién es, se
 * responde que sí: un nombre desambiguado se arregla, una ficha machacada no.
 */
function ocupadoPorOtro(fichero: File, id: string): boolean {
  if (!fichero.exists) return false;
  return campoDeJson(fichero, 'id') !== id;
}

/**
 * El fichero se llama como el personaje (navegabilidad en Drive), así que al
 * renombrarlo hay que retirar el fichero viejo — si no, cada cambio de nombre
 * dejaría un duplicado con los datos anteriores.
 *
 * Solo se retira si de verdad es de esta ficha: desde que los nombres se
 * desambiguan, el fichero con el nombre viejo puede ser de una homónima.
 */
function retirarJsonViejo(
  dir: Directory,
  nombreViejo: string | undefined,
  nombreNuevo: string,
  id: string,
): void {
  if (!nombreViejo || nombreViejo === nombreNuevo) return;
  const viejo = new File(dir, nombreViejo);
  if (viejo.exists && campoDeJson(viejo, 'id') !== id) return;
  retirarFichero(viejo);
}

/**
 * Retira cualquier otro JSON de la carpeta con el mismo `id`.
 *
 * Mantiene la regla «un id, un fichero», que es lo que hace segura la
 * desambiguación: si una ficha vivía en «X (2).json» y el nombre «X.json»
 * queda libre, la próxima vez se guarda ahí y el fichero de antes se quedaría
 * como una segunda ficha idéntica en la lista.
 */
function retirarDuplicados(dir: Directory, id: string, conservar: string): void {
  if (!dir.exists) return;
  for (const entrada of dir.list()) {
    if (entrada instanceof Directory) continue;
    if (entrada.name === conservar) continue;
    if (!entrada.name.toLowerCase().endsWith('.json')) continue;
    if (campoDeJson(entrada, 'id') === id) retirarFichero(entrada);
  }
}

/**
 * Localiza el JSON de una ficha. El nombre se calcula a partir del título, pero
 * puede haberse desambiguado («X (2).json»): si el calculado no existe, se
 * busca por el contenido.
 */
function ficheroDeColeccion(
  dir: Directory,
  nombreCalculado: string,
  campo: string,
  valor: string,
): File | null {
  const calculado = new File(dir, nombreCalculado);
  if (calculado.exists) return calculado;
  if (!dir.exists) return null;

  for (const entrada of dir.list()) {
    if (entrada instanceof Directory) continue;
    if (!entrada.name.toLowerCase().endsWith('.json')) continue;
    if (campoDeJson(entrada, campo) === valor) return entrada;
  }
  return null;
}

export function guardarPersonaje(
  nombreProyecto: string,
  p: Personaje,
  nombreAnterior?: string,
): Personaje {
  const dir = asegurar(new Directory(dirProyecto(nombreProyecto), CARPETA_PERSONAJES));

  // Toda ficha nueva nace «Personaje sin nombre», así que dos seguidas piden el
  // mismo fichero. Nunca se escribe encima de una ficha ajena: ahí puede haber
  // aspecto, personalidad y trasfondo escritos a mano y sin copia en ningún
  // sitio.
  const nombreFichero = nombreJsonLibre(p.nombre, 'Personaje', (candidato) =>
    ocupadoPorOtro(new File(dir, candidato), p.id),
  );
  retirarJsonViejo(
    dir,
    nombreAnterior ? nombreJson(nombreAnterior, 'Personaje') : undefined,
    nombreFichero,
    p.id,
  );

  // La foto se llama como el personaje, así que un renombrado también la mueve.
  let ficha = p;
  if (p.foto && nombreAnterior && nombreAnterior !== p.nombre) {
    const rutaNueva = rutaFoto(p.nombre, extensionImagen(p.foto));
    if (rutaNueva !== p.foto) {
      const origen = new File(dirProyecto(nombreProyecto), ...segmentos(p.foto));
      if (origen.exists) {
        const destino = new File(dirProyecto(nombreProyecto), ...segmentos(rutaNueva));
        asegurar(destino.parentDirectory);
        const relativaVieja = rutaRelativa(origen.uri);
        try {
          origen.moveSync(destino);
          marcarSucio(destino.uri);
          marcarLimpio(origen.uri);
          if (relativaVieja) marcarBorrado(relativaVieja);
          ficha = { ...p, foto: rutaNueva };
        } catch {
          // Si el movimiento falla, la ficha conserva la ruta que sí existe.
        }
      }
    }
  }

  const guardada = { ...ficha, modificado: ahora() };
  escribirJson(new File(dir, nombreFichero), guardada);
  retirarDuplicados(dir, p.id, nombreFichero);
  return guardada;
}

/**
 * Copia una imagen elegida por la usuaria dentro del proyecto y devuelve su
 * ruta relativa. El original no se toca: la copia es nuestra y viaja a Drive.
 */
export function guardarFotoPersonaje(
  nombreProyecto: string,
  nombrePersonaje: string,
  origen: File,
): string {
  // El nombre del fichero elegido manda sobre su uri: en Android el selector
  // devuelve un `content://…/document/1000000034`, sin extensión a la vista.
  const extension = extensionImagen(origen.name || origen.uri);
  const relativa = rutaFoto(nombrePersonaje, extension);
  const destino = new File(dirProyecto(nombreProyecto), ...segmentos(relativa));

  const carpetaFotos = asegurar(destino.parentDirectory);
  // Se retira cualquier foto anterior de este personaje, tenga la extensión que
  // tenga: borrando solo la de la extensión nueva, sustituir un .png por un
  // .jpg dejaba el .png huérfano en el móvil y en Drive para siempre.
  const base = nombreSeguro(nombrePersonaje, 'Personaje');
  for (const entrada of carpetaFotos.list()) {
    if (entrada instanceof Directory) continue;
    if (entrada.name.replace(/\.[^.]+$/, '') !== base) continue;
    // La que se sobrescribe ahora mismo no hay que borrarla también en Drive.
    if (entrada.uri === destino.uri) entrada.delete();
    else retirarFichero(entrada);
  }
  origen.copySync(destino);

  marcarSucio(destino.uri);
  return relativa;
}

export function borrarFotoPersonaje(nombreProyecto: string, rutaRelativaFoto: string): void {
  retirarFichero(new File(dirProyecto(nombreProyecto), ...segmentos(rutaRelativaFoto)));
}

export function guardarNotaMundo(
  nombreProyecto: string,
  n: NotaMundo,
  tituloAnterior?: string,
): void {
  const dir = asegurar(new Directory(dirProyecto(nombreProyecto), CARPETA_MUNDO));
  // Igual que con las fichas: toda nota nueva nace «Nota sin título», y la
  // segunda no puede escribir encima de la descripción y las reglas de la
  // primera.
  const nombreFichero = nombreJsonLibre(n.titulo, 'Nota de mundo', (candidato) =>
    ocupadoPorOtro(new File(dir, candidato), n.id),
  );
  retirarJsonViejo(
    dir,
    tituloAnterior ? nombreJson(tituloAnterior, 'Nota de mundo') : undefined,
    nombreFichero,
    n.id,
  );
  escribirJson(new File(dir, nombreFichero), { ...n, modificado: ahora() });
  retirarDuplicados(dir, n.id, nombreFichero);
}

export function guardarNotaSuelta(nombreProyecto: string, n: NotaSuelta): void {
  const dir = asegurar(new Directory(dirProyecto(nombreProyecto), CARPETA_NOTAS));
  escribirJson(new File(dir, `${n.id}.json`), { ...n, modificado: ahora() });
}

export function guardarLineaTemporal(nombreProyecto: string, l: LineaTemporal): void {
  const dir = asegurar(dirProyecto(nombreProyecto));
  escribirJson(new File(dir, FICHERO_LINEA_TEMPORAL), { ...l, modificado: ahora() });
}

export function borrarFicheroJson(nombreProyecto: string, ruta: string): void {
  retirarFichero(new File(dirProyecto(nombreProyecto), ...segmentos(ruta)));
}

export function borrarPersonaje(nombreProyecto: string, nombre: string, foto?: string | null): void {
  const dir = new Directory(dirProyecto(nombreProyecto), CARPETA_PERSONAJES);
  const fichero = ficheroDeColeccion(dir, nombreJson(nombre, 'Personaje'), 'nombre', nombre);
  if (!fichero) return;

  // La foto se va con la ficha: si no, quedaría huérfana en Drive para siempre.
  // Quien borra solo conoce el nombre, así que si no la trae se lee de la
  // propia ficha antes de borrarla.
  const suya = foto ?? campoDeJson(fichero, 'foto');
  retirarFichero(fichero);
  if (suya) borrarFotoPersonaje(nombreProyecto, suya);
}

export function borrarNotaMundo(nombreProyecto: string, titulo: string): void {
  const dir = new Directory(dirProyecto(nombreProyecto), CARPETA_MUNDO);
  const fichero = ficheroDeColeccion(dir, nombreJson(titulo, 'Nota de mundo'), 'titulo', titulo);
  if (fichero) retirarFichero(fichero);
}

export function borrarNotaSuelta(nombreProyecto: string, id: string): void {
  borrarFicheroJson(nombreProyecto, `${CARPETA_NOTAS}/${id}.json`);
}

// ---------------------------------------------------------------------------
// Partes del manuscrito y operaciones de proyecto
// ---------------------------------------------------------------------------

export function crearParte(nombreProyecto: string, nombre: string): string {
  const seguro = nombreSeguro(nombre, 'Parte nueva');
  asegurar(new Directory(dirProyecto(nombreProyecto), CARPETA_MANUSCRITO, seguro));
  return `${CARPETA_MANUSCRITO}/${seguro}`;
}

/**
 * Renombrar una parte es mover su carpeta. Todo lo que cuelga de ella cambia de
 * ruta, así que se marca el árbol entero para resubir y se apunta el borrado de
 * la carpeta vieja en Drive.
 */
export async function renombrarParte(
  nombreProyecto: string,
  ruta: string,
  nombreNuevo: string,
): Promise<string> {
  const seguro = nombreSeguro(nombreNuevo, 'Parte nueva');
  const origen = new Directory(dirProyecto(nombreProyecto), ...segmentos(ruta));
  const destino = new Directory(dirProyecto(nombreProyecto), CARPETA_MANUSCRITO, seguro);

  if (!origen.exists || origen.uri === destino.uri) return ruta;

  // Mover sobre una carpeta que ya existe NO falla: anida el origen dentro del
  // destino. La parte movida seguiría viéndose (dentro de la otra), pero no es
  // lo que nadie ha pedido, así que con el nombre ocupado no se mueve nada y se
  // devuelve la ruta de siempre.
  if (destino.exists) return ruta;

  const uriVieja = origen.uri;
  const relativaVieja = rutaRelativa(uriVieja);
  await origen.move(destino);
  // Las colas se tocan DESPUÉS del move: si lanza, lo que estaba pendiente de
  // subir sigue en la cola en vez de quedarse huérfano y no subir nunca.
  limpiarSuciosBajo(uriVieja);
  marcarArbolSucio(destino);
  if (relativaVieja) marcarBorrado(relativaVieja);

  return `${CARPETA_MANUSCRITO}/${seguro}`;
}

export function borrarParte(nombreProyecto: string, ruta: string): void {
  const dir = new Directory(dirProyecto(nombreProyecto), ...segmentos(ruta));
  const relativa = rutaRelativa(dir.uri);
  // Vaciar la cola después del borrado: si el borrado lanza, lo que había
  // pendiente de subir sigue en la cola en vez de no subir nunca.
  if (dir.exists) dir.delete();
  limpiarSuciosBajo(dir.uri);
  if (relativa) marcarBorrado(relativa);
}

export async function renombrarProyecto(viejo: string, nuevo: string): Promise<Manifiesto | null> {
  const origen = dirProyecto(viejo);
  const destino = dirProyecto(nuevo);
  if (!origen.exists) return null;

  const manifiesto = normalizarManifiesto(
    await leerJson<unknown>(new File(origen, FICHERO_MANIFIESTO), null),
    origen.name,
  );
  if (!manifiesto) return null;

  if (origen.uri !== destino.uri) {
    // Mover una carpeta sobre otra que existe no falla: anida el proyecto
    // entero dentro del otro, donde no lo encuentra nadie —`listarProyectos`
    // solo mira el primer nivel—, y encima el manifiesto del origen pisaba el
    // del destino. Con el nombre ocupado no se toca nada y se devuelve null.
    if (destino.exists) return null;

    const uriVieja = origen.uri;
    const relativaVieja = rutaRelativa(uriVieja);
    await origen.move(destino);
    // Las colas, después del move: si lanza, lo pendiente sigue en la cola.
    limpiarSuciosBajo(uriVieja);
    marcarArbolSucio(destino);
    if (relativaVieja) marcarBorrado(relativaVieja);
  }

  // El nombre que se guarda es el de la carpeta, que puede no ser el tecleado.
  const actualizado: Manifiesto = {
    ...manifiesto,
    nombre: destino.name,
    modificado: ahora(),
  };
  escribirJson(new File(destino, FICHERO_MANIFIESTO), actualizado);
  return actualizado;
}

// ---------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------

/**
 * Retira cualquier `portada.*` del proyecto salvo `conservar`. Como con las
 * fotos de personaje: cambiar un .png por un .jpg no puede dejar el .png
 * huérfano en Drive.
 */
function retirarPortadas(dir: Directory, conservar?: string): void {
  if (!dir.exists) return;
  for (const entrada of dir.list()) {
    if (entrada instanceof Directory) continue;
    if (entrada.name.replace(/\.[^.]+$/, '') !== BASE_PORTADA) continue;
    if (entrada.uri === conservar) entrada.delete();
    else retirarFichero(entrada);
  }
}

async function reescribirManifiesto(
  dir: Directory,
  cambios: Partial<Manifiesto>,
): Promise<Manifiesto | null> {
  const fichero = new File(dir, FICHERO_MANIFIESTO);
  const manifiesto = normalizarManifiesto(await leerJson<unknown>(fichero, null), dir.name);
  if (!manifiesto) return null;
  const actualizado: Manifiesto = { ...manifiesto, ...cambios, modificado: ahora() };
  escribirJson(fichero, actualizado);
  return actualizado;
}

/**
 * Copia la imagen elegida como portada del proyecto. El original no se toca:
 * la copia es nuestra y viaja a Drive con el resto del proyecto.
 */
export async function guardarPortada(
  nombreProyecto: string,
  origen: File,
): Promise<Manifiesto | null> {
  const dir = dirProyecto(nombreProyecto);
  if (!dir.exists) return null;

  const relativa = rutaPortada(extensionImagen(origen.name || origen.uri));
  const destino = new File(dir, relativa);
  retirarPortadas(dir, destino.uri);
  origen.copySync(destino);
  marcarSucio(destino.uri);

  return reescribirManifiesto(dir, { portada: relativa });
}

/** Quita la portada personalizada: el proyecto vuelve al lomo de su género. */
export async function quitarPortada(nombreProyecto: string): Promise<Manifiesto | null> {
  const dir = dirProyecto(nombreProyecto);
  if (!dir.exists) return null;
  retirarPortadas(dir);
  return reescribirManifiesto(dir, { portada: null });
}

export function borrarProyecto(nombre: string): void {
  const dir = dirProyecto(nombre);
  const relativa = rutaRelativa(dir.uri);
  // Igual que en `borrarParte`: la cola, después del borrado.
  if (dir.exists) dir.delete();
  limpiarSuciosBajo(dir.uri);
  if (relativa) marcarBorrado(relativa);
}

// ---------------------------------------------------------------------------
// Lectura completa
// ---------------------------------------------------------------------------

export async function leerProyecto(nombreProyecto: string): Promise<Proyecto | null> {
  const dir = dirProyecto(nombreProyecto);
  if (!dir.exists) return null;

  const manifiesto = normalizarManifiesto(
    await leerJson<unknown>(new File(dir, FICHERO_MANIFIESTO), null),
    dir.name,
  );
  if (!manifiesto) return null;

  // Un solo recorrido de `Manuscrito/`: las partes con `leerCarpeta` y, en la
  // misma pasada, los capítulos sueltos de la raíz. Antes se volvía a llamar a
  // `leerCarpeta` sobre `Manuscrito/` entero para quedarse solo con los
  // sueltos, así que cada capítulo del proyecto se leía y se parseaba dos veces
  // — y esta lectura entera se repite tras cada autoguardado.
  const manuscritoDir = new Directory(dir, CARPETA_MANUSCRITO);
  const manuscrito: Carpeta[] = [];
  const sueltos: Capitulo[] = [];
  if (manuscritoDir.exists) {
    for (const entrada of manuscritoDir.list()) {
      if (entrada instanceof Directory) {
        manuscrito.push(await leerCarpeta(entrada, `${CARPETA_MANUSCRITO}/${entrada.name}`));
      } else if (entrada.name.toLowerCase().endsWith('.md')) {
        sueltos.push(await leerCapituloDeFichero(entrada, `${CARPETA_MANUSCRITO}/${entrada.name}`));
      }
    }
  }
  if (sueltos.length > 0) {
    manuscrito.unshift({
      nombre: manuscritoDir.name,
      ruta: CARPETA_MANUSCRITO,
      icono: 'folder',
      subcarpetas: [],
      capitulos: sueltos.sort((a, b) => a.orden - b.orden),
    });
  }

  return {
    manifiesto,
    manuscrito: manuscrito.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    personajes: await leerColeccion<Personaje>(new Directory(dir, CARPETA_PERSONAJES)),
    mundo: await leerColeccion<NotaMundo>(new Directory(dir, CARPETA_MUNDO)),
    // Con `cadena()`: una nota tocada a mano a la que le falte `creado` no
    // puede tumbar la pantalla entera del proyecto.
    notas: (await leerColeccion<NotaSuelta>(new Directory(dir, CARPETA_NOTAS))).sort((a, b) =>
      cadena(b.creado).localeCompare(cadena(a.creado)),
    ),
    lineaTemporal: await leerJson<LineaTemporal>(new File(dir, FICHERO_LINEA_TEMPORAL), {
      sucesos: [],
      modificado: ahora(),
    }),
  };
}

/** Ruta de la carpeta local, para depurar y para la pantalla de Ajustes. */
export function rutaLocal(): string {
  return raiz().uri;
}

/**
 * Borra TODO lo que la app guarda en este móvil: proyectos, actividad, ajustes
 * y las colas de sincronización.
 *
 * **No toca Drive.** Es deliberado y es lo que hace que esto sea seguro: Drive
 * es la verdad, el móvil solo su caché (TINTA-SPEC §1.1). Después de esto, al
 * volver a entrar con la misma cuenta las historias se descargan de nuevo.
 *
 * Vaciar también Drive sería irreversible y no tiene ningún caso de uso real
 * para quien escribe; si algún día hiciera falta, que sea otra función con otro
 * nombre y otras advertencias.
 */
export function borrarTodoLocal(): void {
  const carpeta = new Directory(Paths.document, RAIZ);
  if (carpeta.exists) carpeta.delete();

  // Las colas apuntaban a ficheros que ya no existen.
  sucios.clear();
  borrados.clear();

  inicializar();
}

/** Uri absoluto de una ruta relativa del proyecto (para pintar imágenes). */
export function uriDeRuta(nombreProyecto: string, rutaRelativaDentro: string): string {
  return new File(dirProyecto(nombreProyecto), ...segmentos(rutaRelativaDentro)).uri;
}
