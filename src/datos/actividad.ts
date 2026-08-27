import { Directory, File, Paths } from 'expo-file-system';

import type { Actividad } from './derivados';
import { claveDia } from './derivados';
import { RAIZ } from './rutas';

/**
 * Registro de palabras escritas por día.
 *
 * Es lo único que la app guarda y no es contenido de la historia, así que vive
 * fuera de `Proyectos/` — no tiene por qué aparecer entre sus carpetas de Drive.
 *
 * Hace falta persistirlo porque la racha no es derivable de los ficheros: cada
 * capítulo solo recuerda su última modificación, no el historial.
 */

const FICHERO = 'actividad.json';

function fichero(): File {
  return new File(new Directory(Paths.document, RAIZ), FICHERO);
}

export async function leerActividad(): Promise<Actividad> {
  const f = fichero();
  if (!f.exists) return {};
  try {
    const valor = JSON.parse(await f.text()) as unknown;
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      return valor as Actividad;
    }
  } catch {
    // Un registro corrupto solo cuesta la racha, no el texto. Se empieza de cero.
  }
  return {};
}

export async function registrarPalabras(escritas: number): Promise<Actividad> {
  if (escritas <= 0) return leerActividad();

  const actividad = await leerActividad();
  const hoy = claveDia();
  const actualizada: Actividad = { ...actividad, [hoy]: (actividad[hoy] ?? 0) + escritas };

  const f = fichero();
  const dir = f.parentDirectory;
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  if (!f.exists) f.create({ overwrite: true });
  f.write(`${JSON.stringify(actualizada, null, 2)}\n`);

  return actualizada;
}
