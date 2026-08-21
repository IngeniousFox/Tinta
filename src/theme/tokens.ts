/**
 * Valores del sistema de diseño que no caben en clases de Tailwind:
 * sombras, gradientes y parejas de color de lomo.
 * Fuente de verdad: TINTA-SPEC §3 (extraídos del prototipo).
 */

export const shadow = {
  /** Tarjeta estándar — casi imperceptible, el borde crema hace el trabajo. */
  card: '0px 1px 2px rgba(60, 40, 30, 0.05)',
  /** CTA vino / tarjeta "Continuar donde lo dejaste". */
  cta: '0px 10px 26px rgba(94, 31, 43, 0.28)',
  /** FAB. */
  fab: '0px 10px 24px rgba(94, 31, 43, 0.34)',
  /** Drawer abierto. */
  drawer: '12px 0px 40px rgba(42, 35, 32, 0.22)',
  /** Fila de capítulo activo. */
  chapterActive: '0px 2px 10px rgba(123, 45, 59, 0.10)',
} as const;

/** Gradientes: [inicio, fin]. */
export const gradient = {
  drawerHeader: ['#7B2D3B', '#4d1b25'],
  resumeCard: ['#7B2D3B', '#4d1b25'],
  projectChip: ['#7B2D3B', '#5E1F2B'],
} as const;

/** Pareja de colores del lomo de proyecto + color de su barra de progreso. */
export const lomo = {
  novela: { c1: '#7B2D3B', c2: '#5E1F2B', bar: '#7B2D3B' },
  relatos: { c1: '#3f5c48', c2: '#2b4234', bar: '#35513F' },
  borrador: { c1: '#7d5f4a', c2: '#5b4334', bar: '#6E5241' },
  nuevo: { c1: '#6E5241', c2: '#4a382b', bar: '#6E5241' },
} as const;

export type LomoKey = keyof typeof lomo;

/** Estados de capítulo y su punto de color. */
export const estadoCapitulo = {
  Listo: '#35513F',
  Revisado: '#6E5241',
  Borrador: '#D8C9B6',
  'Escribiendo ahora': '#7B2D3B',
} as const;

export type EstadoCapitulo = keyof typeof estadoCapitulo;

/** Franja interior que simula el lomo del libro. */
export const LOMO_INNER_SHADOW = 'inset 6px 0px 0px rgba(0, 0, 0, 0.22)';
