import {
  crearProyecto,
  guardarCapitulo,
  guardarLineaTemporal,
  guardarNotaMundo,
  guardarNotaSuelta,
  guardarPersonaje,
  listarProyectos,
} from './almacen';
import { CARPETA_MANUSCRITO, ahora, nuevoId } from './rutas';
import type { Capitulo, EstadoCapitulo } from './tipos';

/**
 * Datos de ejemplo, tomados del prototipo.
 *
 * SOLO PARA DESARROLLO. No se llama nunca de forma automática: la app real
 * arranca vacía y es la usuaria quien crea su primer proyecto. Sembrar datos
 * falsos en el dispositivo de alguien que escribe de verdad sería una forma
 * rápida de perderle la confianza.
 */

type Semilla = { n: number; titulo: string; estado: EstadoCapitulo; texto: string };

const PARTE_I: Semilla[] = [
  {
    n: 1,
    titulo: 'La casa que no dormía',
    estado: 'Listo',
    texto:
      'La casa de la cuesta llevaba vacía desde el invierno del accidente.\n\nNadie quiso comprarla, ni siquiera por lo que pedían, que era casi nada.',
  },
  {
    n: 2,
    titulo: 'Cartas sin remite',
    estado: 'Revisado',
    texto:
      'Llegaban los martes, sin sello y sin nombre, y doña Elvira las quemaba antes de leerlas.\n\nO eso decía.',
  },
  {
    n: 3,
    titulo: 'El nombre de Adela',
    estado: 'Escribiendo ahora',
    texto: [
      '### Capítulo tres',
      '',
      'Adela llegó al pueblo el mismo día que la niebla, y durante años nadie fue capaz de decidir cuál de las dos había traído a la otra.',
      '',
      'Traía una maleta de cartón atada con cuerda de tender y un nombre que no era el suyo. En la fonda le preguntaron tres veces cómo se llamaba, y las tres veces contestó distinto, con la misma sonrisa cansada de quien ya ha aprendido que la verdad se paga.',
      '',
      'Doña Elvira la miró desde la ventana del primer piso y dijo, sin dirigirse a nadie: *esa mujer va a abrir algo que llevamos cuarenta años cerrando*.',
      '',
      'Nadie le llevó la contraria. En Valdeserena, cuando doña Elvira hablaba, hasta los perros bajaban la cabeza.',
      '',
      '✦ ✦ ✦',
      '',
      'La casa de la cuesta llevaba vacía desde el invierno del accidente. Adela pagó seis meses por adelantado y no preguntó por qué el alquiler era tan barato.',
    ].join('\n'),
  },
  {
    n: 4,
    titulo: 'Lo que la niebla trajo',
    estado: 'Borrador',
    texto: 'La niebla bajó antes de tiempo aquel jueves, y con ella volvió el olor a serrín.',
  },
];

const PARTE_II: Semilla[] = [
  { n: 5, titulo: 'La grieta del pozo', estado: 'Borrador', texto: 'El pozo llevaba tapiado desde antes de que ella naciera.' },
  { n: 6, titulo: 'Doña Elvira reconoce la cicatriz', estado: 'Revisado', texto: 'Y decidió callar, de momento.' },
  { n: 7, titulo: 'Lo que se dijo en la fonda', estado: 'Borrador', texto: 'Se dijeron muchas cosas. Casi ninguna cierta.' },
  { n: 8, titulo: 'El pozo, por dentro', estado: 'Borrador', texto: 'Toca escribir esto.' },
  { n: 9, titulo: 'Marc pregunta dos veces', estado: 'Listo', texto: 'La primera por curiosidad. La segunda ya no.' },
];

function capitulo(carpeta: string, s: Semilla): Capitulo {
  return {
    id: nuevoId('cap'),
    ruta: `${CARPETA_MANUSCRITO}/${carpeta}/x.md`,
    titulo: s.titulo,
    estado: s.estado,
    orden: s.n,
    exportar: true,
    texto: s.texto,
    modificado: ahora(),
  };
}

export async function sembrarEjemplo(): Promise<void> {
  if ((await listarProyectos()).length > 0) return;

  // --- Proyecto principal --------------------------------------------------
  const principal = crearProyecto('El jardín de las horas muertas', 'novela');
  const p = principal.nombre;

  for (const s of PARTE_I) guardarCapitulo(p, capitulo('Parte I — El invierno', s));
  for (const s of PARTE_II) guardarCapitulo(p, capitulo('Parte II — La grieta', s));

  guardarPersonaje(p, {
    id: nuevoId('per'),
    nombre: 'Adela Rivas',
    apodos: ['Protagonista', '«La forastera»', '«Ada»'],
    foto: null,
    edad: '34 años',
    aspecto:
      'Alta, huesuda, manos de trabajar la tierra. Una cicatriz fina cruzándole la ceja izquierda que nunca explica. Se recoge el pelo con lo primero que encuentra.',
    personalidad:
      'Cortés hasta que la acorralan. Miente por costumbre, no por maldad. Le cuesta aceptar ayuda y lo disimula con humor seco.',
    trasfondo:
      'Creció en la casa de acogida de Valdeserena hasta los once. Salió del pueblo la noche del incendio y volvió veintitrés años después sin decir a nadie por qué.',
    arco: [
      { id: nuevoId('hito'), titulo: 'Miente para sobrevivir', subtitulo: 'Capítulos 1 – 4', estado: 'hecho' },
      { id: nuevoId('hito'), titulo: 'La descubren y elige quedarse', subtitulo: 'Capítulos 5 – 9', estado: 'ahora' },
      { id: nuevoId('hito'), titulo: 'Dice su nombre en voz alta', subtitulo: 'Por escribir', estado: 'pendiente' },
    ],
    relaciones: [
      { id: nuevoId('rel'), nombre: 'Tomás Vega', descripcion: 'Hermano de leche · la protege' },
      { id: nuevoId('rel'), nombre: 'Doña Elvira', descripcion: 'Sabe quién es · la calla' },
      { id: nuevoId('rel'), nombre: 'Marc Cebrián', descripcion: 'Interés amoroso · desconfía' },
    ],
    notas:
      'Nunca dice mentiras sobre cosas pequeñas, solo sobre las importantes. Comprobar que esto se cumple en los capítulos 5 y 7.',
    modificado: ahora(),
  });

  guardarPersonaje(p, {
    id: nuevoId('per'),
    nombre: 'Tomás Vega',
    apodos: ['Hermano de leche'],
    foto: null,
    edad: '36 años',
    aspecto: 'Ancho, lento de andar, rápido de manos.',
    personalidad: 'Leal hasta el error.',
    trasfondo: 'Nunca salió del pueblo.',
    arco: [],
    relaciones: [],
    notas: '',
    modificado: ahora(),
  });

  guardarPersonaje(p, {
    id: nuevoId('per'),
    nombre: 'Doña Elvira',
    apodos: ['Antagonista'],
    foto: null,
    edad: '78 años',
    aspecto: 'Menuda, siempre de negro.',
    personalidad: 'Manda sin levantar la voz.',
    trasfondo: 'Lleva cuarenta años cerrando lo que Adela viene a abrir.',
    arco: [],
    relaciones: [],
    notas: '',
    modificado: ahora(),
  });

  guardarNotaMundo(p, {
    id: nuevoId('mundo'),
    titulo: 'La niebla de Valdeserena',
    etiquetas: [
      { id: nuevoId('et'), texto: 'Geografía', color: 'verde' },
      { id: nuevoId('et'), texto: 'Mitología', color: 'marron' },
    ],
    descripcion:
      'Baja del monte cada tarde de octubre y se queda hasta marzo. No es meteorología: en el pueblo se dice que la niebla devuelve cosas. Objetos perdidos, olores, gente que se fue.',
    reglas: [
      'Solo devuelve lo que alguien sigue echando de menos.',
      'Lo devuelto no dura más de una noche.',
      'Nadie habla de lo que le devolvió.',
    ],
    menciones: [],
    modificado: ahora(),
  });

  for (const texto of [
    '¿Y si la niebla no devuelve, sino que cobra?',
    'El título debería decirlo Tomás en voz alta en la parte II.',
    'Buscar cómo funcionaban las casas de acogida en los 80.',
  ]) {
    guardarNotaSuelta(p, { id: nuevoId('nota'), texto, creado: ahora(), modificado: ahora() });
  }

  guardarLineaTemporal(p, {
    sucesos: [
      {
        id: nuevoId('suc'),
        fecha: '1989 · INVIERNO',
        titulo: 'El incendio de la casa de acogida',
        descripcion: 'Adela tiene once años. Sale del pueblo esa misma noche.',
        estado: 'Revisado',
        capitulo: null,
      },
      {
        id: nuevoId('suc'),
        fecha: '2012 · OCTUBRE',
        titulo: 'Adela vuelve con la niebla',
        descripcion: 'Nadie la reconoce, salvo una persona.',
        estado: 'Listo',
        capitulo: null,
      },
      {
        id: nuevoId('suc'),
        fecha: '2012 · NOVIEMBRE',
        titulo: 'Doña Elvira reconoce la cicatriz',
        descripcion: 'Y decide callar, de momento.',
        estado: 'Escribiendo ahora',
        capitulo: null,
      },
      {
        id: nuevoId('suc'),
        fecha: 'SIN FECHA',
        titulo: 'La grieta del pozo (¿parte II?)',
        descripcion: 'Toca para escribir qué pasa aquí.',
        estado: null,
        capitulo: null,
      },
    ],
    modificado: ahora(),
  });

  // --- Otros dos proyectos, para que la biblioteca tenga cuerpo -------------
  const faro = crearProyecto('Cartas al faro', 'relatos');
  guardarCapitulo(faro.nombre, capitulo('Parte I', {
    n: 1,
    titulo: 'La primera carta',
    estado: 'Listo',
    texto: 'Querido nadie: hoy tampoco vino el barco.',
  }));

  crearProyecto('Raíz amarga', 'borrador');
}
