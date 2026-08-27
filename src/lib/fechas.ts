/**
 * Fechas en lenguaje llano.
 *
 * En toda la app se dice «ayer» o «la semana pasada», nunca «21/08/2026». Para
 * quien escribe, lo que importa es cuánto hace que no toca un texto, no el día
 * exacto en que lo tocó.
 */
export function cuando(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';

  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) return 'Hace un momento';
  if (minutos < 60) return `Hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  if (dias < 14) return 'La semana pasada';
  if (dias < 60) return `Hace ${Math.floor(dias / 7)} semanas`;
  return `Hace ${Math.floor(dias / 30)} meses`;
}
