import { describe, expect, it } from 'vitest';

import type { FrontmatterCapitulo } from '@/datos/tipos';

import { parsearCapitulo, serializarCapitulo } from './frontmatter';

const BASE: FrontmatterCapitulo = {
  titulo: 'Sin título',
  estado: 'Borrador',
  orden: 0,
  exportar: true,
  id: 'cap-por-defecto',
  modificado: '2026-01-01T00:00:00.000Z',
};

const META: FrontmatterCapitulo = {
  titulo: 'El nombre de Adela',
  estado: 'Escribiendo ahora',
  orden: 3,
  exportar: true,
  id: 'cap-3',
  modificado: '2026-08-21T10:00:00.000Z',
};

describe('serializarCapitulo', () => {
  it('escribe un fichero legible a mano', () => {
    expect(serializarCapitulo(META, 'Adela llegó al pueblo.')).toBe(
      [
        '---',
        'titulo: El nombre de Adela',
        'estado: Escribiendo ahora',
        'orden: 3',
        'id: cap-3',
        'modificado: 2026-08-21T10:00:00.000Z',
        '---',
        '',
        'Adela llegó al pueblo.',
        '',
      ].join('\n'),
    );
  });

  it('entrecomilla solo cuando el valor lo necesita', () => {
    const salida = serializarCapitulo({ ...META, titulo: 'Adela: la forastera' }, 'x');
    expect(salida).toContain('titulo: "Adela: la forastera"');
  });

  it('no escribe la línea de exportar cuando es lo normal (exportar)', () => {
    expect(serializarCapitulo(META, 'x')).not.toContain('exportar');
  });

  it('escribe exportar: false cuando el capítulo queda fuera del PDF', () => {
    expect(serializarCapitulo({ ...META, exportar: false }, 'x')).toContain('exportar: false');
  });
});

describe('exportar en el frontmatter', () => {
  it('se recupera tal cual tras el ida y vuelta', () => {
    const excluido = parsearCapitulo(serializarCapitulo({ ...META, exportar: false }, 'x'), BASE);
    expect(excluido.meta.exportar).toBe(false);
    const incluido = parsearCapitulo(serializarCapitulo(META, 'x'), BASE);
    expect(incluido.meta.exportar).toBe(true);
  });

  it('acepta "no" escrito a mano y cualquier rareza cae en el valor por defecto', () => {
    expect(parsearCapitulo('---\nexportar: no\n---\n\nx', BASE).meta.exportar).toBe(false);
    expect(parsearCapitulo('---\nexportar: quizás\n---\n\nx', BASE).meta.exportar).toBe(true);
  });
});

describe('parsearCapitulo', () => {
  it('recupera lo que se escribió', () => {
    const texto = 'Adela llegó al pueblo.\n\nY nadie dijo nada.';
    const leido = parsearCapitulo(serializarCapitulo(META, texto), BASE);
    expect(leido.meta).toEqual(META);
    expect(leido.texto).toBe(texto);
  });

  it('sobrevive a un fichero sin frontmatter y conserva la prosa', () => {
    const leido = parsearCapitulo('Solo prosa, sin cabecera.', BASE);
    expect(leido.meta).toEqual(BASE);
    expect(leido.texto).toBe('Solo prosa, sin cabecera.');
  });

  it('sobrevive a un frontmatter sin cerrar', () => {
    const leido = parsearCapitulo('---\ntitulo: A medias\nprosa suelta', BASE);
    expect(leido.meta).toEqual(BASE);
    expect(leido.texto).toContain('prosa suelta');
  });

  it('cae en el valor por defecto si el estado no es válido', () => {
    const leido = parsearCapitulo('---\nestado: Inventado\n---\n\nTexto.', BASE);
    expect(leido.meta.estado).toBe('Borrador');
    expect(leido.texto).toBe('Texto.');
  });

  it('cae en el valor por defecto si el orden no es un número', () => {
    const leido = parsearCapitulo('---\norden: tercero\n---\n\nTexto.', BASE);
    expect(leido.meta.orden).toBe(0);
  });

  it('admite claves desconocidas sin romperse', () => {
    const leido = parsearCapitulo(
      '---\ntitulo: Válido\ninventado: lo que sea\n---\n\nTexto.',
      BASE,
    );
    expect(leido.meta.titulo).toBe('Válido');
    expect(leido.texto).toBe('Texto.');
  });

  it('no confunde un separador de escena con el cierre del frontmatter', () => {
    const texto = 'Antes.\n\n✦ ✦ ✦\n\nDespués.';
    const leido = parsearCapitulo(serializarCapitulo(META, texto), BASE);
    expect(leido.texto).toBe(texto);
  });

  it('conserva un guion largo al principio de la prosa', () => {
    const texto = '— No me llamo así —dijo ella.';
    const leido = parsearCapitulo(serializarCapitulo(META, texto), BASE);
    expect(leido.texto).toBe(texto);
  });

  it('acepta saltos de línea de Windows', () => {
    const leido = parsearCapitulo('---\r\ntitulo: Con CRLF\r\n---\r\n\r\nTexto.', BASE);
    expect(leido.meta.titulo).toBe('Con CRLF');
    expect(leido.texto).toBe('Texto.');
  });

  it('reconoce el frontmatter aunque el editor externo haya dejado un BOM delante', () => {
    const conBom = `﻿${serializarCapitulo(META, 'Adela llegó al pueblo.')}`;
    const leido = parsearCapitulo(conBom, BASE);
    // Sin esto, el bloque YAML entero se leería como prosa y el capítulo
    // estrenaría id y fecha en cada lectura.
    expect(leido.meta).toEqual(META);
    expect(leido.texto).toBe('Adela llegó al pueblo.');
  });

  it('reconoce el frontmatter con líneas en blanco por delante', () => {
    const leido = parsearCapitulo(`\n\n${serializarCapitulo(META, 'Texto.')}`, BASE);
    expect(leido.meta).toEqual(META);
    expect(leido.texto).toBe('Texto.');
  });

  it('no se traga la prosa de un .md que empieza por una línea de guiones', () => {
    const bruto = '---\n\nEra de noche cuando llegó.\n\n---\n\nY nadie dijo nada.';
    const leido = parsearCapitulo(bruto, BASE);
    expect(leido.meta).toEqual(BASE);
    expect(leido.texto).toContain('Era de noche cuando llegó.');
    expect(leido.texto).toContain('Y nadie dijo nada.');
  });

  it('tampoco si el bloque parece una lista y no pares clave:valor', () => {
    const bruto = '---\n- uno\n- dos\n---\n\nLo demás.';
    const leido = parsearCapitulo(bruto, BASE);
    expect(leido.texto).toContain('- uno');
    expect(leido.texto).toContain('Lo demás.');
  });

  it('tampoco si ninguna clave es de las que escribe Tinta', () => {
    const bruto = '---\nautor: Alguien\nlugar: Valdeserena\n---\n\nLo demás.';
    const leido = parsearCapitulo(bruto, BASE);
    expect(leido.meta).toEqual(BASE);
    expect(leido.texto).toContain('autor: Alguien');
  });
});
