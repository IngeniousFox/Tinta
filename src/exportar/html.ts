import { capitulosDeCarpeta, etiquetaGenero, miles, unidad } from '@/datos/derivados';
import { CARPETA_MANUSCRITO } from '@/datos/rutas';
import type { Capitulo, Carpeta, Proyecto } from '@/datos/tipos';
import { SEPARADOR_ESCENA, contarPalabras, markdownAHtml } from '@/lib/markdown';

/**
 * La parte que piensa de la exportación: qué entra, en qué orden, cómo se
 * titula cada página. Es pura —sin nada nativo— para poder probarla en Node;
 * quien la convierte en PDF y la comparte es `pdf.ts`.
 *
 * Decisiones (todas cambiables desde la hoja de exportación):
 * - Cada capítulo empieza en página nueva.
 * - El título del documento se imprime como encabezado de su página, numerado
 *   («3. El nombre de Adela»). La usuaria no tiene que escribirlo dentro.
 * - Si el manuscrito tiene dos o más partes con contenido, cada parte abre con
 *   su propia página de título. Con una sola se omite — sería ruido. Los
 *   capítulos sueltos de `Manuscrito/` no son una parte: van sin portadilla.
 * - Un capítulo con `exportar: false` no aparece, aunque siga en el manuscrito.
 * - En un poemario los versos no se justifican ni se guionan: la forma del
 *   verso es parte del poema.
 */

export type OpcionesExportacion = {
  /** Encabezar cada capítulo con su título numerado. */
  encabezarCapitulos: boolean;
  /** Página de título por cada parte (solo aplica con dos o más partes). */
  separarPartes: boolean;
  /** CSS de `@font-face` ya resuelto (Lora y Manrope en base64); vacío = fuentes del sistema. */
  cssFuentes?: string;
};

export const OPCIONES_POR_DEFECTO: OpcionesExportacion = {
  encabezarCapitulos: true,
  separarPartes: true,
};

export type ResumenExportacion = {
  capitulosIncluidos: number;
  capitulosExcluidos: number;
  palabras: number;
};

/** Qué entraría en el PDF, para enseñarlo en la hoja antes de generar nada. */
export function resumenExportacion(proyecto: Proyecto): ResumenExportacion {
  const todos = proyecto.manuscrito.flatMap(capitulosDeCarpeta);
  const incluidos = todos.filter((c) => c.exportar);
  return {
    capitulosIncluidos: incluidos.length,
    capitulosExcluidos: todos.length - incluidos.length,
    palabras: incluidos.reduce((t, c) => t + contarPalabras(c.texto), 0),
  };
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// El separador puede venir con marcas encima (basta que la usuaria pusiera esa
// línea en negrita), así que se reconoce por su texto y no por la cadena exacta:
// buscándola literal salía en el PDF alineado a la izquierda como un párrafo más.
const RE_ESCENA = new RegExp(
  `<p>(?:<(?:strong|em|u)>)*${SEPARADOR_ESCENA}(?:</(?:strong|em|u)>)*</p>`,
  'g',
);

/** El separador llega como párrafo normal; en el PDF sí podemos centrarlo. */
function cuerpoHtml(markdown: string): string {
  return markdownAHtml(markdown).replace(RE_ESCENA, `<p class="escena">${SEPARADOR_ESCENA}</p>`);
}

function paginaCapitulo(c: Capitulo, encabezar: boolean): string {
  const encabezado = encabezar
    ? `<h2 class="capitulo"><span class="numero">${c.orden}.</span> ${escapar(c.titulo)}</h2>`
    : '';
  return `<section class="pagina">${encabezado}${cuerpoHtml(c.texto)}</section>`;
}

function paginaParte(parte: Carpeta): string {
  return `<section class="pagina parte"><h2>${escapar(parte.nombre)}</h2></section>`;
}

/**
 * Los capítulos que cuelgan directos de `Manuscrito/` llegan como una carpeta
 * más, y esa carpeta se llama literalmente «Manuscrito» porque hereda el nombre
 * del directorio. Es un detalle del almacén, no una parte que la usuaria haya
 * escrito: sin esto el PDF abría una página de título con esa palabra en medio
 * del libro.
 */
function esParteReal(parte: Carpeta): boolean {
  return parte.ruta !== CARPETA_MANUSCRITO;
}

/** Capítulos de una carpeta y sus subcarpetas, en orden, solo los que se exportan. */
function capitulosExportables(carpeta: Carpeta): Capitulo[] {
  return capitulosDeCarpeta(carpeta).filter((c) => c.exportar);
}

export function generarHtml(proyecto: Proyecto, opciones: OpcionesExportacion): string {
  const { manifiesto } = proyecto;
  const u = unidad(manifiesto.genero);
  const resumen = resumenExportacion(proyecto);

  // Solo se titulan las partes si hay más de una con contenido exportable — y
  // la carpeta de los capítulos sueltos no cuenta como parte ni para decidirlo
  // ni para abrir portadilla.
  const partesConContenido = proyecto.manuscrito.filter((p) => capitulosExportables(p).length > 0);
  const titularPartes =
    opciones.separarPartes && partesConContenido.filter(esParteReal).length >= 2;

  const cuerpo = partesConContenido
    .map((parte) => {
      const paginas = capitulosExportables(parte)
        .map((c) => paginaCapitulo(c, opciones.encabezarCapitulos))
        .join('');
      return (titularPartes && esParteReal(parte) ? paginaParte(parte) : '') + paginas;
    })
    .join('');

  const portada =
    `<section class="pagina portada">` +
    `<p class="genero">${escapar(etiquetaGenero(manifiesto.genero))}</p>` +
    `<h1>${escapar(manifiesto.nombre)}</h1>` +
    `<p class="detalle">${miles(resumen.capitulosIncluidos)} ${resumen.capitulosIncluidos === 1 ? u.singular : u.plural} · ${miles(resumen.palabras)} palabras</p>` +
    `</section>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapar(manifiesto.nombre)}</title>
<style>
${opciones.cssFuentes ?? ''}
@page { margin: 22mm 20mm 24mm; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Lora, Georgia, 'Times New Roman', serif;
  font-size: 11.5pt;
  line-height: 1.65;
  color: #2A2320;
  background: #fff;
  text-rendering: optimizeLegibility;
}
.pagina { page-break-before: always; break-before: page; }
.pagina:first-child { page-break-before: auto; break-before: auto; }
.portada {
  min-height: 80vh;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  text-align: center;
}
.portada h1 { font-weight: 500; font-size: 26pt; line-height: 1.25; margin: 0 0 14pt; }
.portada .genero, .portada .detalle, h2.capitulo .numero {
  font-family: Manrope, system-ui, sans-serif;
}
.portada .genero { font-size: 9pt; letter-spacing: .18em; text-transform: uppercase; color: #9b8a7c; margin: 0 0 10pt; }
.portada .detalle { font-size: 9.5pt; color: #9b8a7c; margin: 0; }
.parte { min-height: 60vh; display: flex; align-items: center; justify-content: center; text-align: center; }
.parte h2 { font-weight: 400; font-size: 20pt; margin: 0; }
h2.capitulo { font-weight: 500; font-size: 16pt; line-height: 1.3; margin: 0 0 18pt; }
h2.capitulo .numero { color: #9b8a7c; font-weight: 600; font-size: 12pt; margin-right: 6pt; }
h3 {
  font-family: Manrope, system-ui, sans-serif;
  font-size: 9.5pt; font-weight: 500; letter-spacing: .12em; text-transform: uppercase;
  color: #9b8a7c; margin: 0 0 12pt;
}
p { margin: 0 0 0.9em; text-align: justify; hyphens: auto; orphans: 2; widows: 2; }
/* En un poemario el verso manda: justificarlo estiraría sus espacios y el
   guionado automático lo partiría con un guion a mitad de palabra. Eso cambia
   el poema, así que los versos van a la izquierda y sin guionar. */
.poemario p { text-align: left; hyphens: manual; }
p.escena { text-align: center; color: #b3a597; letter-spacing: .5em; margin: 18pt 0; }
strong { font-weight: 600; }
</style>
</head>
<body${manifiesto.genero === 'poemario' ? ' class="poemario"' : ''}>
${portada}
${cuerpo}
</body>
</html>`;
}
