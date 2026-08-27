import { Directory, File, Paths } from 'expo-file-system';

import {
  confirmarBorrado,
  marcarLimpio,
  marcarSucio,
  pendientesDeBorrado,
  pendientesDeSubida,
  rutaRelativa,
} from '@/datos/almacen';
import { PROYECTOS, RAIZ, extensionImagen, mimeDeImagen } from '@/datos/rutas';

import {
  ErrorDrive,
  type FicheroDrive,
  MIME_CARPETA,
  aPapelera,
  asegurarCarpeta,
  buscarCarpetaRaiz,
  buscarEnCarpeta,
  descargarBinario,
  descargarTexto,
  listarCarpeta,
  subirBinario,
  subirTexto,
} from './api';

/**
 * Sincronización con Drive (TINTA-SPEC §6.3).
 *
 * Reglas que gobiernan todo lo de abajo:
 *
 * 1. **Local primero.** Nada de esto está en el camino crítico de escribir. Si
 *    falla, la usuaria no se entera hasta que mira el indicador.
 * 2. **Gana el más reciente.** Con una usuaria y un dispositivo no hace falta
 *    fusionar; construir un merge sería complejidad sin caso de uso. Si algún
 *    día hay un segundo dispositivo, hay que revisar esta decisión.
 * 3. **Reintento con espera creciente** en fallos transitorios, y rendirse en
 *    los permanentes en vez de machacar la API.
 */

/** Quien sabe conseguir un token válido. Lo implementa la capa de Sign-In. */
export type ProveedorToken = {
  /** Token de acceso vigente; renueva por dentro si hace falta. */
  token(): Promise<string>;
  /** Fuerza renovación tras un 401. */
  renovar(): Promise<string>;
};

/**
 * Un fallo del ciclo, ya clasificado.
 *
 * El tipo va aquí y no se adivina después leyendo el mensaje: los mensajes
 * llevan dentro el nombre del fichero, y basta un capítulo llamado «Alfredo»
 * —o «la pared»— para que un rechazo de Drive pareciera un problema de red.
 */
export type ErrorSync = {
  /** Frase lista para enseñar, con la ruta que falló. */
  mensaje: string;
  /** Un fallo de red se arregla solo; una respuesta de Drive puede no hacerlo. */
  esRed: boolean;
};

export type ResultadoSync = {
  subidos: number;
  bajados: number;
  errores: ErrorSync[];
};

/** Caché de rutas → id de carpeta en Drive, para no re-consultar en bucle. */
const carpetas = new Map<string, string>();

function raizLocal(): Directory {
  return new Directory(Paths.document, RAIZ, PROYECTOS);
}

/**
 * Devuelve el id de la carpeta de Drive correspondiente a una ruta relativa,
 * creando por el camino lo que falte.
 */
async function carpetaPara(token: string, ruta: string): Promise<string> {
  const cacheada = carpetas.get(ruta);
  if (cacheada) return cacheada;

  const partes = ruta.split('/').filter(Boolean);

  let actual = carpetas.get('') ?? '';
  if (!actual) {
    const tinta = await asegurarCarpeta(token, RAIZ);
    const proyectos = await asegurarCarpeta(token, PROYECTOS, tinta.id);
    actual = proyectos.id;
    carpetas.set('', actual);
  }

  let acumulada = '';
  for (const parte of partes) {
    acumulada = acumulada ? `${acumulada}/${parte}` : parte;
    const conocida = carpetas.get(acumulada);
    if (conocida) {
      actual = conocida;
      continue;
    }
    const carpeta = await asegurarCarpeta(token, parte, actual);
    carpetas.set(acumulada, carpeta.id);
    actual = carpeta.id;
  }

  return actual;
}

/**
 * ¿Es un fallo de red y no una respuesta de Drive?
 *
 * `fetch` no lanza `ErrorDrive` cuando ni siquiera llega a conectar: lanza un
 * `TypeError` con «Network request failed» o similar. Antes eso se propagaba
 * sin reintentar, y bastaba un tropiezo de red para dar la sincronización por
 * perdida — algo que en un móvil pasa constantemente: un túnel, un ascensor,
 * el salto de wifi a datos.
 */
function esFalloDeRed(e: unknown): boolean {
  if (e instanceof ErrorDrive) return false;
  const mensaje = (e as Error)?.message ?? '';
  return /network|failed to (connect|fetch)|timeout|timed out|ECONN|unreachable|SSL|socket/i.test(
    mensaje,
  );
}

/** ¿Drive dice que eso ya no existe? (id borrado a mano desde la web). */
function esNoEncontrado(e: unknown): boolean {
  return e instanceof ErrorDrive && e.estado === 404;
}

/**
 * Envuelve una excepción del ciclo en un error que el indicador sepa leer. La
 * clasificación se hace aquí, junto al `catch`, que es el único sitio donde se
 * conoce de verdad qué falló.
 */
function comoErrorSync(prefijo: string, e: unknown): ErrorSync {
  const mensaje = (e as Error)?.message ?? String(e);
  return { mensaje: `${prefijo}: ${mensaje}`, esRed: esFalloDeRed(e) };
}

async function conReintentos<T>(
  proveedor: ProveedorToken,
  operacion: (token: string) => Promise<T>,
  intentos = 4,
): Promise<T> {
  let token = await proveedor.token();
  let ultimo: unknown;

  for (let i = 0; i < intentos; i += 1) {
    try {
      return await operacion(token);
    } catch (e) {
      ultimo = e;

      if (e instanceof ErrorDrive) {
        if (e.esAutenticacion && i === 0) {
          token = await proveedor.renovar();
          continue;
        }
        if (e.esTransitorio && i < intentos - 1) {
          await esperar(2 ** i * 1000);
          continue;
        }
        throw e;
      }

      // Fallo de red: se reintenta igual que un 5xx. Cualquier otra cosa es un
      // error de programación y debe salir a la luz, no quedarse en un bucle.
      if (esFalloDeRed(e) && i < intentos - 1) {
        await esperar(2 ** i * 1000);
        continue;
      }
      throw e;
    }
  }

  throw ultimo instanceof Error ? ultimo : new ErrorDrive('Se agotaron los reintentos', 0);
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------

/** Índice de ficheros ya subidos: ruta relativa → id en Drive. */
const idsRemotos = new Map<string, string>();

/**
 * Ruta relativa → `modifiedTime` que Drive devolvió la última vez que ese
 * fichero pasó por aquí, subiendo o bajando.
 *
 * Sirve para no rebotar: el `modifiedTime` que el servidor pone al recibir un
 * fichero es por fuerza posterior al mtime local del que se acaba de escribir,
 * así que sin este índice todo lo recién subido «ganaría» por fecha y se
 * volvería a bajar encima en el mismo ciclo.
 */
const mtimesRemotos = new Map<string, string>();

/** Las fotos son lo único que no es texto; todo lo demás sí lo es. */
function esImagen(nombre: string): boolean {
  return /\.(jpe?g|png|webp|heic)$/i.test(nombre);
}

function mimeDe(nombre: string): string {
  if (nombre.endsWith('.md')) return 'text/markdown';
  if (esImagen(nombre)) return mimeDeImagen(extensionImagen(nombre));
  return 'application/json';
}

async function subirUno(proveedor: ProveedorToken, uri: string): Promise<void> {
  const relativa = rutaRelativa(uri);
  if (!relativa) return;

  const fichero = new File(uri);
  if (!fichero.exists) {
    marcarLimpio(uri);
    return;
  }

  const partes = relativa.split('/');
  const nombre = partes.pop() as string;
  const carpeta = partes.join('/');
  const binario = esImagen(nombre);

  // Leer antes de entrar en los reintentos: si el token caduca a mitad, se
  // reintenta la subida, no la lectura del disco. La versión leída se apunta
  // para saber al final si sigue siendo la misma.
  const versionLeida = fichero.lastModified;
  const contenido = binario ? await fichero.base64() : await fichero.text();

  await conReintentos(proveedor, async (token) => {
    const padre = await carpetaPara(token, carpeta);
    let id = idsRemotos.get(relativa);

    if (!id) {
      const remotos = await listarCarpeta(token, padre);
      const encontrado = remotos.find((f) => f.name === nombre && f.mimeType !== MIME_CARPETA);
      if (encontrado) id = encontrado.id;
    }

    const enviar = (destino: string | undefined): Promise<FicheroDrive> =>
      binario
        ? subirBinario(token, {
            id: destino,
            nombre,
            padre,
            base64: contenido,
            mimeType: mimeDe(nombre),
          })
        : subirTexto(token, { id: destino, nombre, padre, contenido, mimeType: mimeDe(nombre) });

    let subido: FicheroDrive;
    try {
      try {
        subido = await enviar(id);
      } catch (e) {
        if (!id || !esNoEncontrado(e)) throw e;
        // El PATCH sobre un id que Drive dice no conocer significa que ese
        // fichero ya no está allí (ella lo borró a mano desde la web). El id
        // cacheado es basura: se olvida y se crea de cero. Sin esto, el
        // capítulo se reintentaba con el mismo id muerto ciclo tras ciclo y no
        // volvía a subir en toda la sesión.
        idsRemotos.delete(relativa);
        id = undefined;
        subido = await enviar(undefined);
      }
    } catch (e) {
      // Sin ningún id de fichero en juego, un 404 solo puede venir de la
      // carpeta padre: el id que tenemos cacheado apunta a algo que ya no
      // existe. Se olvidan las rutas —no hay forma de saber qué eslabón de la
      // cadena murió— para que el siguiente intento las resuelva y las cree.
      if (!id && esNoEncontrado(e)) carpetas.clear();
      throw e;
    }

    idsRemotos.set(relativa, subido.id);
    mtimesRemotos.set(relativa, subido.modifiedTime);
  });

  // Si escribió mientras esto subía —el ciclo arranca justo al volver la app a
  // primer plano, que es cuando ella retoma el capítulo—, lo que hay en Drive
  // ya no es lo último. Dejarlo sucio para el ciclo siguiente en vez de dar por
  // saldada una versión que nunca llegó a subirse.
  if (fichero.lastModified === versionLeida) marcarLimpio(uri);
}

// ---------------------------------------------------------------------------
// Bajada
// ---------------------------------------------------------------------------

/** Lo que la bajada necesita saber además del árbol remoto que va recorriendo. */
type ContextoBajada = {
  proveedor: ProveedorToken;
  /**
   * URIs que siguen esperando subida. Lo local pendiente no se pisa jamás: esa
   * versión solo existe en este móvil, así que la de Drive es forzosamente
   * anterior aunque las fechas digan otra cosa.
   */
  sucios: Set<string>;
  /** Los tropiezos que no tumban el recorrido pero hay que contar. */
  errores: ErrorSync[];
};

/**
 * ¿Se puede usar este nombre de Drive como nombre de fichero local?
 *
 * Drive no es un sistema de ficheros: admite barras, `..` y caracteres de
 * control dentro de un nombre. Concatenar eso a la ruta local inventaría
 * carpetas fantasma o escribiría fuera de `Tinta/Proyectos`, y el espejo
 * dejaría de serlo. Mejor no bajar ese fichero y decirlo.
 */
function nombreUsable(nombre: string): boolean {
  if (!nombre || nombre === '.' || nombre === '..') return false;
  if (nombre.includes('/') || nombre.includes('\\')) return false;
  return ![...nombre].some((c) => c.charCodeAt(0) < 32);
}

/** Recorre Drive comparando fechas y trae lo que allí sea más nuevo. */
async function bajarCambios(
  ctx: ContextoBajada,
  idCarpeta: string,
  rutaLocal: string,
): Promise<number> {
  const remotos = await conReintentos(ctx.proveedor, (token) => listarCarpeta(token, idCarpeta));
  let bajados = 0;

  for (const remoto of remotos) {
    if (!nombreUsable(remoto.name)) {
      ctx.errores.push({
        mensaje: `Hay algo en Drive con un nombre que este móvil no puede reproducir: «${remoto.name}»`,
        esRed: false,
      });
      continue;
    }

    if (remoto.mimeType === MIME_CARPETA) {
      const sub = `${rutaLocal}/${remoto.name}`;
      carpetas.set(sub.replace(/^\/+/, ''), remoto.id);
      bajados += await bajarCambios(ctx, remoto.id, sub);
      continue;
    }

    if (await bajarSiEsMasNuevo(ctx, remoto, rutaLocal)) bajados += 1;
  }

  return bajados;
}

async function bajarSiEsMasNuevo(
  ctx: ContextoBajada,
  remoto: FicheroDrive,
  rutaLocal: string,
): Promise<boolean> {
  const relativa = `${rutaLocal}/${remoto.name}`.replace(/^\/+/, '');
  const destino = new File(raizLocal(), ...relativa.split('/'));

  // Si el remoto sigue siendo exactamente el que nos consta, no hay nada nuevo
  // que traer: es lo que nosotros mismos subimos o bajamos.
  if (mtimesRemotos.get(relativa) === remoto.modifiedTime) return false;

  if (destino.exists) {
    // Gana lo local: está pendiente de subir, o sea que Drive todavía no tiene
    // esa prosa. Bajar encima la borraría del único sitio donde existe.
    if (ctx.sucios.has(destino.uri)) return false;

    // `lastModified` ya viene en milisegundos desde la época. El `* 1000` que
    // había aquí ponía el fichero local en el año 58.000, así que lo local
    // ganaba siempre y la mitad «bajada» del ciclo no corría nunca.
    const localMs = destino.lastModified ?? 0;
    const remotoMs = new Date(remoto.modifiedTime).getTime();
    // Un segundo de margen: los relojes y las precisiones no coinciden exactas.
    if (localMs >= remotoMs - 1000) return false;
  }

  const binario = esImagen(remoto.name);
  const contenido = await conReintentos(ctx.proveedor, (token) =>
    binario ? descargarBinario(token, remoto.id) : descargarTexto(token, remoto.id),
  );

  const carpeta = destino.parentDirectory;
  if (!carpeta.exists) carpeta.create({ intermediates: true, idempotent: true });
  if (!destino.exists) destino.create({ overwrite: true });
  destino.write(contenido, binario ? { encoding: 'base64' } : undefined);

  // Lo recién bajado no está sucio: viene de Drive, no va hacia Drive.
  marcarLimpio(destino.uri);
  idsRemotos.set(relativa, remoto.id);
  mtimesRemotos.set(relativa, remoto.modifiedTime);
  return true;
}

// ---------------------------------------------------------------------------
// Borrados
// ---------------------------------------------------------------------------

/** ¿Vive algo —fichero o carpeta— en esa ruta relativa del árbol local? */
function existeEnLocal(partes: string[]): boolean {
  if (partes.length === 0) return false;
  return new File(raizLocal(), ...partes).exists || new Directory(raizLocal(), ...partes).exists;
}

/**
 * Propaga a Drive los borrados hechos en local. Navega la ruta **sin crear
 * carpetas por el camino**: si un tramo no existe en Drive, allí no hay nada
 * que borrar y el apunte se da por saldado.
 */
async function borrarUno(proveedor: ProveedorToken, ruta: string): Promise<void> {
  // Las rutas de carpeta llegan con barra final (`Directory.uri` siempre la
  // lleva). Sin quitarla, la purga de caché del final no acierta jamás y se
  // quedan cacheados ids de carpetas ya destruidas el resto de la sesión.
  const normal = ruta.replace(/\/+$/, '');
  const partes = normal.split('/').filter(Boolean);

  // Si en esa misma ruta vuelve a vivir algo local, el apunte está caducado:
  // se borró y después se creó otra cosa con el mismo nombre (los nombres se
  // repiten a diario: «01 - Capítulo sin título.md»). Un borrado que falló
  // sigue encolado para siempre, así que sin esta comprobación acabaría
  // llevándose por delante el fichero nuevo —ya subido y por tanto fuera de la
  // cola de sucios— sin que nada lo volviera a subir.
  if (existeEnLocal(partes)) {
    confirmarBorrado(ruta);
    return;
  }

  await conReintentos(proveedor, async (token) => {
    let padre = carpetas.get('');
    if (!padre) {
      const tinta = await asegurarCarpeta(token, RAIZ);
      const proyectos = await asegurarCarpeta(token, PROYECTOS, tinta.id);
      padre = proyectos.id;
      carpetas.set('', padre);
    }

    const tramos = [...partes];
    const nombre = tramos.pop() as string;

    for (const parte of tramos) {
      const carpeta = await buscarEnCarpeta(token, parte, padre as string);
      if (!carpeta || carpeta.mimeType !== MIME_CARPETA) return; // nada que borrar
      padre = carpeta.id;
    }

    const objetivo = await buscarEnCarpeta(token, nombre, padre as string);
    // A la papelera, no `DELETE`: esta cola no solo recibe borrados queridos.
    // Renombrar una parte o un proyecto encola la carpeta vieja entera, y en
    // Drive borrar una carpeta se lleva toda la prosa que hay dentro sin
    // marcha atrás. La papelera la guarda 30 días.
    if (objetivo) await aPapelera(token, objetivo.id);
  });

  // Si el objetivo era una carpeta, sus rutas cacheadas ya no valen.
  for (const [clave] of carpetas) {
    if (clave === normal || clave.startsWith(`${normal}/`)) carpetas.delete(clave);
  }
  for (const [clave] of idsRemotos) {
    if (clave === normal || clave.startsWith(`${normal}/`)) {
      idsRemotos.delete(clave);
      mtimesRemotos.delete(clave);
    }
  }

  confirmarBorrado(ruta);
}

// ---------------------------------------------------------------------------
// Ciclo completo
// ---------------------------------------------------------------------------

let enCurso: Promise<ResultadoSync> | null = null;

/**
 * Sube lo pendiente y baja lo que haya cambiado fuera. Si ya hay un ciclo en
 * marcha devuelve ese mismo: dos sincronizaciones simultáneas solo sirven para
 * pisarse.
 */
export function sincronizar(proveedor: ProveedorToken): Promise<ResultadoSync> {
  if (enCurso) return enCurso;

  enCurso = (async (): Promise<ResultadoSync> => {
    const errores: ErrorSync[] = [];
    let subidos = 0;
    let bajados = 0;

    try {
      // Primero los borrados: si un fichero se renombró, el nombre viejo debe
      // desaparecer antes de que el nuevo suba, o convivirían un instante.
      for (const ruta of pendientesDeBorrado()) {
        try {
          await borrarUno(proveedor, ruta);
        } catch (e) {
          errores.push(comoErrorSync(`No se pudo borrar ${ruta} de Drive`, e));
        }
      }

      for (const uri of pendientesDeSubida()) {
        try {
          await subirUno(proveedor, uri);
          subidos += 1;
        } catch (e) {
          errores.push(comoErrorSync(`No se pudo subir ${rutaRelativa(uri) ?? uri}`, e));
        }
      }

      try {
        const raizRemota = await conReintentos(proveedor, async (token) => {
          const tinta = await asegurarCarpeta(token, RAIZ);
          return asegurarCarpeta(token, PROYECTOS, tinta.id);
        });
        carpetas.set('', raizRemota.id);
        // La foto de la cola se toma aquí, después de subir: lo que siga
        // pendiente es lo que Drive todavía no tiene y no se puede pisar.
        bajados = await bajarCambios(
          { proveedor, sucios: new Set(pendientesDeSubida()), errores },
          raizRemota.id,
          '',
        );
      } catch (e) {
        errores.push(comoErrorSync('No se pudo revisar Drive', e));
      }
    } finally {
      enCurso = null;
    }

    return { subidos, bajados, errores };
  })();

  return enCurso;
}

/** Se llama al restaurar en un móvil nuevo: trae todo sin comparar nada. */
export async function restaurarDesdeDrive(proveedor: ProveedorToken): Promise<number> {
  const raizRemota = await conReintentos(proveedor, async (token) => {
    const tinta = await asegurarCarpeta(token, RAIZ);
    return asegurarCarpeta(token, PROYECTOS, tinta.id);
  });
  carpetas.set('', raizRemota.id);
  // Restaurar en un móvil que ya tuviera algo sin subir tampoco puede pisarlo.
  return bajarCambios(
    { proveedor, sucios: new Set(pendientesDeSubida()), errores: [] },
    raizRemota.id,
    '',
  );
}

/** Olvida los índices en memoria. Necesario al cambiar de cuenta. */
export function olvidarIndices(): void {
  carpetas.clear();
  idsRemotos.clear();
  mtimesRemotos.clear();
}

/**
 * Vuelve a encolar para subida el árbol local entero. Devuelve cuántos ficheros
 * encoló.
 *
 * Se llama al cerrar sesión, que es el primer paso de «Cambiar de cuenta». Las
 * colas solo saben de cambios *desde la última subida*, y esa subida fue a la
 * cuenta anterior: sin esto, el primer ciclo con la cuenta nueva no sube nada,
 * no encuentra nada, y el indicador dice «Guardado en Drive» con la novela
 * viviendo solo en el móvil. Cuesta una resubida completa —el precio de decir
 * la verdad— y deja el estado en «N por subir», que es lo que de verdad pasa.
 */
export function reencolarTodoLocal(): number {
  const raiz = raizLocal();
  if (!raiz.exists) return 0;

  let encolados = 0;
  const recorrer = (dir: Directory): void => {
    for (const entrada of dir.list()) {
      if (entrada instanceof Directory) {
        recorrer(entrada);
      } else {
        marcarSucio(entrada.uri);
        encolados += 1;
      }
    }
  };
  recorrer(raiz);
  return encolados;
}

/**
 * Manda la carpeta `Tinta` entera a la papelera de Drive.
 *
 * Se usa solo desde el borrado total de Ajustes. A la papelera y no a `DELETE`
 * a propósito: Drive la conserva unos 30 días, así que esto tiene marcha atrás
 * aunque la app diga —con razón— que no la tiene.
 *
 * Devuelve `false` si no había nada que borrar en Drive.
 */
export async function borrarTodoEnDrive(proveedor: ProveedorToken): Promise<boolean> {
  const encontrada = await conReintentos(proveedor, (token) => buscarCarpetaRaiz(token, RAIZ));
  if (!encontrada) {
    olvidarIndices();
    return false;
  }

  await conReintentos(proveedor, (token) => aPapelera(token, encontrada.id));
  olvidarIndices();
  return true;
}
