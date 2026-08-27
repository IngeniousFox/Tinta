import { describe, expect, it } from 'vitest';

import {
  SEPARADOR_ESCENA,
  contarPalabras,
  htmlAMarkdown,
  markdownAHtml,
  minutosDeLectura,
} from './markdown';

/** md -> html -> md. Si esto no es estable, el texto se degrada al guardar. */
const ida = (md: string) => htmlAMarkdown(markdownAHtml(md));

describe('markdownAHtml', () => {
  it('convierte un párrafo suelto', () => {
    expect(markdownAHtml('Adela llegó al pueblo.')).toBe('<p>Adela llegó al pueblo.</p>');
  });

  it('conserva los saltos de línea dentro del párrafo (versos) y separa párrafos por línea en blanco', () => {
    expect(markdownAHtml('Una\nfrase partida.\n\nOtro párrafo.')).toBe(
      '<p>Una<br>frase partida.</p><p>Otro párrafo.</p>',
    );
  });

  it('reconoce negrita, cursiva y subrayado', () => {
    expect(markdownAHtml('**fuerte** y *suave* y <u>bajo</u>')).toBe(
      '<p><strong>fuerte</strong> y <em>suave</em> y <u>bajo</u></p>',
    );
  });

  it('reconoce el título de nivel 3', () => {
    expect(markdownAHtml('### Capítulo tres')).toBe('<h3>Capítulo tres</h3>');
  });

  it('reconoce el separador de escena', () => {
    expect(markdownAHtml(`Antes.\n\n${SEPARADOR_ESCENA}\n\nDespués.`)).toBe(
      `<p>Antes.</p><p>${SEPARADOR_ESCENA}</p><p>Después.</p>`,
    );
  });

  it('escapa el html que venga en el texto', () => {
    expect(markdownAHtml('5 < 7 & 8 > 2')).toBe('<p>5 &lt; 7 &amp; 8 &gt; 2</p>');
  });

  it('respeta un asterisco escapado como literal', () => {
    expect(markdownAHtml(String.raw`un \* suelto`)).toBe('<p>un * suelto</p>');
  });

  it('resuelve la cursiva anidada dentro de la negrita', () => {
    expect(markdownAHtml('**Adela *ya* no**')).toBe(
      '<p><strong>Adela <em>ya</em> no</strong></p>',
    );
    expect(markdownAHtml('*Adela **ya** no*')).toBe('<p><em>Adela <strong>ya</strong> no</em></p>');
  });

  it('reconoce el separador aunque venga con marcas encima', () => {
    expect(markdownAHtml(`Antes.\n\n**${SEPARADOR_ESCENA}**\n\nDespués.`)).toBe(
      `<p>Antes.</p><p>${SEPARADOR_ESCENA}</p><p>Después.</p>`,
    );
  });

  it('fija la sangría y los espacios dobles para que el navegador no los coma', () => {
    expect(markdownAHtml('  Un verso sangrado')).toBe('<p>&nbsp;&nbsp;Un verso sangrado</p>');
    expect(markdownAHtml('dos   espacios')).toBe('<p>dos&nbsp;&nbsp;&nbsp;espacios</p>');
  });
});

describe('htmlAMarkdown', () => {
  it('devuelve negrita, cursiva y subrayado a su forma de texto', () => {
    expect(htmlAMarkdown('<p><strong>a</strong> <em>b</em> <u>c</u></p>')).toBe('**a** *b* <u>c</u>');
  });

  it('acepta también las etiquetas cortas que emite execCommand', () => {
    expect(htmlAMarkdown('<p><b>a</b> <i>b</i></p>')).toBe('**a** *b*');
  });

  it('descarta etiquetas fuera del esquema sin perder su texto', () => {
    expect(htmlAMarkdown('<p>Un <span class="x">span</span> y un <a href="#">enlace</a>.</p>')).toBe(
      'Un span y un enlace.',
    );
  });

  it('ignora los párrafos vacíos', () => {
    expect(htmlAMarkdown('<p>Uno</p><p></p><p>Dos</p>')).toBe('Uno\n\nDos');
  });

  it('escapa un asterisco literal para que no se lea como cursiva', () => {
    expect(htmlAMarkdown('<p>un * suelto</p>')).toBe(String.raw`un \* suelto`);
  });

  it('escapa una almohadilla al principio de párrafo', () => {
    expect(htmlAMarkdown('<p># no es un título</p>')).toBe(String.raw`\# no es un título`);
  });

  it('degrada a ### los títulos de otro nivel en vez de tirar su texto', () => {
    expect(htmlAMarkdown('<p>Antes</p><h1>Pegado de otra app</h1><p>Después</p>')).toBe(
      'Antes\n\n### Pegado de otra app\n\nDespués',
    );
    expect(htmlAMarkdown('<h2>Dos</h2>')).toBe('### Dos');
  });

  it('no parte en dos un título que lleve dentro un salto de línea', () => {
    expect(htmlAMarkdown('<h3>Uno<br>Dos</h3>')).toBe('### Uno Dos');
  });

  it('reconoce el separador aunque el párrafo lleve marcas', () => {
    expect(htmlAMarkdown(`<p><strong>${SEPARADOR_ESCENA}</strong></p>`)).toBe(SEPARADOR_ESCENA);
    expect(htmlAMarkdown(`<p><em>${SEPARADOR_ESCENA}</em></p>`)).toBe(SEPARADOR_ESCENA);
  });

  it('conserva la sangría del verso y los espacios dobles', () => {
    expect(htmlAMarkdown('<p>&nbsp;&nbsp;sangrado</p>')).toBe('  sangrado');
    expect(htmlAMarkdown('<p>dos   espacios</p>')).toBe('dos   espacios');
  });

  it('descodifica las entidades numéricas sin romper un emoji', () => {
    // fromCharCode truncaba a 16 bits y devolvía otro carácter.
    expect(htmlAMarkdown('<p>Un abrazo &#128512; y otro &#x1F600;</p>')).toBe(
      'Un abrazo 😀 y otro 😀',
    );
  });

  it('protege el <u> que la usuaria escriba como texto', () => {
    expect(htmlAMarkdown('<p>se escribe &lt;u&gt;así&lt;/u&gt;</p>')).toBe(
      String.raw`se escribe \<u\>así\</u\>`,
    );
  });
});

describe('ida y vuelta', () => {
  const casos: [string, string][] = [
    ['párrafo simple', 'Adela llegó al pueblo el mismo día que la niebla.'],
    ['negrita', 'Traía **una maleta de cartón** atada con cuerda.'],
    ['cursiva', 'Y dijo: *esa mujer va a abrir algo*.'],
    ['subrayado', 'Nadie le llevó <u>la contraria</u>.'],
    ['mezcla', '**Fuerte**, *suave* y <u>bajo</u> en la misma línea.'],
    ['título', '### Capítulo tres'],
    ['separador', `Antes.\n\n${SEPARADOR_ESCENA}\n\nDespués.`],
    ['varios párrafos', 'Uno.\n\nDos.\n\nTres.'],
    ['acentos y eñes', 'La niebla de Valdeserena bajó del monte en año impar.'],
    ['comillas angulares', '«La forastera», la llamaban.'],
    ['ampersand', 'Ella & él, sin más.'],
    ['asterisco literal', String.raw`un \* suelto`],
    ['almohadilla escapada', String.raw`\# no es un título`],
    ['versos de un poema', 'Baja del monte cada tarde\ny se queda hasta marzo.\n\nNo es meteorología.'],
    ['verso con cursiva', 'la niebla *devuelve* cosas\nobjetos perdidos'],
    // Es lo que produce la app al poner una palabra en cursiva dentro de una
    // frase en negrita: el orden que más se da y el que antes se destruía.
    ['cursiva dentro de negrita', '**Adela *ya* no** volvió.'],
    ['negrita dentro de cursiva', '*Adela **ya** no* volvió.'],
    ['verso sangrado', '  Baja del monte cada tarde\n    y se queda hasta marzo.'],
    ['espacios dobles', 'Dijo:  «no».'],
    ['título con dos palabras y espacio doble', '### Capítulo  tres'],
    ['<u> literal', String.raw`se escribe \<u\>así\</u\>`],
    ['emoji fuera del BMP', 'Y ella escribió 😀 en el margen.'],
  ];

  it.each(casos)('es estable con %s', (_nombre, md) => {
    expect(ida(md)).toBe(md);
  });

  it('sigue siendo estable en una segunda vuelta', () => {
    const md = '### Capítulo tres\n\n**Adela** llegó *tarde*.\n\n✦ ✦ ✦\n\nY <u>nadie</u> dijo nada.';
    expect(ida(ida(md))).toBe(ida(md));
  });

  it('no degrada el anidamiento por muchas vueltas que dé', () => {
    // El fallo antiguo era acumulativo: cada ciclo añadía asteriscos escapados.
    const md = '**Adela *ya* no** volvió, y *ella **sí*** lo sabía.';
    expect(ida(md)).toBe(md);
    expect(ida(ida(md))).toBe(md);
    expect(ida(ida(ida(md)))).toBe(md);
  });

  it('normaliza a ### un título de otro nivel, y a partir de ahí es estable', () => {
    const md = htmlAMarkdown('<h1>Pegado de otra app</h1>');
    expect(md).toBe('### Pegado de otra app');
    expect(ida(md)).toBe(md);
  });

  it('normaliza el separador con marcas y luego lo conserva', () => {
    const md = htmlAMarkdown(`<p>Antes.</p><p><strong>${SEPARADOR_ESCENA}</strong></p>`);
    expect(md).toBe(`Antes.\n\n${SEPARADOR_ESCENA}`);
    expect(ida(md)).toBe(md);
  });

  it('conserva un capítulo real del prototipo', () => {
    const md = [
      '### Capítulo tres',
      '',
      'Adela llegó al pueblo el mismo día que la niebla, y durante años nadie fue capaz de decidir cuál de las dos había traído a la otra.',
      '',
      'Doña Elvira la miró desde la ventana y dijo: *esa mujer va a abrir algo que llevamos cuarenta años cerrando*.',
      '',
      SEPARADOR_ESCENA,
      '',
      'La casa de la cuesta llevaba vacía desde el invierno del accidente.',
    ].join('\n');

    expect(ida(md)).toBe(md);
  });
});

describe('contador', () => {
  it('cuenta palabras separadas por cualquier espacio', () => {
    expect(contarPalabras('  Adela   llegó\nal pueblo  ')).toBe(4);
  });

  it('devuelve cero con texto vacío', () => {
    expect(contarPalabras('   ')).toBe(0);
  });

  it('no cuenta la sintaxis: ni ###, ni los ✦ del separador, ni las marcas', () => {
    const md = `### Capítulo tres\n\n**Adela** llegó *tarde*.\n\n${SEPARADOR_ESCENA}\n\nY <u>nadie</u> dijo nada.`;
    expect(contarPalabras(md)).toBe(2 + 3 + 4);
  });

  it('cuenta lo mismo en el Markdown y en el texto plano del editor', () => {
    const md = `### Uno\n\nDos palabras.\n\n${SEPARADOR_ESCENA}\n\nY tres más.`;
    const plano = `Uno\nDos palabras.\n${SEPARADOR_ESCENA}\nY tres más.`;
    expect(contarPalabras(md)).toBe(contarPalabras(plano));
  });

  it('un separador no regala palabras a la racha del día', () => {
    expect(contarPalabras('Antes.')).toBe(contarPalabras(`Antes.\n\n${SEPARADOR_ESCENA}`));
  });

  it('calcula los minutos como el prototipo, con mínimo de uno', () => {
    expect(minutosDeLectura(4210)).toBe(21);
    expect(minutosDeLectura(10)).toBe(1);
  });
});
