/**
 * Cliente mínimo de la API de Google Drive (TINTA-SPEC §6).
 *
 * Solo lo que Tinta necesita: encontrar o crear carpetas, subir y bajar
 * ficheros, y listar para comparar fechas. Nada de librerías cliente oficiales
 * —pesan megas y traen cien métodos que no usamos— sino `fetch` contra la API
 * REST, que es estable y se lee entero en una pantalla.
 *
 * El scope es `drive.file`: la app solo ve los ficheros que ella misma creó.
 * Eso significa que si la usuaria mueve una carpeta de sitio en Drive, dejamos
 * de verla — es el precio de no pedir acceso a todo su Drive, y compensa.
 */

const RAIZ_API = 'https://www.googleapis.com/drive/v3';
const RAIZ_SUBIDA = 'https://www.googleapis.com/upload/drive/v3';

export const MIME_CARPETA = 'application/vnd.google-apps.folder';

export type FicheroDrive = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  parents?: string[];
};

/**
 * Motivos con los que Drive contesta 403 cuando se le está pidiendo demasiado
 * deprisa. Google documenta para estos espera creciente, no rendirse: son tan
 * transitorios como un 429, y una restauración o el alta de un proyecto grande
 * los provoca a diario.
 */
const RAZONES_DE_RITMO = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'dailyLimitExceeded',
  'sharingRateLimitExceeded',
  // El formato nuevo de error no trae `reason`, solo este `status`.
  'RESOURCE_EXHAUSTED',
]);

/**
 * Motivos de 403 que sí significan «esta credencial no vale»: son los únicos
 * que arregla renovar el token. Un 403 de cuota o de permisos de fichero no se
 * arregla renovando nada, y tratarlo como caducidad gastaba una renovación
 * inútil y además saltaba la espera creciente.
 */
const RAZONES_DE_AUTENTICACION = new Set(['authError', 'UNAUTHENTICATED']);

/** Saca el `reason` que Drive pone dentro del cuerpo del error, si lo hay. */
export function razonDeDrive(cuerpo: string): string {
  try {
    const datos = JSON.parse(cuerpo) as {
      error?: { errors?: { reason?: string }[]; status?: string };
    };
    return datos.error?.errors?.[0]?.reason ?? datos.error?.status ?? '';
  } catch {
    // Drive no siempre contesta JSON (una pasarela por medio, por ejemplo).
    return '';
  }
}

export class ErrorDrive extends Error {
  constructor(
    message: string,
    readonly estado: number,
    /**
     * `reason` del cuerpo (`rateLimitExceeded`, `storageQuotaExceeded`,
     * `authError`…). Cadena vacía si no vino ninguno reconocible.
     */
    readonly razon: string = '',
  ) {
    super(message);
    this.name = 'ErrorDrive';
  }

  /** Un 401 significa token caducado: hay que renovarlo y reintentar. */
  get esAutenticacion(): boolean {
    return this.estado === 401 || (this.estado === 403 && RAZONES_DE_AUTENTICACION.has(this.razon));
  }

  /** Fallos que merecen reintento con espera creciente. */
  get esTransitorio(): boolean {
    if (this.estado === 429 || this.estado >= 500) return true;
    return this.estado === 403 && RAZONES_DE_RITMO.has(this.razon);
  }
}

async function pedir(
  token: string,
  url: string,
  opciones: RequestInit = {},
): Promise<Response> {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opciones.headers ?? {}),
    },
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text().catch(() => '');
    throw new ErrorDrive(
      `Drive respondió ${respuesta.status}: ${cuerpo.slice(0, 200)}`,
      respuesta.status,
      razonDeDrive(cuerpo),
    );
  }

  return respuesta;
}

/** Escapa comillas simples para las consultas `q` de Drive. */
function escapar(valor: string): string {
  return valor.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function buscarEnCarpeta(
  token: string,
  nombre: string,
  padre: string,
): Promise<FicheroDrive | null> {
  const q = [
    `name = '${escapar(nombre)}'`,
    `'${escapar(padre)}' in parents`,
    'trashed = false',
  ].join(' and ');

  const url =
    `${RAIZ_API}/files?q=${encodeURIComponent(q)}` +
    '&fields=files(id,name,mimeType,modifiedTime,parents)&pageSize=10';

  const datos = (await (await pedir(token, url)).json()) as { files: FicheroDrive[] };
  return datos.files[0] ?? null;
}

export async function listarCarpeta(token: string, padre: string): Promise<FicheroDrive[]> {
  const q = `'${escapar(padre)}' in parents and trashed = false`;
  const ficheros: FicheroDrive[] = [];
  let pagina: string | undefined;

  do {
    // El `pageToken` va codificado igual que la `q`: Google lo documenta como
    // cadena opaca, así que un `+` o un `/` dentro llegaría corrupto y tumbaría
    // la revisión entera de esa carpeta. Y 1000 —el máximo— en vez de 200 para
    // que un poemario largo quepa en una sola petición.
    const url =
      `${RAIZ_API}/files?q=${encodeURIComponent(q)}` +
      '&fields=nextPageToken,files(id,name,mimeType,modifiedTime,parents)&pageSize=1000' +
      (pagina ? `&pageToken=${encodeURIComponent(pagina)}` : '');

    const datos = (await (await pedir(token, url)).json()) as {
      files: FicheroDrive[];
      nextPageToken?: string;
    };
    ficheros.push(...datos.files);
    pagina = datos.nextPageToken;
  } while (pagina);

  return ficheros;
}

export async function crearCarpeta(
  token: string,
  nombre: string,
  padre?: string,
): Promise<FicheroDrive> {
  const cuerpo = {
    name: nombre,
    mimeType: MIME_CARPETA,
    ...(padre ? { parents: [padre] } : {}),
  };

  const respuesta = await pedir(token, `${RAIZ_API}/files?fields=id,name,mimeType,modifiedTime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

  return (await respuesta.json()) as FicheroDrive;
}

/** Devuelve la carpeta si ya existe; si no, la crea. Idempotente a propósito. */
export async function asegurarCarpeta(
  token: string,
  nombre: string,
  padre?: string,
): Promise<FicheroDrive> {
  if (padre) {
    const existente = await buscarEnCarpeta(token, nombre, padre);
    if (existente?.mimeType === MIME_CARPETA) return existente;
  } else {
    const q = [
      `name = '${escapar(nombre)}'`,
      `mimeType = '${MIME_CARPETA}'`,
      "'root' in parents",
      'trashed = false',
    ].join(' and ');
    const url = `${RAIZ_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime)`;
    const datos = (await (await pedir(token, url)).json()) as { files: FicheroDrive[] };
    if (datos.files[0]) return datos.files[0];
  }

  return crearCarpeta(token, nombre, padre);
}

/**
 * Sube un fichero de texto. Si `id` viene informado actualiza ese fichero; si
 * no, crea uno nuevo dentro de `padre`. Se usa subida multiparte porque hay que
 * mandar metadatos y contenido en la misma petición.
 */
export async function subirTexto(
  token: string,
  opciones: {
    id?: string;
    nombre: string;
    padre?: string;
    contenido: string;
    mimeType?: string;
  },
): Promise<FicheroDrive> {
  const { id, nombre, padre, contenido, mimeType = 'text/plain' } = opciones;
  const frontera = `tinta-${Math.random().toString(36).slice(2)}`;

  const metadatos: Record<string, unknown> = { name: nombre };
  // Los padres solo se mandan al crear: en una actualización, Drive los rechaza.
  if (!id && padre) metadatos.parents = [padre];

  const cuerpo = [
    `--${frontera}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadatos),
    `--${frontera}`,
    `Content-Type: ${mimeType}; charset=UTF-8`,
    '',
    contenido,
    `--${frontera}--`,
    '',
  ].join('\r\n');

  const url =
    `${RAIZ_SUBIDA}/files${id ? `/${id}` : ''}?uploadType=multipart` +
    '&fields=id,name,mimeType,modifiedTime';

  const respuesta = await pedir(token, url, {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${frontera}` },
    body: cuerpo,
  });

  return (await respuesta.json()) as FicheroDrive;
}

/**
 * Sube un fichero binario (fotos de personaje) desde su contenido en base64.
 *
 * Va aparte de `subirTexto` porque el cuerpo multiparte necesita
 * `Content-Transfer-Encoding: base64` — sin esa cabecera, Drive interpretaría
 * la cadena base64 como si fuera el contenido literal del fichero y guardaría
 * una imagen ilegible.
 */
export async function subirBinario(
  token: string,
  opciones: {
    id?: string;
    nombre: string;
    padre?: string;
    base64: string;
    mimeType: string;
  },
): Promise<FicheroDrive> {
  const { id, nombre, padre, base64, mimeType } = opciones;
  const frontera = `tinta-${Math.random().toString(36).slice(2)}`;

  const metadatos: Record<string, unknown> = { name: nombre };
  if (!id && padre) metadatos.parents = [padre];

  const cuerpo = [
    `--${frontera}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadatos),
    `--${frontera}`,
    `Content-Type: ${mimeType}`,
    'Content-Transfer-Encoding: base64',
    '',
    base64,
    `--${frontera}--`,
    '',
  ].join('\r\n');

  const url =
    `${RAIZ_SUBIDA}/files${id ? `/${id}` : ''}?uploadType=multipart` +
    '&fields=id,name,mimeType,modifiedTime';

  const respuesta = await pedir(token, url, {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${frontera}` },
    body: cuerpo,
  });

  return (await respuesta.json()) as FicheroDrive;
}

export async function descargarTexto(token: string, id: string): Promise<string> {
  const respuesta = await pedir(token, `${RAIZ_API}/files/${id}?alt=media`);
  return respuesta.text();
}

/** Descarga binaria, devuelta en base64 para escribirla con expo-file-system. */
export async function descargarBinario(token: string, id: string): Promise<string> {
  const respuesta = await pedir(token, `${RAIZ_API}/files/${id}?alt=media`);
  const buffer = await respuesta.arrayBuffer();

  // btoa por trozos: pasarle el array entero desborda la pila con ficheros
  // grandes, y una foto de móvil lo es.
  const bytes = new Uint8Array(buffer);
  const TROZO = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return globalThis.btoa(binario);
}

export async function borrar(token: string, id: string): Promise<void> {
  await pedir(token, `${RAIZ_API}/files/${id}`, { method: 'DELETE' });
}

/**
 * Manda algo a la papelera de Drive en vez de destruirlo.
 *
 * Para el borrado masivo se usa esto y no `borrar`: la papelera de Drive
 * conserva lo tirado unos 30 días, así que un arrepentimiento a los cinco
 * minutos tiene arreglo. Con `DELETE` no lo tendría.
 */
export async function aPapelera(token: string, id: string): Promise<void> {
  await pedir(token, `${RAIZ_API}/files/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

/** Busca una carpeta en la raíz de Mi unidad. No la crea si no existe. */
export async function buscarCarpetaRaiz(
  token: string,
  nombre: string,
): Promise<FicheroDrive | null> {
  const q = [
    `name = '${escapar(nombre)}'`,
    `mimeType = '${MIME_CARPETA}'`,
    "'root' in parents",
    'trashed = false',
  ].join(' and ');

  const url = `${RAIZ_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime)`;
  const datos = (await (await pedir(token, url)).json()) as { files: FicheroDrive[] };
  return datos.files[0] ?? null;
}
