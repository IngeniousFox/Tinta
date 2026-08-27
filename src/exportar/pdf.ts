import { Directory, File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { nombreSeguro } from '@/datos/rutas';
import type { Proyecto } from '@/datos/tipos';

import { type OpcionesExportacion, generarHtml } from './html';

export {
  OPCIONES_POR_DEFECTO,
  type OpcionesExportacion,
  type ResumenExportacion,
  generarHtml,
  resumenExportacion,
} from './html';

/**
 * El lado nativo de la exportación: renderizar el HTML a PDF y abrir la hoja
 * de compartir del sistema (desde ahí se guarda en Drive, se manda por
 * WhatsApp…).
 *
 * Los módulos nativos se cargan con `require` perezoso, y ANTES se pregunta si
 * existen con `requireOptionalNativeModule`, que devuelve null sin lanzar. El
 * orden importa: en modo desarrollo, Metro convierte en fatal (RedBox) la carga
 * de un módulo que lance, aunque el `require` vaya dentro de un try/catch. Con
 * la pregunta previa, una build que no lleve expo-print simplemente dice que
 * necesita actualizarse, y Expo Go sigue arrancando.
 */

type ModuloPrint = {
  printToFileAsync: (o: {
    html: string;
    width?: number;
    height?: number;
    base64?: boolean;
  }) => Promise<{ uri: string; base64?: string }>;
};
type ModuloSharing = {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (uri: string, o?: { mimeType?: string; dialogTitle?: string; UTI?: string }) => Promise<void>;
};

function cargarNativos(): { print: ModuloPrint; sharing: ModuloSharing } | null {
  if (!requireOptionalNativeModule('ExpoPrint') || !requireOptionalNativeModule('ExpoSharing')) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const print = require('expo-print') as ModuloPrint;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharing = require('expo-sharing') as ModuloSharing;
    return { print, sharing };
  } catch {
    return null;
  }
}

export function exportacionDisponible(): boolean {
  return cargarNativos() !== null;
}

/** A4 en puntos (72 por pulgada), que es la unidad que usa expo-print. */
const A4 = { width: 595, height: 842 };

/**
 * Genera el PDF y abre la hoja de compartir del sistema. Devuelve la URI del
 * fichero generado.
 */
export async function exportarPdf(proyecto: Proyecto, opciones: OpcionesExportacion): Promise<string> {
  const nativos = cargarNativos();
  if (!nativos) {
    throw new Error('Exportar a PDF necesita la app actualizada (no está en esta versión).');
  }

  const html = generarHtml(proyecto, opciones);

  /**
   * Se pide el PDF **en base64** y lo escribimos nosotros, en vez de usar el
   * fichero que deja `expo-print`.
   *
   * Motivo: ese fichero vive en la carpeta del propio expo-print, que queda
   * fuera del ámbito que el `expo-file-system` nuevo autoriza — leerlo falla
   * con «Missing READ permission», y compartirlo directamente también (en Expo
   * Go, con «Not allowed to read file under given URL»). Escribiéndolo dentro
   * de la caché de la app no hay ninguna lectura ajena de por medio.
   *
   * De paso, el fichero sale con el nombre del proyecto: lo que llega a Drive
   * o a WhatsApp se llama «El jardín de las horas muertas.pdf» y no un hash.
   */
  const { uri, base64 } = await nativos.print.printToFileAsync({ html, ...A4, base64: true });

  const carpeta = new Directory(Paths.cache, 'Tinta', 'exportaciones');
  if (!carpeta.exists) carpeta.create({ intermediates: true, idempotent: true });
  const destino = new File(carpeta, `${nombreSeguro(proyecto.manifiesto.nombre, 'Manuscrito')}.pdf`);
  if (destino.exists) destino.delete();

  let compartible = uri;
  if (base64) {
    destino.create({ overwrite: true });
    destino.write(base64, { encoding: 'base64' });
    compartible = destino.uri;
  }

  if (await nativos.sharing.isAvailableAsync()) {
    await nativos.sharing.shareAsync(compartible, {
      mimeType: 'application/pdf',
      dialogTitle: `${proyecto.manifiesto.nombre} · PDF`,
      UTI: 'com.adobe.pdf',
    });
  }

  return compartible;
}
