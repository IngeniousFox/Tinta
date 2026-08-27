/**
 * Modelo de dominio de Tinta (TINTA-SPEC §5).
 *
 * La verdad vive en los ficheros; estos tipos son la forma que tienen esos
 * ficheros una vez leídos. Todo lo derivable —palabras, porcentajes, «aparece
 * en N capítulos», racha— se calcula al vuelo y NO se guarda: si se guardara,
 * podría contradecir al texto, y en un conflicto entre el texto y su recuento
 * gana siempre el texto.
 */

import type { EstadoCapitulo } from '@/theme/tokens';

export type { EstadoCapitulo };

/**
 * Género del proyecto — determina la pareja de colores del lomo y cómo se
 * llama cada documento del manuscrito («capítulo» o, en un poemario, «poema»).
 */
export type GeneroProyecto = 'novela' | 'relatos' | 'poemario' | 'borrador' | 'nuevo';

/**
 * `manifest.json` en la raíz del proyecto.
 *
 * El objetivo diario NO va aquí aunque la spec §5 lo listara: la interfaz lo
 * trata como global (§4.2.10) y vive en `Tinta/ajustes.json`. Los manifests
 * antiguos que aún lo traigan se leen sin problema — el campo se ignora.
 */
export type Manifiesto = {
  /** Identificador estable, independiente del nombre (que la usuaria cambia). */
  id: string;
  nombre: string;
  genero: GeneroProyecto;
  /** Orden de las carpetas en la pantalla de proyecto. */
  ordenCarpetas: string[];
  creado: string;
  modificado: string;
};

/** Un capítulo: frontmatter + prosa en Markdown. */
export type Capitulo = {
  id: string;
  /** Ruta relativa dentro del proyecto, p. ej. `Manuscrito/Parte I/01 - La casa.md`. */
  ruta: string;
  titulo: string;
  estado: EstadoCapitulo;
  /** Posición dentro de su carpeta. */
  orden: number;
  /**
   * Si entra en la exportación. Un capítulo puede formar parte del manuscrito
   * (notas de trabajo, un borrador alternativo) y aun así no querer verse en el
   * PDF final.
   */
  exportar: boolean;
  /** Cuerpo en Markdown, sin el frontmatter. */
  texto: string;
  modificado: string;
};

/** Metadatos de capítulo tal y como viajan en el frontmatter YAML. */
export type FrontmatterCapitulo = {
  titulo: string;
  estado: EstadoCapitulo;
  orden: number;
  exportar: boolean;
  id: string;
  modificado: string;
};

export type HitoArco = {
  id: string;
  titulo: string;
  subtitulo: string;
  estado: 'hecho' | 'ahora' | 'pendiente';
};

export type Relacion = {
  id: string;
  nombre: string;
  descripcion: string;
};

/** `Personajes/<Nombre>.json` */
export type Personaje = {
  id: string;
  nombre: string;
  /** El primero se muestra como rol; el resto son apodos. */
  apodos: string[];
  /**
   * Ruta relativa de la foto dentro del proyecto
   * (`Personajes/fotos/<Nombre>.jpg`), o null si no tiene.
   *
   * Se guarda la ruta, no la imagen: el JSON de la ficha tiene que seguir
   * siendo legible a mano, y una foto empotrada en base64 lo llenaría de ruido.
   */
  foto: string | null;
  edad: string;
  aspecto: string;
  personalidad: string;
  trasfondo: string;
  arco: HitoArco[];
  relaciones: Relacion[];
  notas: string;
  modificado: string;
};

export type Etiqueta = {
  id: string;
  texto: string;
  color: 'verde' | 'marron' | 'vino';
};

/** `Mundo/<Título>.json` */
export type NotaMundo = {
  id: string;
  titulo: string;
  etiquetas: Etiqueta[];
  descripcion: string;
  reglas: string[];
  /** Ids de capítulos donde se menciona. */
  menciones: string[];
  modificado: string;
};

/** `Notas sueltas/<id>.json` */
export type NotaSuelta = {
  id: string;
  texto: string;
  creado: string;
  modificado: string;
};

export type Suceso = {
  id: string;
  /** Texto libre: «1989 · INVIERNO», «SIN FECHA»… */
  fecha: string;
  titulo: string;
  descripcion: string;
  /** Sin estado = suceso aún no escrito (punto de borde discontinuo). */
  estado: EstadoCapitulo | null;
  /** Id del capítulo enlazado, si lo hay. */
  capitulo: string | null;
};

/** `linea-temporal.json` */
export type LineaTemporal = {
  sucesos: Suceso[];
  modificado: string;
};

/** Una carpeta del proyecto, con sus hijos. */
export type Carpeta = {
  nombre: string;
  /** Ruta relativa dentro del proyecto. */
  ruta: string;
  icono: string;
  subcarpetas: Carpeta[];
  capitulos: Capitulo[];
};

/** Proyecto completo, ya leído de disco. */
export type Proyecto = {
  manifiesto: Manifiesto;
  manuscrito: Carpeta[];
  personajes: Personaje[];
  mundo: NotaMundo[];
  notas: NotaSuelta[];
  lineaTemporal: LineaTemporal;
};

// ---------------------------------------------------------------------------
// Derivados — se calculan, nunca se guardan
// ---------------------------------------------------------------------------

/** Estado de sincronización visible en la interfaz (TINTA-SPEC §6.3). */
export type EstadoSync =
  | { tipo: 'al-dia'; desde: string }
  | { tipo: 'sincronizando' }
  | { tipo: 'pendiente'; enCola: number }
  | { tipo: 'sin-conexion' }
  | { tipo: 'error'; mensaje: string };
