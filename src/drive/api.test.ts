import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDrive, listarCarpeta, razonDeDrive } from './api';

/** Cuerpo de error tal y como lo escribe Drive v3. */
function cuerpo(razon: string, mensaje = 'no'): string {
  return JSON.stringify({ error: { errors: [{ reason: razon, message: mensaje }], code: 403 } });
}

describe('razonDeDrive', () => {
  it('saca el reason del formato clásico', () => {
    expect(razonDeDrive(cuerpo('rateLimitExceeded'))).toBe('rateLimitExceeded');
  });

  it('cae en el status cuando no hay lista de errores', () => {
    expect(razonDeDrive(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }))).toBe(
      'RESOURCE_EXHAUSTED',
    );
  });

  it('no se rompe si el cuerpo no es JSON', () => {
    expect(razonDeDrive('<html>502 Bad Gateway</html>')).toBe('');
    expect(razonDeDrive('')).toBe('');
  });
});

describe('ErrorDrive: qué merece renovar el token y qué merece esperar', () => {
  it('un 401 es caducidad de sesión', () => {
    const e = new ErrorDrive('caducado', 401);
    expect(e.esAutenticacion).toBe(true);
    expect(e.esTransitorio).toBe(false);
  });

  it('el 403 de ritmo es transitorio, no autenticación', () => {
    // Este es el caso que rompía: se renovaba el token para nada y, al repetirse,
    // se lanzaba sin esperar ni un milisegundo.
    for (const razon of ['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded']) {
      const e = new ErrorDrive('demasiado deprisa', 403, razon);
      expect(e.esAutenticacion).toBe(false);
      expect(e.esTransitorio).toBe(true);
    }
  });

  it('el 403 de espacio o de permisos no se arregla ni renovando ni esperando', () => {
    for (const razon of ['storageQuotaExceeded', 'insufficientFilePermissions']) {
      const e = new ErrorDrive('no cabe', 403, razon);
      expect(e.esAutenticacion).toBe(false);
      expect(e.esTransitorio).toBe(false);
    }
  });

  it('el 403 de credenciales sí es autenticación', () => {
    const e = new ErrorDrive('credenciales', 403, 'authError');
    expect(e.esAutenticacion).toBe(true);
  });

  it('un 403 sin razón reconocible no gasta una renovación de sesión', () => {
    const e = new ErrorDrive('vete a saber', 403);
    expect(e.esAutenticacion).toBe(false);
  });

  it('429 y 5xx siguen siendo transitorios', () => {
    expect(new ErrorDrive('espera', 429).esTransitorio).toBe(true);
    expect(new ErrorDrive('servidor', 503).esTransitorio).toBe(true);
    expect(new ErrorDrive('petición mala', 400).esTransitorio).toBe(false);
  });
});

describe('listarCarpeta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('codifica el pageToken, que Drive documenta como cadena opaca', async () => {
    const urls: string[] = [];
    const paginas = [
      { files: [{ id: '1' }], nextPageToken: 'a+b/c=&d' },
      { files: [{ id: '2' }] },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return { ok: true, json: async () => paginas[urls.length - 1] } as Response;
      }),
    );

    const ficheros = await listarCarpeta('token', 'idPadre');

    expect(ficheros).toHaveLength(2);
    expect(urls[1]).toContain('&pageToken=a%2Bb%2Fc%3D%26d');
    // Sin codificar, el `&` habría partido la URL en un parámetro inventado.
    expect(urls[1]).not.toContain('pageToken=a+b/c=&d');
  });
});
