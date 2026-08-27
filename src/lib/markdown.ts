/**
 * Conversión Markdown <-> HTML para el editor de capítulos.
 *
 * El esquema está deliberadamente restringido a seis construcciones — párrafo,
 * título, negrita, cursiva, subrayado y separador de escena — porque es
 * exactamente lo que la app guarda. Con un esquema tan pequeño el ida y vuelta
 * es determinista y comprobable, que es lo que evita que el texto de la usuaria
 * se degrade a base de guardados sucesivos (TINTA-SPEC §6.1).
 *
 * El subrayado no existe en Markdown: se guarda como `<u>` en línea. Sigue
 * siendo legible desde Docs o cualquier editor de texto, que es el requisito.
 *
 * Lo que NO se guarda aquí: fuente, tamaño, interlineado y alineación. En el
 * prototipo la alineación se aplica al editor entero, no al párrafo — es una
 * preferencia de lectura, no formato del texto.
 */

/** Separador de escena, tal cual aparece en el prototipo. */
export const SEPARADOR_ESCENA = '✦ ✦ ✦';

// Un párrafo normal: ProseMirror descartaría cualquier atributo, así que el
// separador se reconoce siempre por su contenido, no por marcas.
const HTML_ESCENA = `<p>${SEPARADOR_ESCENA}</p>`;

/** Etiquetas en línea que sobreviven; cualquier otra se descarta. */
const INLINE_PERMITIDAS = /<\/?(strong|b|em|i|u|br)\b[^>]*\/?>/gi;

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Un carácter a partir de su punto de código.
 *
 * `String.fromCharCode` trunca a 16 bits, así que la entidad numérica de un
 * carácter fuera del BMP —un emoji, por ejemplo— devolvía otro carácter y el
 * texto se corrompía en silencio. Una entidad malformada devuelve `null` para
 * poder dejarla tal cual en vez de reventar.
 */
function desdeCodigo(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 0x10ffff) return null;
  return String.fromCodePoint(n);
}

function descodificarEntidades(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (todo: string, n: string) => desdeCodigo(Number(n)) ?? todo)
    .replace(/&#x([0-9a-f]+);/gi, (todo: string, n: string) => desdeCodigo(parseInt(n, 16)) ?? todo)
    .replace(/&nbsp;/g, ' ')
    // El espacio duro vuelve a ser espacio corriente: lo pone la app para que
    // el navegador no colapse la sangría, y el .md tiene que quedar con
    // espacios normales para seguir siendo legible desde Drive.
    .replace(/\u00a0/g, ' ')
    .replace(/&amp;/g, '&'); // el último, o se re-descodifica lo ya descodificado
}

/** Protege los caracteres que Markdown interpretaría como sintaxis. */
function escaparMarkdown(s: string): string {
  return (
    s
      .replace(/([\\*])/g, '\\$1')
      // Un `<u>` escrito como texto por la usuaria hay que protegerlo, o al
      // releer el .md se convertiría en subrayado de verdad y las etiquetas
      // desaparecerían de su prosa. Solo se escapa el `<` que forma la
      // etiqueta: escaparlos todos llenaría de barras algo tan corriente como
      // «la temperatura < 0».
      .replace(/<(\/?)u>/gi, '\\<$1u\\>')
  );
}

/**
 * ¿Es este texto el separador de escena, aunque venga con marcas encima?
 *
 * Con una comparación de igualdad exacta bastaba poner la línea en negrita para
 * que dejara de reconocerse — y entonces ya no volvía a serlo nunca más, ni en
 * el editor ni en el PDF.
 */
function esSeparador(texto: string): boolean {
  return texto.replace(/<\/?u>/gi, '').replace(/[\\*_]/g, '').trim() === SEPARADOR_ESCENA;
}

// ---------------------------------------------------------------------------
// Markdown -> HTML  (abrir un capítulo en el editor)
// ---------------------------------------------------------------------------

function enLineaAHtml(md: string): string {
  const U_ABRE = '\u0000UA\u0000';
  const U_CIERRA = '\u0000UC\u0000';
  const escapados: string[] = [];

  let s = md;

  // 1. Apartar los caracteres escapados antes de tocar nada más.
  s = s.replace(/\\([\\*#<>&])/g, (_, ch: string) => {
    escapados.push(ch);
    return `\u0000E${escapados.length - 1}\u0000`;
  });

  // 2. Marcar el subrayado para que no lo escape el paso siguiente.
  s = s.replace(/<u>/gi, U_ABRE).replace(/<\/u>/gi, U_CIERRA);

  // 3. Ahora sí, escapar el resto como texto.
  s = escaparHtml(s);

  // 4. Negrita antes que cursiva: ** contiene *. El cierre se busca sin prisa
  //    (`+?`) en vez de exigir que dentro no haya ningún asterisco: con
  //    `[^*]+` un `**a *b* c**` —lo que produce la app al poner una palabra en
  //    cursiva dentro de una frase en negrita— no casaba en ninguna posición,
  //    la cursiva acababa cayendo sobre trozos que no eran y quedaban
  //    asteriscos sueltos que el siguiente guardado escapaba: cada ciclo de
  //    abrir y guardar añadía basura irrecuperable.
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 5. Devolver lo apartado.
  s = s.split(U_ABRE).join('<u>').split(U_CIERRA).join('</u>');
  s = s.replace(/\u0000E(\d+)\u0000/g, (_, i: string) => escaparHtml(escapados[Number(i)]));

  return s;
}

/**
 * Fija con `&nbsp;` los espacios que el navegador colapsaría.
 *
 * La sangría de un verso y los espacios dobles son texto de la usuaria, pero el
 * HTML funde cada racha en un solo espacio: al guardar de nuevo ya no estarían
 * y la forma de la estrofa se perdería sin vuelta atrás.
 * `descodificarEntidades` los devuelve a espacio normal al guardar, así que el
 * .md sigue siendo texto corriente.
 */
function conservarEspacios(html: string): string {
  return html
    .replace(/^ +/, (racha) => '&nbsp;'.repeat(racha.length))
    .replace(/ {2,}/g, (racha) => '&nbsp;'.repeat(racha.length));
}

export function markdownAHtml(md: string): string {
  const lineas = md.replace(/\r\n?/g, '\n').split('\n');
  const bloques: string[] = [];
  let parrafo: string[] = [];

  // Un salto de línea simple dentro del párrafo se conserva como salto de
  // línea (<br>), no se funde en un espacio como haría el Markdown estricto.
  // Es lo que hace falta para los versos de un poemario — y para cualquier
  // texto en que la usuaria parta una línea a propósito.
  const cerrarParrafo = () => {
    if (parrafo.length === 0) return;
    bloques.push(`<p>${parrafo.map((l) => conservarEspacios(enLineaAHtml(l))).join('<br>')}</p>`);
    parrafo = [];
  };

  for (const linea of lineas) {
    // Solo se recorta el final: la sangría del principio no es ruido, en un
    // poema es parte del poema, y el `trim()` de antes la borraba en cada
    // lectura sin que se pudiera recuperar.
    const t = linea.replace(/\s+$/, '');
    const desnudo = t.trim();

    if (desnudo === '') {
      cerrarParrafo();
      continue;
    }
    if (esSeparador(desnudo)) {
      cerrarParrafo();
      bloques.push(HTML_ESCENA);
      continue;
    }
    const titulo = /^###\s+(.*)$/.exec(desnudo);
    if (titulo) {
      cerrarParrafo();
      bloques.push(`<h3>${conservarEspacios(enLineaAHtml(titulo[1]))}</h3>`);
      continue;
    }
    parrafo.push(t);
  }
  cerrarParrafo();

  return bloques.join('');
}

// ---------------------------------------------------------------------------
// HTML -> Markdown  (guardar el capítulo)
// ---------------------------------------------------------------------------

function enLineaAMarkdown(html: string): string {
  // Fuera cualquier etiqueta que no esté en el esquema.
  const limpio = html.replace(/<(?!\/?(strong|b|em|i|u|br)\b)[^>]*>/gi, '');

  let salida = '';
  let ultimo = 0;
  let m: RegExpExecArray | null;

  INLINE_PERMITIDAS.lastIndex = 0;
  while ((m = INLINE_PERMITIDAS.exec(limpio)) !== null) {
    salida += escaparMarkdown(descodificarEntidades(limpio.slice(ultimo, m.index)));

    const etiqueta = m[1].toLowerCase();
    const cierra = m[0].startsWith('</');

    if (etiqueta === 'br') salida += '\n';
    else if (etiqueta === 'strong' || etiqueta === 'b') salida += '**';
    else if (etiqueta === 'em' || etiqueta === 'i') salida += '*';
    else if (etiqueta === 'u') salida += cierra ? '</u>' : '<u>';

    ultimo = INLINE_PERMITIDAS.lastIndex;
  }
  salida += escaparMarkdown(descodificarEntidades(limpio.slice(ultimo)));

  // Se recorta el final de cada línea, y los saltos sueltos de los extremos
  // (los que ProseMirror emite en un párrafo vacío), pero NO los espacios
  // interiores ni la sangría: colapsarlos destruía la forma del verso en cada
  // guardado.
  return salida
    .replace(/[ \t]+(?=\n)/g, '')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
}

export function htmlAMarkdown(html: string): string {
  const bloques: string[] = [];
  // También h1..h6: el editor admite todos los niveles (basta teclear «# » o
  // pegar texto de otra app con encabezados) y lo que no casara aquí se perdía
  // entero del .md al guardar. Nada de tirar texto: lo que no es `p` se degrada
  // a `###`, el único título que la app sabe leer.
  const re = /<(h[1-6]|p)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const etiqueta = m[1].toLowerCase();
    const cuerpo = enLineaAMarkdown(m[3]);

    if (cuerpo === '') {
      continue; // párrafos vacíos: se colapsan en la separación de bloques
    }
    if (esSeparador(cuerpo)) {
      bloques.push(SEPARADOR_ESCENA);
      continue;
    }
    if (etiqueta !== 'p') {
      // Un título ocupa una línea. Guardar con su `\n` un salto suave de dentro
      // partía el título en dos al releerlo, y la segunda mitad reaparecía como
      // prosa del cuerpo.
      bloques.push(`### ${cuerpo.replace(/\n+/g, ' ').trim()}`);
      continue;
    }
    // Un párrafo que empiece por # se escapa o al releerlo sería un título.
    bloques.push(cuerpo.replace(/^#/, '\\#'));
  }

  return bloques.join('\n\n');
}

/**
 * Cuenta palabras de prosa, no de fichero.
 *
 * Sirve igual para Markdown y para el texto plano del editor porque limpia
 * antes la sintaxis: el `###` de cada título y los tres `✦` de cada separador
 * contaban como palabras, de modo que insertar una escena regalaba tres
 * palabras a la racha del día y el pie del editor nunca cuadraba con el número
 * que enseñaban la hoja de exportación y la portada del PDF.
 */
export function contarPalabras(texto: string): number {
  const limpio = texto
    .split(/\r\n?|\n/)
    .filter((linea) => !esSeparador(linea))
    .join('\n')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\\([\\*<>#&])/g, '$1')
    .replace(/<\/?u>/gi, '')
    .replace(/\*/g, '');

  return (limpio.trim().match(/\S+/g) || []).length;
}

/** Minutos de lectura, a 200 palabras por minuto (igual que el prototipo). */
export function minutosDeLectura(palabras: number): number {
  return Math.max(1, Math.round(palabras / 200));
}
