import { describe, expect, it } from 'vitest';

import { lomo } from '@/theme/tokens';

import {
  GENEROS_ELEGIBLES,
  apariciones,
  capitulosDeCarpeta,
  capitulosDeProyecto,
  claveDia,
  conMayuscula,
  etiquetaGenero,
  plural,
  porcentajeObjetivo,
  racha,
} from './derivados';
import type { Capitulo, Carpeta, Personaje, Proyecto } from './tipos';

function cap(texto: string, id = 'c'): Capitulo {
  return {
    id,
    ruta: `Manuscrito/${id}.md`,
    titulo: id,
    estado: 'Borrador',
    orden: 1,
    exportar: true,
    texto,
    modificado: '2026-08-21T00:00:00.000Z',
  };
}

function carpeta(nombre: string, capitulos: Capitulo[], subcarpetas: Carpeta[] = []): Carpeta {
  return { nombre, ruta: `Manuscrito/${nombre}`, icono: 'folder', subcarpetas, capitulos };
}

function proyecto(manuscrito: Carpeta[]): Proyecto {
  return {
    manifiesto: {
      id: 'proy-1',
      nombre: 'La casa del acantilado',
      genero: 'novela',
      ordenCarpetas: [],
      creado: '2026-08-21T00:00:00.000Z',
      modificado: '2026-08-21T00:00:00.000Z',
    },
    manuscrito,
    personajes: [],
    mundo: [],
    notas: [],
    lineaTemporal: { sucesos: [], modificado: '2026-08-21T00:00:00.000Z' },
  };
}

const ADELA: Personaje = {
  id: 'p1',
  nombre: 'Adela Rivas',
  apodos: ['«La forastera»', '«Ada»'],
  foto: null,
  edad: '34 años',
  aspecto: '',
  personalidad: '',
  trasfondo: '',
  arco: [],
  relaciones: [],
  notas: '',
  modificado: '2026-08-21T00:00:00.000Z',
};

describe('apariciones', () => {
  it('encuentra al personaje por su nombre de pila', () => {
    const capitulos = [cap('Adela llegó al pueblo.', 'a'), cap('Nadie dijo nada.', 'b')];
    expect(apariciones(ADELA, capitulos)).toBe(1);
  });

  it('cuenta también los apodos, sin las comillas angulares', () => {
    const capitulos = [cap('La forastera pagó por adelantado.', 'a'), cap('Ada volvió.', 'b')];
    expect(apariciones(ADELA, capitulos)).toBe(2);
  });

  it('no cuenta dos veces el mismo capítulo', () => {
    expect(apariciones(ADELA, [cap('Adela y Ada son la misma. Adela.', 'a')])).toBe(1);
  });

  it('ignora mayúsculas', () => {
    expect(apariciones(ADELA, [cap('ADELA gritó.', 'a')])).toBe(1);
  });

  it('devuelve cero si no aparece', () => {
    expect(apariciones(ADELA, [cap('Tomás cruzó el puente.', 'a')])).toBe(0);
  });

  it('no confunde un apodo corto con parte de otra palabra', () => {
    // «Ada» vive dentro de «nada», «cada» y «espada».
    const capitulos = [cap('Nadie dijo nada, cada uno a lo suyo.', 'a')];
    expect(apariciones(ADELA, capitulos)).toBe(0);
  });

  it('reconoce el nombre pegado a signos de puntuación', () => {
    expect(apariciones(ADELA, [cap('—¿Adela? —preguntó él.', 'a')])).toBe(1);
    expect(apariciones(ADELA, [cap('Era Ada, sin duda.', 'b')])).toBe(1);
  });
});

describe('racha', () => {
  const hoy = new Date('2026-08-21T12:00:00');
  const dia = (offset: number) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + offset);
    return claveDia(d);
  };

  it('cuenta los días seguidos hacia atrás', () => {
    const actividad = { [dia(0)]: 500, [dia(-1)]: 300, [dia(-2)]: 120 };
    expect(racha(actividad, hoy)).toBe(3);
  });

  it('no rompe la racha si hoy aún no ha escrito', () => {
    const actividad = { [dia(-1)]: 300, [dia(-2)]: 120 };
    expect(racha(actividad, hoy)).toBe(2);
  });

  it('se rompe con un día en blanco', () => {
    const actividad = { [dia(0)]: 500, [dia(-2)]: 120 };
    expect(racha(actividad, hoy)).toBe(1);
  });

  it('es cero sin actividad', () => {
    expect(racha({}, hoy)).toBe(0);
  });
});

describe('porcentajeObjetivo', () => {
  it('calcula el porcentaje del día', () => {
    expect(porcentajeObjetivo({ [claveDia()]: 320 }, 500)).toBe(64);
  });

  it('no pasa del cien por cien', () => {
    expect(porcentajeObjetivo({ [claveDia()]: 900 }, 500)).toBe(100);
  });

  it('no divide por cero', () => {
    expect(porcentajeObjetivo({ [claveDia()]: 100 }, 0)).toBe(0);
  });
});

// El recuento de capítulos estaba escrito tres veces y una de ellas —la de la
// Biblioteca— sumaba solo el primer nivel. Estos casos fijan que el recorrido
// canónico sí entra en las subcarpetas, que es lo que `leerCarpeta` construye
// y lo que baja de Drive.
describe('capitulosDeCarpeta y capitulosDeProyecto', () => {
  const anidado = carpeta('Parte I', [cap('uno', 'a')], [
    carpeta('Escenas sueltas', [cap('dos', 'b'), cap('tres', 'c')]),
  ]);

  it('cuenta los capítulos de las subcarpetas, no solo los del primer nivel', () => {
    expect(capitulosDeCarpeta(anidado)).toHaveLength(3);
  });

  it('baja por varios niveles de anidamiento', () => {
    const hondo = carpeta('Parte I', [], [carpeta('A', [], [carpeta('B', [cap('hondo', 'd')])])]);
    expect(capitulosDeCarpeta(hondo)).toHaveLength(1);
  });

  it('suma todas las partes del manuscrito', () => {
    const p = proyecto([anidado, carpeta('Parte II', [cap('cuatro', 'e')])]);
    expect(capitulosDeProyecto(p)).toHaveLength(4);
  });

  it('es cero en un proyecto recién creado, sin ninguna parte', () => {
    expect(capitulosDeProyecto(proyecto([]))).toHaveLength(0);
  });
});

describe('plural', () => {
  it('usa el singular solo con uno', () => {
    expect(plural(1, 'palabra', 'palabras')).toBe('1 palabra');
  });

  it('usa el plural con cero', () => {
    expect(plural(0, 'proyecto', 'proyectos')).toBe('0 proyectos');
  });

  // El separador de millares lo pone `toLocaleString`, que depende de la ICU
  // del entorno: aquí solo se fija que la unidad va en plural.
  it('usa el plural con más de uno', () => {
    expect(plural(1234, 'palabra', 'palabras')).toMatch(/ palabras$/);
  });
});

describe('conMayuscula', () => {
  it('pone en mayúscula la primera letra y deja el resto', () => {
    expect(conMayuscula('capítulo')).toBe('Capítulo');
    expect(conMayuscula('poema')).toBe('Poema');
  });

  it('aguanta la cadena vacía', () => {
    expect(conMayuscula('')).toBe('');
  });
});

// El diálogo de creación pintaba sus propias etiquetas a mano y podían dejar de
// coincidir con las del lomo y las del selector de proyecto.
describe('GENEROS_ELEGIBLES', () => {
  it('todos tienen etiqueta propia, ninguno cae en el «Nuevo» de reserva', () => {
    for (const g of GENEROS_ELEGIBLES) {
      expect(etiquetaGenero(g)).not.toBe('Nuevo');
    }
  });

  it('no ofrece «nuevo», que es el valor de reserva de los manifests antiguos', () => {
    expect(GENEROS_ELEGIBLES).not.toContain('nuevo');
  });

  it('todos tienen colores de lomo, que es lo que pinta el selector', () => {
    for (const g of GENEROS_ELEGIBLES) {
      expect(lomo[g]).toBeDefined();
    }
  });
});
