import { TurboModuleRegistry } from 'react-native';

import type { ProveedorToken } from './sync';

/**
 * Sign-In de Google (TINTA-SPEC §7).
 *
 * El módulo nativo se carga con `require` perezoso dentro de un try/catch a
 * propósito: en Expo Go no existe, y un import estático tumbaría la app entera
 * al arrancar. Así seguimos pudiendo iterar la interfaz en Expo Go y la sesión
 * solo funciona de verdad en el development build, que es exactamente el reparto
 * de fases que describe §9.
 *
 * La cuenta ya vive en el teléfono: el selector del sistema, un toque, sin
 * contraseñas. La app nunca ve ni guarda credenciales — de eso se encarga la
 * librería.
 */

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

/** Client ID **web** de Google Cloud. Ver docs/credenciales.md. */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export type Cuenta = {
  nombre: string;
  email: string;
  foto: string | null;
};

type ModuloGoogle = {
  GoogleSignin: {
    configure(opciones: Record<string, unknown>): void;
    hasPlayServices(opciones?: Record<string, unknown>): Promise<boolean>;
    signIn(): Promise<unknown>;
    signInSilently(): Promise<unknown>;
    signOut(): Promise<void>;
    getTokens(): Promise<{ accessToken: string; idToken: string }>;
    getCurrentUser(): Promise<unknown>;
    clearCachedAccessToken(token: string): Promise<void>;
  };
};

let modulo: ModuloGoogle | null = null;
let configurado = false;

/**
 * ¿Está el módulo nativo en esta build? Se pregunta al registro de
 * TurboModules, que devuelve null sin lanzar. Es imprescindible preguntar
 * ANTES de hacer el `require`: en modo desarrollo, Metro convierte en fatal
 * (RedBox) cualquier módulo cuya carga lance, aunque el `require` esté dentro
 * de un try/catch — así que un `require` a ciegas tumbaría Expo Go entero.
 */
function nativoPresente(): boolean {
  try {
    return TurboModuleRegistry.get('RNGoogleSignin') != null;
  } catch {
    return false;
  }
}

/** Devuelve el módulo nativo, o null si no está disponible (Expo Go). */
function cargar(): ModuloGoogle | null {
  if (modulo) return modulo;
  if (!nativoPresente()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modulo = require('@react-native-google-signin/google-signin') as ModuloGoogle;
  } catch {
    modulo = null;
  }
  return modulo;
}

export function sesionDisponible(): boolean {
  return cargar() !== null && WEB_CLIENT_ID !== '';
}

/** Motivo por el que no se puede entrar, para poder decírselo con claridad. */
export function motivoNoDisponible(): string | null {
  if (WEB_CLIENT_ID === '') {
    return 'Falta el Client ID web. Revisa docs/credenciales.md.';
  }
  if (cargar() === null) {
    return 'El inicio de sesión necesita la app instalada, no Expo Go.';
  }
  return null;
}

function configurar(): ModuloGoogle {
  const m = cargar();
  if (!m) throw new Error('El módulo de Google Sign-In no está disponible.');

  if (!configurado) {
    m.GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      scopes: SCOPES,
      offlineAccess: false,
    });
    configurado = true;
  }
  return m;
}

function extraerCuenta(respuesta: unknown): Cuenta | null {
  const datos = respuesta as { data?: { user?: Record<string, unknown> }; user?: Record<string, unknown> };
  const usuario = datos?.data?.user ?? datos?.user;
  if (!usuario) return null;

  return {
    nombre: String(usuario.name ?? usuario.givenName ?? 'Sin nombre'),
    email: String(usuario.email ?? ''),
    foto: usuario.photo ? String(usuario.photo) : null,
  };
}

export async function entrar(): Promise<Cuenta | null> {
  const m = configurar();
  await m.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  return extraerCuenta(await m.GoogleSignin.signIn());
}

/** Reentrada sin interacción al abrir la app. Null si no había sesión. */
export async function entrarEnSilencio(): Promise<Cuenta | null> {
  try {
    const m = configurar();
    return extraerCuenta(await m.GoogleSignin.signInSilently());
  } catch {
    return null;
  }
}

export async function salir(): Promise<void> {
  try {
    const m = configurar();
    await m.GoogleSignin.signOut();
  } catch {
    // Salir nunca debe fallar de cara a la usuaria: si el módulo no está, ya
    // no hay sesión que cerrar.
  }
}

/**
 * Proveedor de token para la sincronización.
 *
 * `renovar` limpia el token cacheado antes de pedir otro: sin eso, la librería
 * devolvería el mismo token caducado y el reintento tras un 401 no serviría de
 * nada.
 */
export const proveedorGoogle: ProveedorToken = {
  async token() {
    const m = configurar();
    const { accessToken } = await m.GoogleSignin.getTokens();
    return accessToken;
  },

  async renovar() {
    const m = configurar();
    const { accessToken } = await m.GoogleSignin.getTokens();
    await m.GoogleSignin.clearCachedAccessToken(accessToken);
    const renovado = await m.GoogleSignin.getTokens();
    return renovado.accessToken;
  },
};
