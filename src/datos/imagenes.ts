import { File } from 'expo-file-system';

/**
 * Elegir una imagen del dispositivo.
 *
 * Usa el selector que trae `expo-file-system`, no `expo-image-picker`: el
 * primero ya está en la app y el segundo obligaría a una build nueva para algo
 * que el sistema operativo ya sabe hacer. A cambio no abre la cámara — solo
 * elige ficheros que ya existen, que para la foto de un personaje basta.
 *
 * Devuelve el `File` elegido, o null si la usuaria canceló. Se devuelve el
 * objeto y no su uri porque en Android el selector entrega un `content://`,
 * y solo el propio `File` sabe leer de ahí.
 */
export async function elegirImagen(): Promise<File | null> {
  if (!seleccionDisponible()) return null;

  const elegido = await File.pickFileAsync({ mimeTypes: ['image/*'] });

  // La API devuelve `{ result, canceled }`; cancelar no es un error.
  if (elegido.canceled || !elegido.result) return null;
  return elegido.result;
}

/** ¿Se puede elegir imagen en esta build? */
export function seleccionDisponible(): boolean {
  return typeof (File as unknown as { pickFileAsync?: unknown }).pickFileAsync === 'function';
}
