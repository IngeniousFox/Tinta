import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { pendientesDeSubida } from '@/datos/almacen';
import type { EstadoSync } from '@/datos/tipos';
import { cuando } from '@/lib/fechas';

import {
  type Cuenta,
  entrar as entrarGoogle,
  entrarEnSilencio,
  motivoNoDisponible,
  proveedorGoogle,
  salir as salirGoogle,
  sesionDisponible,
} from './auth';
import { borrarTodoEnDrive, olvidarIndices, reencolarTodoLocal, sincronizar } from './sync';

/** No re-chequear si el último ciclo fue hace menos de esto (TINTA-SPEC §6.3). */
const DESCANSO_MS = 60_000;

type ContextoSync = {
  estado: EstadoSync;
  cuenta: Cuenta | null;
  /** null si se puede entrar; si no, el motivo en lenguaje llano. */
  motivo: string | null;
  entrar: () => Promise<void>;
  salir: () => Promise<void>;
  sincronizarAhora: () => Promise<void>;
  /**
   * Manda la carpeta `Tinta` de Drive a la papelera. Solo desde el borrado
   * total de Ajustes. Devuelve false si en Drive no había nada.
   */
  vaciarDrive: () => Promise<boolean>;
};

const Contexto = createContext<ContextoSync>({
  estado: { tipo: 'sin-conexion' },
  cuenta: null,
  motivo: 'Sin inicializar',
  entrar: async () => {},
  salir: async () => {},
  sincronizarAhora: async () => {},
  vaciarDrive: async () => false,
});

/**
 * Sesión de Google y sincronización con Drive, juntas: no hay sync sin sesión,
 * y el estado visible («Guardado en Drive · hace 2 min») depende de ambas.
 *
 * El ciclo corre al arrancar y **cada vez que la app vuelve del segundo
 * plano**. Lo segundo no es un extra: Android puede mantener la app viva días
 * sin un arranque real, así que un chequeo solo de arranque podría no correr en
 * semanas (TINTA-SPEC §6.3).
 */
export function ProveedorSync({ children }: { children: ReactNode }) {
  const cliente = useQueryClient();
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [estado, setEstado] = useState<EstadoSync>(estadoLocal());
  const ultimo = useRef(0);
  const cuentaRef = useRef<Cuenta | null>(null);
  cuentaRef.current = cuenta;

  const ciclo = useCallback(
    async (forzado = false) => {
      if (!sesionDisponible() || !cuentaRef.current) {
        setEstado(estadoLocal());
        return;
      }
      if (!forzado && Date.now() - ultimo.current < DESCANSO_MS) return;

      ultimo.current = Date.now();
      setEstado({ tipo: 'sincronizando' });

      try {
        const r = await sincronizar(proveedorGoogle);

        if (r.errores.length > 0) {
          // Distinguir «no hay red» de «Drive rechazó algo» importa: lo primero
          // se arregla solo y no debe alarmar; lo segundo puede necesitar algo.
          // La distinción viene ya hecha desde `sincronizar`: adivinarla aquí
          // buscando «red» en el texto convertía a cualquier capítulo llamado
          // «Alfredo» en un problema de conexión.
          const soloRed = r.errores.every((e) => e.esRed);
          setEstado(
            soloRed
              ? { tipo: 'pendiente', enCola: pendientesDeSubida().length }
              : { tipo: 'error', mensaje: 'No se pudo guardar todo en Drive' },
          );
        } else {
          setEstado({ tipo: 'al-dia', desde: cuando(new Date().toISOString()).toLowerCase() });
        }

        if (r.bajados > 0) {
          // Llegó texto de fuera: hay que releerlo todo, no solo refrescar.
          cliente.invalidateQueries();
        }
      } catch {
        setEstado(estadoLocal());
      }
    },
    [cliente],
  );

  // Reentrada silenciosa al arrancar: si ya había sesión, no se pide nada.
  useEffect(() => {
    let vigente = true;
    if (sesionDisponible()) {
      entrarEnSilencio().then((c) => {
        if (vigente && c) {
          setCuenta(c);
          cuentaRef.current = c; // Mismo motivo que en `entrar`.
          ciclo(true);
        }
      });
    }
    return () => {
      vigente = false;
    };
  }, [ciclo]);

  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (siguiente: AppStateStatus) => {
      if (siguiente === 'active') ciclo();
    });
    return () => suscripcion.remove();
  }, [ciclo]);

  const valor = useMemo<ContextoSync>(
    () => ({
      estado,
      cuenta,
      motivo: motivoNoDisponible(),
      entrar: async () => {
        const c = await entrarGoogle();
        if (!c) return;
        setCuenta(c);
        // El ref se actualiza en el render siguiente, y `ciclo` lo consulta
        // para saber si hay sesión. Sin esta línea, la primera sincronización
        // tras entrar se cancelaba sola: la usuaria entraba y no bajaba nada.
        cuentaRef.current = c;
        await ciclo(true);
      },
      salir: async () => {
        await salirGoogle();
        olvidarIndices();
        // Salir es el primer paso de «Cambiar de cuenta», y el Drive de la
        // cuenta nueva está vacío. Las colas solo guardan lo que cambió desde
        // la última subida —hecha a la cuenta anterior—, así que sin volver a
        // encolar el árbol entero el primer ciclo con la otra cuenta no subiría
        // nada y la barra diría «Guardado en Drive» sobre un Drive sin una
        // línea. Todo pendiente es incómodo pero cierto.
        reencolarTodoLocal();
        setCuenta(null);
        cuentaRef.current = null;
        setEstado(estadoLocal());
      },
      sincronizarAhora: () => ciclo(true),
      vaciarDrive: async () => {
        if (!cuenta) return false;
        const habia = await borrarTodoEnDrive(proveedorGoogle);
        // Tras vaciar, el estado de «al día» ya no significa nada.
        setEstado(estadoLocal());
        ultimo.current = 0;
        return habia;
      },
    }),
    [estado, cuenta, ciclo],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSync(): ContextoSync {
  return useContext(Contexto);
}

/** Estado cuando no hay sesión o no hay red: lo escrito está a salvo en local. */
function estadoLocal(): EstadoSync {
  const cola = pendientesDeSubida().length;
  return cola > 0 ? { tipo: 'pendiente', enCola: cola } : { tipo: 'sin-conexion' };
}

/** Texto e icono del estado, compartidos por barra superior, drawer y editor. */
export function textoSync(estado: EstadoSync): { icono: string; texto: string; color: string } {
  switch (estado.tipo) {
    case 'al-dia':
      return { icono: 'cloud_done', texto: `Guardado en Drive · ${estado.desde}`, color: '#35513F' };
    case 'sincronizando':
      return { icono: 'cloud_sync', texto: 'Sincronizando…', color: '#6E5241' };
    case 'pendiente':
      return { icono: 'cloud_upload', texto: `${estado.enCola} por subir`, color: '#6E5241' };
    case 'sin-conexion':
      return { icono: 'offline_pin', texto: 'Disponible sin conexión', color: '#35513F' };
    case 'error':
      return { icono: 'cloud_off', texto: estado.mensaje, color: '#7B2D3B' };
  }
}

/**
 * Para incrustar el estado tras un «·»: baja solo la inicial, de modo que
 * «Guardado en Drive» quede «guardado en Drive» y no «guardado en drive»,
 * que es lo que hacía el toLowerCase() entero.
 */
export function textoSyncEnFrase(estado: EstadoSync): string {
  const { texto } = textoSync(estado);
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}
