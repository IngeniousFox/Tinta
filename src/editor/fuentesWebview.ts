import { CourierPrime_400Regular } from '@expo-google-fonts/courier-prime';
import {
  Lora_400Regular,
  Lora_400Regular_Italic,
  Lora_600SemiBold,
} from '@expo-google-fonts/lora';
import { Manrope_500Medium } from '@expo-google-fonts/manrope';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import type { FuenteEditor } from './config';

/**
 * Las tipografías dentro del WebView.
 *
 * El WebView es un contexto aparte: no ve nada de lo que carga `expo-font`, así
 * que hay que meterle las fuentes por CSS. Traerlas de Google Fonts rompería la
 * escritura sin conexión, que en Tinta es el caso normal y no la excepción
 * (TINTA-SPEC §1.4) — así que se empotran como data URI desde los TTF del
 * propio bundle.
 *
 * Se carga solo el juego mínimo: redonda, cursiva y negrita. La negrita cursiva
 * la sintetiza el motor, que en una novela casi no aparece y no compensa otros
 * 137 KB. Manrope 500 va siempre porque es la fuente del título de capítulo.
 */

type Cara = {
  familia: string;
  peso: number;
  estilo: 'normal' | 'italic';
  modulo: number;
};

const MANROPE_H3: Cara = {
  familia: 'Manrope',
  peso: 500,
  estilo: 'normal',
  modulo: Manrope_500Medium as number,
};

const CARAS: Record<FuenteEditor, Cara[]> = {
  Lora: [
    { familia: 'Lora', peso: 400, estilo: 'normal', modulo: Lora_400Regular as number },
    { familia: 'Lora', peso: 400, estilo: 'italic', modulo: Lora_400Regular_Italic as number },
    { familia: 'Lora', peso: 600, estilo: 'normal', modulo: Lora_600SemiBold as number },
  ],
  Manrope: [MANROPE_H3],
  Maquina: [
    {
      familia: 'Courier Prime',
      peso: 400,
      estilo: 'normal',
      modulo: CourierPrime_400Regular as number,
    },
  ],
};

/** El coste de leer y codificar solo se paga una vez por familia y sesión. */
const cache = new Map<string, string>();

async function caraACss(cara: Cara): Promise<string> {
  const clave = `${cara.familia}-${cara.peso}-${cara.estilo}`;
  const cacheada = cache.get(clave);
  if (cacheada) return cacheada;

  const asset = await Asset.fromModule(cara.modulo).downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const base64 = await new File(uri).base64();

  const css =
    `@font-face{` +
    `font-family:'${cara.familia}';` +
    `font-weight:${cara.peso};` +
    `font-style:${cara.estilo};` +
    `font-display:swap;` +
    `src:url(data:font/ttf;base64,${base64}) format('truetype');` +
    `}`;

  cache.set(clave, css);
  return css;
}

/**
 * CSS de `@font-face` para la familia elegida, más Manrope para los títulos.
 * Devuelve cadena vacía si algo falla: el editor cae en la serif del sistema,
 * que es feo pero no impide escribir.
 */
export async function cssFuentes(seleccionada: FuenteEditor): Promise<string> {
  const caras = [...CARAS[seleccionada]];
  if (!caras.some((c) => c.familia === MANROPE_H3.familia)) {
    caras.push(MANROPE_H3);
  }

  try {
    const partes = await Promise.all(caras.map(caraACss));
    return partes.join('\n');
  } catch {
    return '';
  }
}
