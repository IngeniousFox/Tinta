import { Alert } from 'react-native';

import { uriDeRuta } from '@/datos/almacen';
import { useCambiarPortada } from '@/datos/consultas';
import { elegirImagen, seleccionDisponible } from '@/datos/imagenes';
import type { Manifiesto } from '@/datos/tipos';

/** Uri absoluto de la portada personalizada de un proyecto, o null si no tiene. */
export function uriPortada(m: Manifiesto): string | null {
  return m.portada ? uriDeRuta(m.nombre, m.portada) : null;
}

/**
 * Poner, cambiar y quitar la portada de un proyecto. Al quitarla, el proyecto
 * vuelve a pintar el lomo por defecto de su género.
 */
export function usePortada(m: Manifiesto | undefined) {
  const cambiar = useCambiarPortada();

  const poner = async () => {
    if (!m) return;
    if (!seleccionDisponible()) {
      Alert.alert(
        'Todavía no',
        'Elegir imágenes necesita la app actualizada. Esta versión aún no lo trae.',
      );
      return;
    }
    try {
      const origen = await elegirImagen();
      if (!origen) return;
      await cambiar.mutateAsync({ proyecto: m.nombre, origen });
    } catch (e) {
      Alert.alert('No se pudo usar esa imagen', (e as Error).message);
    }
  };

  const quitar = () => {
    if (m) cambiar.mutate({ proyecto: m.nombre, origen: null });
  };

  /** Si no hay portada, abre el selector; si la hay, pregunta qué hacer. */
  const menu = () => {
    if (!m) return;
    if (!m.portada) {
      void poner();
      return;
    }
    Alert.alert('Portada', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cambiar la portada', onPress: () => void poner() },
      { text: 'Quitar y usar la de por defecto', style: 'destructive', onPress: quitar },
    ]);
  };

  return { poner, quitar, menu, ocupada: cambiar.isPending };
}
