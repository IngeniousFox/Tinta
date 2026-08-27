import { contarPalabras } from '@/lib/markdown';

import type { Capitulo, Carpeta, GeneroProyecto, Personaje, Proyecto } from './tipos';

/**
 * Todo lo que se calcula y nunca se guarda (TINTA-SPEC §5).
 *
 * La regla es que en un desacuerdo entre el texto y su recuento gana el texto.
 * Por eso nada de esto se persiste: un número guardado puede quedar obsoleto y
 * mentir; uno calculado, no.
 */

export function palabrasDeCapitulo(c: Capitulo): number {
  return contarPalabras(c.texto);
}

export function capitulosDeCarpeta(carpeta: Carpeta): Capitulo[] {
  return [...carpeta.capitulos, ...carpeta.subcarpetas.flatMap(capitulosDeCarpeta)];
}

export function capitulosDeProyecto(p: Proyecto): Capitulo[] {
  return p.manuscrito.flatMap(capitulosDeCarpeta);
}

export function palabrasDeCarpeta(carpeta: Carpeta): number {
  return capitulosDeCarpeta(carpeta).reduce((t, c) => t + palabrasDeCapitulo(c), 0);
}

export function palabrasDeProyecto(p: Proyecto): number {
  return capitulosDeProyecto(p).reduce((t, c) => t + palabrasDeCapitulo(c), 0);
}

/**
 * Porcentaje de avance del proyecto.
 *
 * La spec no define cómo medirlo y una novela no tiene un total conocido de
 * antemano, así que se mide por estado de los capítulos: cuentan los que están
 * `Listo` o `Revisado` sobre el total. Es honesto —solo sube cuando ella marca
 * un capítulo como terminado— y no depende de inventarse un objetivo de
 * palabras que nadie ha fijado.
 */
export function progresoProyecto(p: Proyecto): number {
  const capitulos = capitulosDeProyecto(p);
  if (capitulos.length === 0) return 0;
  const hechos = capitulos.filter(
    (c) => c.estado === 'Listo' || c.estado === 'Revisado',
  ).length;
  return Math.round((hechos / capitulos.length) * 100);
}

/**
 * Separadores de palabra. Se enumeran las letras válidas en vez de usar `\p{L}`
 * porque esto se ejecuta en Hermes, y una clase Unicode que falle en el móvil
 * pero funcione en las pruebas es justo el fallo que no queremos.
 */
const NO_LETRA = /[^0-9a-zA-ZáàäâéèëêíìïîóòöôúùüûñçÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇ']+/g;

/** Deja el texto como ` palabra palabra ` para poder buscar palabras enteras. */
function normalizar(texto: string): string {
  return ` ${texto.toLowerCase().replace(NO_LETRA, ' ').trim()} `;
}

/**
 * «Aparece en N capítulos»: se busca el nombre del personaje en el manuscrito.
 * Se cuenta también por el nombre de pila suelto, porque en la prosa casi nunca
 * aparece el nombre completo.
 *
 * La comparación es por **palabra entera**: buscar por subcadena hacía que un
 * apodo corto como «Ada» casara dentro de «nada» o «cada» e inflara la cuenta.
 */
export function apariciones(personaje: Personaje, capitulos: Capitulo[]): number {
  const nombres = [personaje.nombre, personaje.nombre.split(' ')[0], ...personaje.apodos]
    .map((n) => normalizar(n).trim())
    .filter((n) => n.length >= 3);

  if (nombres.length === 0) return 0;

  return capitulos.filter((c) => {
    const texto = normalizar(c.texto);
    return nombres.some((n) => texto.includes(` ${n} `));
  }).length;
}

// ---------------------------------------------------------------------------
// Objetivo diario y racha
// ---------------------------------------------------------------------------

/** Palabras escritas por día, en clave `AAAA-MM-DD`. */
export type Actividad = Record<string, number>;

export function claveDia(fecha = new Date()): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function palabrasDeHoy(actividad: Actividad): number {
  return actividad[claveDia()] ?? 0;
}

/**
 * Días seguidos escribiendo. Cuenta hacia atrás desde hoy; si hoy todavía no ha
 * escrito no rompe la racha —el día no ha terminado—, pero ayer sí la rompe.
 */
export function racha(actividad: Actividad, hoy = new Date()): number {
  let dias = 0;
  const cursor = new Date(hoy);

  if ((actividad[claveDia(cursor)] ?? 0) === 0) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while ((actividad[claveDia(cursor)] ?? 0) > 0) {
    dias += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return dias;
}

export function porcentajeObjetivo(actividad: Actividad, objetivo: number): number {
  if (objetivo <= 0) return 0;
  return Math.min(100, Math.round((palabrasDeHoy(actividad) / objetivo) * 100));
}

/** Formatea con separador de millares español, como el prototipo. */
export function miles(n: number): string {
  return n.toLocaleString('es-ES');
}

/** «1 capítulo» / «4 capítulos». La app está en español y se nota o chirría. */
export function plural(n: number, singular: string, plural: string): string {
  return `${miles(n)} ${n === 1 ? singular : plural}`;
}

/** «capítulo» → «Capítulo». Para rotular con la unidad al principio de frase. */
export function conMayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Cómo se llama cada documento del manuscrito según el género: en un poemario
 * son poemas, no capítulos. Una sola fuente para que toda la app lo diga igual.
 */
export function unidad(genero: GeneroProyecto | undefined): {
  singular: string;
  plural: string;
  sinTitulo: string;
  nuevo: string;
} {
  if (genero === 'poemario') {
    return { singular: 'poema', plural: 'poemas', sinTitulo: 'Poema sin título', nuevo: 'Nuevo poema' };
  }
  return {
    singular: 'capítulo',
    plural: 'capítulos',
    sinTitulo: 'Capítulo sin título',
    nuevo: 'Nuevo capítulo',
  };
}

/**
 * Los géneros que ella puede elegir al crear un proyecto, en el orden en que se
 * ofrecen. `'nuevo'` no está a propósito: es el valor de reserva de
 * `etiquetaGenero` y del lomo para manifests antiguos, no una opción.
 *
 * La etiqueta NO se repite aquí: la pantalla la saca de `etiquetaGenero`, para
 * que cambiar el nombre de un género se note en el diálogo de creación, en el
 * lomo de la Biblioteca y en el selector de proyecto a la vez.
 */
export const GENEROS_ELEGIBLES: GeneroProyecto[] = ['novela', 'relatos', 'poemario', 'borrador'];

/** Etiqueta legible del género (lomo, selector, portada del PDF). */
export function etiquetaGenero(g: GeneroProyecto): string {
  switch (g) {
    case 'novela':
      return 'Novela';
    case 'relatos':
      return 'Relatos';
    case 'poemario':
      return 'Poemario';
    case 'borrador':
      return 'Borrador';
    default:
      return 'Nuevo';
  }
}
