import { describe, expect, it } from 'vitest';

import {
  idEstable,
  nombreCapitulo,
  nombreCapituloLibre,
  nombreJsonLibre,
  nombreLibre,
  nombreSeguro,
  ordenDesdeNombre,
  segmentos,
} from './rutas';

/** Lo que ocupa el nombre en el disco, que es lo que limita ext4: bytes. */
const bytes = (s: string) => new TextEncoder().encode(s).length;

describe('nombreSeguro', () => {
  it('conserva acentos y eñes', () => {
    expect(nombreSeguro('La casa que no dormía')).toBe('La casa que no dormía');
    expect(nombreSeguro('El año del señor')).toBe('El año del señor');
  });

  it('sustituye los caracteres que rompen rutas', () => {
    expect(nombreSeguro('Adela: la forastera')).toBe('Adela la forastera');
    expect(nombreSeguro('¿Y si/no?')).toBe('¿Y si no');
    expect(nombreSeguro('Capítulo <3>')).toBe('Capítulo 3');
  });

  it('conserva los guiones, que son legítimos en un título', () => {
    expect(nombreSeguro('El sí-mismo')).toBe('El sí-mismo');
    expect(nombreSeguro('Parte I - El invierno')).toBe('Parte I - El invierno');
  });

  it('se lleva por delante los caracteres de control que cuele un editor', () => {
    expect(nombreSeguro(`Antes${String.fromCharCode(7)}después`)).toBe('Antes después');
    expect(nombreSeguro('Con\ttabulador')).toBe('Con tabulador');
  });

  it('colapsa los espacios sobrantes', () => {
    expect(nombreSeguro('Uno    dos')).toBe('Uno dos');
  });

  it('no deja puntos ni espacios al final, que Windows rechaza', () => {
    expect(nombreSeguro('Capítulo uno.')).toBe('Capítulo uno');
    expect(nombreSeguro('Capítulo uno   ')).toBe('Capítulo uno');
  });

  it('cae en el valor por defecto si no queda nada utilizable', () => {
    expect(nombreSeguro('')).toBe('Sin título');
    expect(nombreSeguro('///')).toBe('Sin título');
    expect(nombreSeguro('   ')).toBe('Sin título');
  });

  it('recorta los nombres desmedidos', () => {
    const largo = 'a'.repeat(300);
    expect(nombreSeguro(largo).length).toBeLessThanOrEqual(120);
  });

  it('recorta por bytes: el límite del sistema de ficheros son 255, no 255 letras', () => {
    // Cada raya son 3 bytes en UTF-8: 120 caracteres se pasarían de 255 con el
    // prefijo de orden y la extensión.
    const rayas = '—'.repeat(200);
    expect(bytes(nombreSeguro(rayas))).toBeLessThanOrEqual(180);
    const acentos = 'á'.repeat(200);
    expect(bytes(nombreSeguro(acentos))).toBeLessThanOrEqual(180);
  });

  it('no parte un emoji por la mitad al recortar', () => {
    // 59 rayas son 177 bytes: el emoji (4 bytes) ya no cabe y el corte cae
    // justo encima de él.
    const seguro = nombreSeguro(`${'—'.repeat(59)}🌙${'x'.repeat(10)}`);
    // Un par suplente cortado dejaría un carácter sin pareja: el nombre ya no
    // sería UTF-8 válido y lo que llegara a Drive no sería lo que creemos.
    expect(seguro).not.toMatch(/[\uD800-\uDFFF]/);
    expect(bytes(seguro)).toBeLessThanOrEqual(180);
  });

  it('deja intacto un emoji que sí cabe', () => {
    expect(nombreSeguro('Diario 🌙')).toBe('Diario 🌙');
  });
});

describe('nombreCapitulo', () => {
  it('antepone el orden con dos dígitos para que el listado salga ordenado', () => {
    expect(nombreCapitulo(1, 'La casa que no dormía')).toBe('01 - La casa que no dormía.md');
    expect(nombreCapitulo(12, 'La grieta')).toBe('12 - La grieta.md');
  });

  it('usa un nombre por defecto propio de capítulo', () => {
    expect(nombreCapitulo(4, '')).toBe('04 - Capítulo sin título.md');
  });
});

describe('ordenDesdeNombre', () => {
  it('recupera el número del prefijo', () => {
    expect(ordenDesdeNombre('01 - La casa.md')).toBe(1);
    expect(ordenDesdeNombre('12 - La grieta.md')).toBe(12);
  });

  it('devuelve null si el fichero no lleva prefijo', () => {
    expect(ordenDesdeNombre('La casa.md')).toBeNull();
    expect(ordenDesdeNombre('manifest.json')).toBeNull();
  });

  it('sobrevive al ida y vuelta con el nombre que genera', () => {
    expect(ordenDesdeNombre(nombreCapitulo(7, 'Lo que se dijo en la fonda'))).toBe(7);
  });

  it('no se confunde con un título que también lleva guiones o números', () => {
    expect(ordenDesdeNombre(nombreCapitulo(3, 'El sí-mismo'))).toBe(3);
    expect(ordenDesdeNombre(nombreCapitulo(9, '1989 - el invierno'))).toBe(9);
    expect(ordenDesdeNombre(nombreCapitulo(2, 'Parte I - El invierno'))).toBe(2);
  });
});

describe('nombreLibre', () => {
  it('devuelve el nombre tal cual si nadie lo ocupa', () => {
    expect(nombreLibre('Adela', '.json', () => false)).toBe('Adela.json');
  });

  it('añade el sufijo antes de la extensión', () => {
    const tomados = new Set(['Adela.json']);
    expect(nombreLibre('Adela', '.json', (c) => tomados.has(c))).toBe('Adela (2).json');
  });

  it('sigue subiendo mientras haga falta', () => {
    const tomados = new Set(['Adela.json', 'Adela (2).json', 'Adela (3).json']);
    expect(nombreLibre('Adela', '.json', (c) => tomados.has(c))).toBe('Adela (4).json');
  });

  it('vale también para carpetas, que no tienen extensión', () => {
    const tomados = new Set(['Mi novela']);
    expect(nombreLibre('Mi novela', '', (c) => tomados.has(c))).toBe('Mi novela (2)');
  });

  it('nunca devuelve un nombre ocupado, ni con cien homónimos', () => {
    const salida = nombreLibre('X', '.json', () => true);
    expect(salida.startsWith('X (')).toBe(true);
    expect(salida.endsWith('.json')).toBe(true);
  });
});

describe('nombreJsonLibre', () => {
  it('esquiva la ficha que ya ocupa el nombre por defecto', () => {
    const tomados = new Set(['Personaje sin nombre.json']);
    expect(nombreJsonLibre('Personaje sin nombre', 'Personaje', (c) => tomados.has(c))).toBe(
      'Personaje sin nombre (2).json',
    );
  });
});

/**
 * La secuencia que perdía un capítulo entero: dos capítulos con el mismo
 * título, «Subir» en el segundo y renumerado de la parte. Se reproduce aquí la
 * elección de nombres que hace `guardarCapitulo` contra una carpeta simulada.
 */
describe('renumerar dos capítulos con el mismo título', () => {
  it('deja los dos ficheros en pie', () => {
    // La carpeta: nombre de fichero -> id del capítulo que vive dentro.
    const carpeta = new Map<string, string>([
      ['01 - Capítulo sin título.md', 'cap-A'],
      ['02 - Capítulo sin título.md', 'cap-B'],
    ]);

    const guardar = (id: string, orden: number, rutaActual: string) => {
      const nombre = nombreCapituloLibre(orden, 'Capítulo sin título', (candidato) => {
        if (candidato === rutaActual) return false;
        const dueño = carpeta.get(candidato);
        return dueño !== undefined && dueño !== id;
      });
      carpeta.set(nombre, id);
      if (nombre !== rutaActual) carpeta.delete(rutaActual);
      return nombre;
    };

    // `mover` intercambia el orden en memoria y guarda la parte entera, de la
    // primera posición a la última: B pasa a ser el 1 y A el 2.
    const rutaB = guardar('cap-B', 1, '02 - Capítulo sin título.md');
    const rutaA = guardar('cap-A', 2, '01 - Capítulo sin título.md');

    expect(rutaB).toBe('01 - Capítulo sin título (2).md');
    expect(rutaA).toBe('02 - Capítulo sin título.md');
    expect([...carpeta.values()].sort()).toEqual(['cap-A', 'cap-B']);
  });

  it('no renombra nada cuando el fichero que estorba es el suyo propio', () => {
    const carpeta = new Map<string, string>([['01 - La casa.md', 'cap-A']]);
    const nombre = nombreCapituloLibre(1, 'La casa', (candidato) => {
      if (candidato === '01 - La casa.md') return false;
      return carpeta.has(candidato);
    });
    expect(nombre).toBe('01 - La casa.md');
  });
});

describe('idEstable', () => {
  it('da siempre el mismo id para la misma ruta', () => {
    const ruta = 'Manuscrito/Parte I/01 - La casa.md';
    expect(idEstable('cap', ruta)).toBe(idEstable('cap', ruta));
  });

  it('distingue rutas parecidas', () => {
    expect(idEstable('cap', 'Manuscrito/01 - La casa.md')).not.toBe(
      idEstable('cap', 'Manuscrito/02 - La casa.md'),
    );
  });

  it('lleva el prefijo delante, como los ids de siempre', () => {
    expect(idEstable('cap', 'x').startsWith('cap-')).toBe(true);
  });
});

describe('segmentos', () => {
  it('parte la ruta e ignora los vacíos', () => {
    expect(segmentos('Manuscrito/Parte I/01 - x.md')).toEqual([
      'Manuscrito',
      'Parte I',
      '01 - x.md',
    ]);
    expect(segmentos('/Mundo//nota.json/')).toEqual(['Mundo', 'nota.json']);
  });
});
