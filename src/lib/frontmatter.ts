import type { EstadoCapitulo } from '@/theme/tokens';
import type { FrontmatterCapitulo } from '@/datos/tipos';

/**
 * Frontmatter YAML de los capítulos (TINTA-SPEC §6.1).
 *
 * No se usa una librería de YAML a propósito: el frontmatter que escribe Tinta
 * tiene cinco claves de tipo conocido, y un parser propio de treinta líneas no
 * puede sorprendernos con anclas, referencias ni tipos implícitos. Lo que sí
 * hace falta es tolerar que la usuaria abra el `.md` en Drive y lo toque a mano
 * — por eso al leer se acepta lo que venga y se rellena con valores por defecto
 * en vez de fallar. Un capítulo con el frontmatter roto debe seguir abriéndose:
 * lo que no se puede perder es la prosa.
 */

const DELIMITADOR = '---';

const ESTADOS: EstadoCapitulo[] = ['Listo', 'Revisado', 'Borrador', 'Escribiendo ahora'];

/** Una línea de frontmatter es `clave: valor`, y la clave es un identificador. */
const LINEA_CLAVE = /^[A-Za-z_][\w-]*\s*:/;

/** Las claves que escribe Tinta: al menos una tiene que estar para creérselo. */
const CLAVES_CONOCIDAS = ['titulo', 'estado', 'orden', 'exportar', 'id', 'modificado'];

function esEstado(v: string): v is EstadoCapitulo {
  return (ESTADOS as string[]).includes(v);
}

/** Entrecomilla solo si hace falta, para que el fichero siga siendo legible. */
function valorYaml(v: string): string {
  const necesitaComillas = /^\s|\s$|^["'>|@`%&*!?{}[\],#-]|:\s|\n/.test(v) || v === '';
  return necesitaComillas ? JSON.stringify(v) : v;
}

function leerValor(bruto: string): string {
  const v = bruto.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    try {
      return JSON.parse(v.startsWith("'") ? `"${v.slice(1, -1).replace(/"/g, '\\"')}"` : v);
    } catch {
      return v.slice(1, -1);
    }
  }
  return v;
}

export type CapituloEnDisco = {
  meta: FrontmatterCapitulo;
  texto: string;
};

/** Escribe el fichero completo: frontmatter + prosa. */
export function serializarCapitulo(meta: FrontmatterCapitulo, texto: string): string {
  const lineas = [
    DELIMITADOR,
    `titulo: ${valorYaml(meta.titulo)}`,
    `estado: ${valorYaml(meta.estado)}`,
    `orden: ${meta.orden}`,
    // Solo se escribe cuando es falso: lo normal es exportar, y así el fichero
    // de un capítulo corriente no lleva una línea de más.
    ...(meta.exportar ? [] : ['exportar: false']),
    `id: ${valorYaml(meta.id)}`,
    `modificado: ${valorYaml(meta.modificado)}`,
    DELIMITADOR,
    '',
    '',
  ];
  return `${lineas.join('\n')}${texto.trimEnd()}\n`;
}

/** `exportar: false` / `no` / `0` apagan la exportación; cualquier otra cosa, no. */
function leerBooleano(valor: string | undefined, porDefecto: boolean): boolean {
  if (valor === undefined) return porDefecto;
  const v = valor.trim().toLowerCase();
  if (v === 'false' || v === 'no' || v === '0') return false;
  if (v === 'true' || v === 'sí' || v === 'si' || v === 'yes' || v === '1') return true;
  return porDefecto;
}

function leerCampos(cabecera: string): Map<string, string> {
  const campos = new Map<string, string>();
  for (const linea of cabecera.split('\n')) {
    const sep = linea.indexOf(':');
    if (sep === -1) continue;
    const clave = linea.slice(0, sep).trim();
    if (!clave) continue;
    campos.set(clave, leerValor(linea.slice(sep + 1)));
  }
  return campos;
}

/**
 * ¿El bloque entre delimitadores es de verdad un frontmatter?
 *
 * Un `.md` tocado a mano puede empezar por una línea de guiones sin que eso sea
 * una cabecera. Si se da por buena, todo lo que hay hasta la siguiente línea de
 * guiones se lee como pares clave:valor, no se reconoce ninguno y desaparece:
 * el primer bloque de prosa se pierde en el siguiente guardado. Ante la duda,
 * fichero entero como prosa, que es la opción que nunca pierde texto.
 */
function pareceFrontmatter(cabecera: string, campos: Map<string, string>): boolean {
  const lineas = cabecera.split('\n').filter((l) => l.trim() !== '');
  if (lineas.length === 0) return false;
  if (!lineas.every((l) => LINEA_CLAVE.test(l))) return false;
  return CLAVES_CONOCIDAS.some((clave) => campos.has(clave));
}

/**
 * Lee un `.md` de capítulo. Nunca lanza: si el frontmatter falta o está roto,
 * devuelve valores por defecto y el fichero entero como prosa.
 */
export function parsearCapitulo(bruto: string, porDefecto: FrontmatterCapitulo): CapituloEnDisco {
  // Se quitan la marca de orden de bytes y lo que haya en blanco por delante:
  // es lo que deja cualquier editor externo, y sin quitarlo el frontmatter
  // entero se leería como prosa y el capítulo estrenaría id y fecha en cada
  // lectura.
  const normalizado = bruto.replace(/\r\n?/g, '\n').replace(/^\s+/, '');

  if (!normalizado.startsWith(`${DELIMITADOR}\n`)) {
    return { meta: porDefecto, texto: normalizado.trim() };
  }

  const cierre = normalizado.indexOf(`\n${DELIMITADOR}`, DELIMITADOR.length);
  if (cierre === -1) {
    return { meta: porDefecto, texto: normalizado.trim() };
  }

  const cabecera = normalizado.slice(DELIMITADOR.length + 1, cierre);
  const texto = normalizado.slice(cierre + DELIMITADOR.length + 1).replace(/^\n+/, '').trimEnd();

  const campos = leerCampos(cabecera);
  if (!pareceFrontmatter(cabecera, campos)) {
    return { meta: porDefecto, texto: normalizado.trim() };
  }

  const estadoBruto = campos.get('estado') ?? '';
  const ordenBruto = Number.parseInt(campos.get('orden') ?? '', 10);

  return {
    meta: {
      titulo: campos.get('titulo') || porDefecto.titulo,
      estado: esEstado(estadoBruto) ? estadoBruto : porDefecto.estado,
      orden: Number.isFinite(ordenBruto) ? ordenBruto : porDefecto.orden,
      exportar: leerBooleano(campos.get('exportar'), porDefecto.exportar),
      id: campos.get('id') || porDefecto.id,
      modificado: campos.get('modificado') || porDefecto.modificado,
    },
    texto,
  };
}
