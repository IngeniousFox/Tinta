import { describe, expect, it } from 'vitest';

import type { Capitulo, Carpeta, Proyecto } from '@/datos/tipos';

import { OPCIONES_POR_DEFECTO, generarHtml, resumenExportacion } from './html';

function cap(orden: number, titulo: string, texto: string, exportar = true): Capitulo {
  return {
    id: `cap-${orden}`,
    ruta: `Manuscrito/x/${orden}.md`,
    titulo,
    estado: 'Borrador',
    orden,
    exportar,
    texto,
    modificado: '2026-08-21T00:00:00.000Z',
  };
}

function carpeta(nombre: string, capitulos: Capitulo[]): Carpeta {
  return { nombre, ruta: `Manuscrito/${nombre}`, icono: 'folder', subcarpetas: [], capitulos };
}

/** Los capítulos sueltos bajo `Manuscrito/`, tal como los monta el almacén. */
function sueltos(capitulos: Capitulo[]): Carpeta {
  return { nombre: 'Manuscrito', ruta: 'Manuscrito', icono: 'folder', subcarpetas: [], capitulos };
}

function proyecto(manuscrito: Carpeta[], genero: Proyecto['manifiesto']['genero'] = 'novela'): Proyecto {
  return {
    manifiesto: {
      id: 'p',
      nombre: 'El jardín de las horas muertas',
      genero,
      ordenCarpetas: [],
      portada: null,
      creado: '',
      modificado: '',
    },
    manuscrito,
    personajes: [],
    mundo: [],
    notas: [],
    lineaTemporal: { sucesos: [], modificado: '' },
  };
}

const DOS_PARTES = proyecto([
  carpeta('Parte I — El invierno', [
    cap(1, 'La casa que no dormía', 'La casa llevaba vacía.'),
    cap(2, 'Cartas sin remite', 'Llegaban los martes.', false),
    cap(3, 'El nombre de Adela', '### Capítulo tres\n\nAdela llegó.\n\n✦ ✦ ✦\n\nLa casa de la cuesta.'),
  ]),
  carpeta('Parte II — La grieta', [cap(5, 'La grieta del pozo', 'El pozo.')]),
]);

describe('resumenExportacion', () => {
  it('cuenta incluidos, excluidos y palabras solo de los incluidos', () => {
    const r = resumenExportacion(DOS_PARTES);
    expect(r.capitulosIncluidos).toBe(3);
    expect(r.capitulosExcluidos).toBe(1);
    // Cuenta como el resto de la app, y solo la prosa: cap. 1 = 4, cap. 3 = 9
    // (el «###» y los tres «✦» son sintaxis, no palabras de la usuaria),
    // cap. 5 = 2. El excluido ('Llegaban los martes.', 3 palabras) queda fuera.
    expect(r.palabras).toBe(4 + 9 + 2);
  });
});

describe('generarHtml', () => {
  it('pone portada con el nombre y el género', () => {
    const html = generarHtml(DOS_PARTES, OPCIONES_POR_DEFECTO);
    expect(html).toContain('<h1>El jardín de las horas muertas</h1>');
    expect(html).toContain('Novela');
  });

  it('deja fuera el capítulo marcado como no exportable', () => {
    const html = generarHtml(DOS_PARTES, OPCIONES_POR_DEFECTO);
    expect(html).not.toContain('Cartas sin remite');
    expect(html).not.toContain('Llegaban los martes');
  });

  it('encabeza cada capítulo con su número y título, en su propia página', () => {
    const html = generarHtml(DOS_PARTES, OPCIONES_POR_DEFECTO);
    expect(html).toContain('<span class="numero">1.</span> La casa que no dormía');
    expect(html).toContain('<span class="numero">3.</span> El nombre de Adela');
    // Una sección-página por capítulo incluido (3) + 2 de parte + portada.
    expect(html.match(/<section class="pagina/g)?.length).toBe(3 + 2 + 1);
  });

  it('puede omitir los encabezados si así se pide', () => {
    const html = generarHtml(DOS_PARTES, { ...OPCIONES_POR_DEFECTO, encabezarCapitulos: false });
    expect(html).not.toContain('class="capitulo"');
    // La prosa sigue ahí.
    expect(html).toContain('Adela llegó.');
  });

  it('titula las partes solo cuando hay más de una con contenido', () => {
    const conPartes = generarHtml(DOS_PARTES, OPCIONES_POR_DEFECTO);
    expect(conPartes).toContain('Parte I — El invierno');
    expect(conPartes).toContain('Parte II — La grieta');

    const unaParte = generarHtml(
      proyecto([carpeta('Parte I', [cap(1, 'Uno', 'x')])]),
      OPCIONES_POR_DEFECTO,
    );
    expect(unaParte).not.toContain('class="pagina parte"');

    const sinSeparar = generarHtml(DOS_PARTES, { ...OPCIONES_POR_DEFECTO, separarPartes: false });
    expect(sinSeparar).not.toContain('class="pagina parte"');
  });

  it('centra el separador de escena y conserva el formato del texto', () => {
    const html = generarHtml(DOS_PARTES, OPCIONES_POR_DEFECTO);
    expect(html).toContain('<p class="escena">✦ ✦ ✦</p>');
    expect(html).toContain('<h3>Capítulo tres</h3>');
  });

  it('centra también el separador que llegue con marcas encima', () => {
    const html = generarHtml(
      proyecto([carpeta('P', [cap(1, 'Uno', 'Antes.\n\n**✦ ✦ ✦**\n\nDespués.')])]),
      OPCIONES_POR_DEFECTO,
    );
    expect(html).toContain('<p class="escena">✦ ✦ ✦</p>');
    expect(html).not.toContain('<strong>✦');
  });

  it('no abre una página de parte para los capítulos sueltos del manuscrito', () => {
    const html = generarHtml(
      proyecto([
        sueltos([cap(1, 'Suelto', 'Sin parte.')]),
        carpeta('Parte I', [cap(2, 'Dentro', 'Con parte.')]),
      ]),
      OPCIONES_POR_DEFECTO,
    );
    // La palabra «Manuscrito» es del almacén, no del libro: ni portadilla ni
    // cuenta para decidir si se titulan las partes (aquí solo hay una real).
    expect(html).not.toContain('class="pagina parte"');
    expect(html).toContain('Sin parte.');
    expect(html).toContain('Con parte.');

    const conDosPartes = generarHtml(
      proyecto([
        sueltos([cap(1, 'Suelto', 'Sin parte.')]),
        carpeta('Parte I', [cap(2, 'Dentro', 'Con parte.')]),
        carpeta('Parte II', [cap(3, 'Otro', 'Y otra.')]),
      ]),
      OPCIONES_POR_DEFECTO,
    );
    expect(conDosPartes.match(/class="pagina parte"/g)?.length).toBe(2);
    expect(conDosPartes).not.toContain('<h2>Manuscrito</h2>');
  });

  it('escapa el HTML que venga en los títulos', () => {
    const html = generarHtml(
      proyecto([carpeta('P', [cap(1, 'Uno <b>& dos</b>', 'x')])]),
      OPCIONES_POR_DEFECTO,
    );
    expect(html).toContain('Uno &lt;b&gt;&amp; dos&lt;/b&gt;');
  });

  it('en un poemario cuenta poemas y conserva los versos', () => {
    const html = generarHtml(
      proyecto([carpeta('P', [cap(1, 'Niebla', 'Baja del monte\ny se queda.')])], 'poemario'),
      OPCIONES_POR_DEFECTO,
    );
    expect(html).toContain('Poemario');
    expect(html).toContain('1 poema ·');
    expect(html).toContain('Baja del monte<br>y se queda.');
  });

  it('no justifica ni guiona los versos de un poemario', () => {
    const poemario = generarHtml(
      proyecto([carpeta('P', [cap(1, 'Niebla', 'Baja del monte\ny se queda.')])], 'poemario'),
      OPCIONES_POR_DEFECTO,
    );
    expect(poemario).toContain('<body class="poemario">');
    expect(poemario).toContain('.poemario p { text-align: left; hyphens: manual; }');

    // En prosa sí se justifica: la regla es solo para el poemario.
    const novela = generarHtml(DOS_PARTES, OPCIONES_POR_DEFECTO);
    expect(novela).toContain('<body>');
  });
});
