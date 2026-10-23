import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { File } from 'expo-file-system';

import { leerActividad } from './actividad';
import { type Ajustes, guardarAjustes, leerAjustes } from './ajustes';
import { capitulosDeProyecto } from './derivados';
import {
  borrarCapitulo,
  borrarNotaMundo,
  borrarNotaSuelta,
  borrarParte,
  borrarPersonaje,
  borrarProyecto,
  crearParte,
  crearProyecto,
  guardarCapitulo,
  guardarLineaTemporal,
  guardarNotaMundo,
  guardarNotaSuelta,
  guardarPersonaje,
  guardarPortada,
  inicializar,
  leerProyecto,
  listarProyectos,
  quitarPortada,
  renombrarParte,
  renombrarProyecto,
} from './almacen';
import type {
  Capitulo,
  GeneroProyecto,
  LineaTemporal,
  Manifiesto,
  NotaMundo,
  NotaSuelta,
  Personaje,
} from './tipos';

/**
 * Acceso a los datos desde la interfaz.
 *
 * Las escrituras son síncronas contra el disco local y después invalidan la
 * consulta correspondiente. No hay estados optimistas: escribir un fichero
 * local tarda milisegundos, así que fingir que ya pasó no aporta nada y sí
 * puede mentir.
 */

export const claves = {
  proyectos: ['proyectos'] as const,
  proyecto: (nombre: string) => ['proyecto', nombre] as const,
  actividad: ['actividad'] as const,
  ajustes: ['ajustes'] as const,
  corpus: ['corpus'] as const,
  continuar: ['continuar'] as const,
};

/**
 * Invalida todo lo que depende del contenido de un proyecto: su consulta, el
 * listado, el corpus de búsqueda y «Continuar donde lo dejaste». Olvidar
 * cualquiera de los dos últimos deja la búsqueda enseñando texto que ya no
 * existe.
 */
export function invalidarProyecto(cliente: QueryClient, nombre?: string): void {
  if (nombre) cliente.invalidateQueries({ queryKey: claves.proyecto(nombre) });
  cliente.invalidateQueries({ queryKey: claves.proyectos });
  cliente.invalidateQueries({ queryKey: claves.corpus });
  cliente.invalidateQueries({ queryKey: claves.continuar });
}

export function useProyectos() {
  return useQuery({
    queryKey: claves.proyectos,
    queryFn: async () => {
      inicializar();
      return listarProyectos();
    },
  });
}

export function useProyecto(nombre: string | undefined) {
  return useQuery({
    queryKey: claves.proyecto(nombre ?? ''),
    queryFn: () => leerProyecto(nombre as string),
    enabled: Boolean(nombre),
  });
}

export function useActividad() {
  return useQuery({ queryKey: claves.actividad, queryFn: leerActividad });
}

export function useAjustes() {
  return useQuery({ queryKey: claves.ajustes, queryFn: leerAjustes });
}

export function useGuardarAjustes() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: Ajustes) => guardarAjustes(a),
    onSuccess: () => cliente.invalidateQueries({ queryKey: claves.ajustes }),
  });
}

/**
 * Dónde estaba escribiendo, para «Continuar donde lo dejaste».
 *
 * Mira todos los proyectos, no solo el último tocado: crear un proyecto vacío
 * no significa haberlo empezado, y ofrecerle continuar en él sería inútil.
 * Manda el capítulo marcado «Escribiendo ahora»; si no hay ninguno, el capítulo
 * modificado más recientemente de toda la biblioteca.
 */
export function useContinuar() {
  return useQuery({
    queryKey: ['continuar'],
    queryFn: async () => {
      let mejor: { proyecto: string; capitulo: Capitulo; activo: boolean } | null = null;

      for (const m of await listarProyectos()) {
        const p = await leerProyecto(m.nombre);
        if (!p) continue;

        for (const c of capitulosDeProyecto(p)) {
          const activo = c.estado === 'Escribiendo ahora';
          if (!mejor) {
            mejor = { proyecto: m.nombre, capitulo: c, activo };
            continue;
          }
          if (activo && !mejor.activo) {
            mejor = { proyecto: m.nombre, capitulo: c, activo };
            continue;
          }
          if (activo === mejor.activo && c.modificado > mejor.capitulo.modificado) {
            mejor = { proyecto: m.nombre, capitulo: c, activo };
          }
        }
      }

      return mejor;
    },
  });
}

function useInvalidar(nombreProyecto: string | undefined) {
  const cliente = useQueryClient();
  return () => invalidarProyecto(cliente, nombreProyecto);
}

export function useCrearProyecto() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (v: { nombre: string; genero: GeneroProyecto }) =>
      crearProyecto(v.nombre, v.genero),
    onSuccess: () => invalidarProyecto(cliente),
  });
}


export function useRenombrarProyecto() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (v: { viejo: string; nuevo: string }) =>
      renombrarProyecto(v.viejo, v.nuevo),
    onSuccess: (m, v) => {
      // Sin manifiesto no se ha renombrado nada (el nombre estaba ocupado): la
      // consulta del proyecto de siempre sigue siendo válida y tirarla solo
      // provocaría una relectura de todo el disco.
      if (!m) return;
      // El nombre es parte de la clave: la consulta vieja ya no vale para nada.
      cliente.removeQueries({ queryKey: claves.proyecto(v.viejo) });
      invalidarProyecto(cliente, m.nombre);
    },
  });
}

/**
 * Pone (con un fichero) o quita (con null) la portada de un proyecto.
 * Una sola mutación para las dos cosas: invalidan exactamente lo mismo.
 */
export function useCambiarPortada() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (v: { proyecto: string; origen: File | null }) =>
      v.origen ? guardarPortada(v.proyecto, v.origen) : quitarPortada(v.proyecto),
    onSuccess: (_m, v) => invalidarProyecto(cliente, v.proyecto),
  });
}

export function useBorrarProyecto() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (nombre: string) => borrarProyecto(nombre),
    onSuccess: (_d, nombre) => {
      cliente.removeQueries({ queryKey: claves.proyecto(nombre) });
      invalidarProyecto(cliente);
    },
  });
}

export function useGuardarCapitulo(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (c: Capitulo) => guardarCapitulo(nombreProyecto as string, c),
    onSuccess: invalidar,
  });
}

export function useBorrarCapitulo(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (ruta: string) => borrarCapitulo(nombreProyecto as string, ruta),
    onSuccess: invalidar,
  });
}

export function useCrearParte(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (nombre: string) => crearParte(nombreProyecto as string, nombre),
    onSuccess: invalidar,
  });
}

export function useRenombrarParte(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (v: { ruta: string; nombre: string }) =>
      renombrarParte(nombreProyecto as string, v.ruta, v.nombre),
    onSuccess: invalidar,
  });
}

export function useBorrarParte(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (ruta: string) => borrarParte(nombreProyecto as string, ruta),
    onSuccess: invalidar,
  });
}

export function useGuardarPersonaje(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (v: { personaje: Personaje; nombreAnterior?: string }) =>
      guardarPersonaje(nombreProyecto as string, v.personaje, v.nombreAnterior),
    onSuccess: invalidar,
  });
}

export function useBorrarPersonaje(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (nombre: string) => borrarPersonaje(nombreProyecto as string, nombre),
    onSuccess: invalidar,
  });
}

export function useGuardarNotaMundo(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (v: { nota: NotaMundo; tituloAnterior?: string }) =>
      guardarNotaMundo(nombreProyecto as string, v.nota, v.tituloAnterior),
    onSuccess: invalidar,
  });
}

export function useBorrarNotaMundo(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (titulo: string) => borrarNotaMundo(nombreProyecto as string, titulo),
    onSuccess: invalidar,
  });
}

export function useGuardarNotaSuelta(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (n: NotaSuelta) => guardarNotaSuelta(nombreProyecto as string, n),
    onSuccess: invalidar,
  });
}

export function useBorrarNotaSuelta(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (id: string) => borrarNotaSuelta(nombreProyecto as string, id),
    onSuccess: invalidar,
  });
}

export function useGuardarLineaTemporal(nombreProyecto: string | undefined) {
  const invalidar = useInvalidar(nombreProyecto);
  return useMutation({
    mutationFn: async (l: LineaTemporal) => guardarLineaTemporal(nombreProyecto as string, l),
    onSuccess: invalidar,
  });
}
