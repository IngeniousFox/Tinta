import { Directory, File, Paths } from 'expo-file-system';

import { RAIZ } from './rutas';

/**
 * Ajustes de la app. Uno solo y global.
 *
 * El objetivo diario vivía en el manifest de cada proyecto (así lo listaba la
 * spec §5), pero la interfaz siempre lo trató como global (§4.2.10: un único
 * stepper, un único anillo). Tener N copias solo producía rarezas: el anillo
 * leía la del proyecto tocado más recientemente, y cambiar el objetivo
 * reescribía —y resubía a Drive— todos los manifests.
 *
 * Vive junto a `actividad.json`, fuera de `Proyectos/`: es configuración de la
 * app, no contenido de la historia, así que no se sincroniza. Tras restaurar
 * en un móvil nuevo vuelve al valor por defecto — un toque para reponerlo.
 */

export type Ajustes = {
  objetivoDiario: number;
};

export const AJUSTES_POR_DEFECTO: Ajustes = { objetivoDiario: 500 };

function fichero(): File {
  return new File(new Directory(Paths.document, RAIZ), 'ajustes.json');
}

export async function leerAjustes(): Promise<Ajustes> {
  const f = fichero();
  if (!f.exists) return AJUSTES_POR_DEFECTO;
  try {
    const datos = JSON.parse(await f.text()) as Partial<Ajustes>;
    const objetivo = Number(datos.objetivoDiario);
    return {
      objetivoDiario: Number.isFinite(objetivo) && objetivo > 0
        ? objetivo
        : AJUSTES_POR_DEFECTO.objetivoDiario,
    };
  } catch {
    return AJUSTES_POR_DEFECTO;
  }
}

export function guardarAjustes(a: Ajustes): void {
  const f = fichero();
  const dir = f.parentDirectory;
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  if (!f.exists) f.create({ overwrite: true });
  f.write(`${JSON.stringify(a, null, 2)}\n`);
}
