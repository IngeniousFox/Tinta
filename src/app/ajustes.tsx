import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Icon } from '@/components/Icon';
import { LabelSeccion, Tarjeta } from '@/components/ui';
import { borrarTodoLocal, pendientesDeSubida, rutaLocal } from '@/datos/almacen';
import { useAjustes, useGuardarAjustes, useProyectos } from '@/datos/consultas';
import { plural } from '@/datos/derivados';
import { textoSync, useSync } from '@/drive/SyncContext';
import { borde } from '@/theme/tokens';

const CARPETA_DRIVE = 'https://drive.google.com/drive/my-drive';

/** Ajustes (TINTA-SPEC §4.2.10). */
export default function Ajustes() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: ajustes } = useAjustes();
  const { data: proyectos } = useProyectos();
  const guardarAjustes = useGuardarAjustes();
  const cliente = useQueryClient();
  const [limpiando, setLimpiando] = useState(false);
  const { estado, cuenta, motivo, entrar, salir, sincronizarAhora, vaciarDrive } = useSync();

  const objetivo = ajustes?.objetivoDiario ?? 500;
  const pendientes = pendientesDeSubida().length;
  const sync = textoSync(estado);

  const cambiarObjetivo = (delta: number) => {
    const nuevo = Math.max(100, Math.min(3000, objetivo + delta));
    guardarAjustes.mutate({ objetivoDiario: nuevo });
  };

  const conectar = async () => {
    try {
      await entrar();
    } catch {
      Alert.alert('No se pudo entrar', 'Google no dejó completar el acceso. Prueba otra vez.');
    }
  };

  const cambiarCuenta = async () => {
    // Salir y volver a entrar: el selector del sistema deja elegir otra cuenta.
    await salir();
    await conectar();
  };

  /**
   * Dos confirmaciones, no una, y la segunda no repite la primera: explica lo
   * que la primera no dijo. Esto borra el trabajo de meses en los dos sitios a
   * la vez, así que un toque despistado en Ajustes no puede bastar.
   */
  const confirmarBorradoTotal = () => {
    const cuantos = proyectos?.length ?? 0;
    // El trozo de Drive lleva su propio espacio delante: si no, con cuenta sin
    // conectar quedaba un espacio suelto antes del punto.
    const enDrive = cuenta ? ` y de la carpeta Tinta del Drive de ${cuenta.email}` : '';
    // La frase se compone entera en cada rama en vez de encajar un sujeto
    // delante de un verbo fijo en plural: así no salen «No hay proyectos se
    // borrarán…» ni «1 proyecto se borrarán…».
    const queSeBorra =
      cuantos === 0
        ? `No hay ningún proyecto que borrar en este móvil${enDrive}.`
        : cuantos === 1
          ? `Tu único proyecto se borrará de este móvil${enDrive}.`
          : `Tus ${plural(cuantos, 'proyecto', 'proyectos')} se borrarán de este móvil${enDrive}.`;

    Alert.alert(
      '¿Borrarlo todo?',
      `${queSeBorra}\n\nEsto no es solo limpiar el móvil: se lleva también tus historias de Drive.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar…',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              '¿Seguro del todo?',
              cuenta
                ? 'La carpeta irá a la papelera de tu Drive, donde Google la guarda unos 30 días por si te arrepientes. Pasado ese plazo, no habrá forma de recuperarla.\n\nDe este móvil se borra al momento y sin vuelta atrás.'
                : 'No hay ninguna cuenta conectada, así que nada de esto está copiado en Drive. Si lo borras, se pierde para siempre y ahora mismo.',
              [
                { text: 'Mejor no', style: 'cancel' },
                { text: 'Sí, borrarlo todo', style: 'destructive', onPress: borrarTodo },
              ],
            ),
        },
      ],
    );
  };

  const borrarTodo = async () => {
    setLimpiando(true);
    try {
      // Drive primero: si falla, el móvil conserva la única copia que queda.
      // Al revés, un fallo aquí dejaría los ficheros en Drive y nada en local,
      // que es recuperable pero desconcierta.
      let habiaEnDrive = false;
      if (cuenta) habiaEnDrive = await vaciarDrive();

      borrarTodoLocal();
      cliente.clear();
      router.replace('/');

      Alert.alert(
        'Listo, está todo borrado',
        habiaEnDrive
          ? 'La carpeta Tinta está en la papelera de tu Drive por si acaso. El móvil ya está vacío.'
          : 'El móvil ya está vacío.',
      );
    } catch (e) {
      Alert.alert(
        'No se pudo borrar de Drive',
        `${(e as Error).message}\n\nNo se ha tocado nada del móvil, así que tus historias siguen aquí. Prueba otra vez cuando haya conexión.`,
      );
    } finally {
      setLimpiando(false);
    }
  };

  const cerrarSesion = () => {
    Alert.alert(
      '¿Cerrar sesión?',
      'Tus textos se quedan en este móvil y volverán a sincronizarse cuando entres de nuevo.',
      [
        { text: 'Seguir conectada', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: () => salir() },
      ],
    );
  };

  return (
    <View className="flex-1 bg-papel" style={{ paddingTop: insets.top }}>
      <View className="flex-none flex-row items-center gap-2 border-b border-borde px-3 pb-2.5 pt-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          className="h-10 w-10 items-center justify-center rounded-[12px]"
        >
          <Icon name="arrow_back" size={22} color="#5E1F2B" />
        </Pressable>
        <Text className="font-lora text-[18px] text-tinta">Ajustes</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* --- Cuenta --- */}
        <LabelSeccion className="mb-2.5">Cuenta</LabelSeccion>
        <Tarjeta className="p-4">
          {cuenta ? (
            <>
              <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-[13px] bg-vino">
                  <Text style={{ fontFamily: 'Lora_600SemiBold', fontSize: 17, color: '#FBF7F1' }}>
                    {cuenta.nombre.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-manrope-semibold text-[13.5px] text-tinta">
                    {cuenta.nombre}
                  </Text>
                  <Text numberOfLines={1} className="font-manrope-medium text-[11.5px] text-tinta-muted">
                    {cuenta.email}
                  </Text>
                </View>
              </View>
              <Text className="mt-3 font-manrope-medium text-[11.5px] leading-[18px] text-marron-light">
                Todo lo que escribes se guarda en el Drive de esta cuenta. Si cierras sesión, tus
                textos siguen aquí en el móvil y vuelven a sincronizarse al entrar de nuevo.
              </Text>
              <View className="mt-3.5 flex-row gap-2.5">
                <Pressable
                  onPress={cambiarCuenta}
                  className="flex-1 items-center rounded-[12px] border border-borde-strong bg-papel-card py-3"
                >
                  <Text className="font-manrope-semibold text-[12.5px] text-vino-dark">
                    Cambiar de cuenta
                  </Text>
                </Pressable>
                <Pressable
                  onPress={cerrarSesion}
                  className="flex-1 items-center rounded-[12px] border border-borde-strong bg-papel-card py-3"
                >
                  <Text className="font-manrope-semibold text-[12.5px] text-marron">
                    Cerrar sesión
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-[13px] bg-papel-warm">
                  <Icon name="account_circle" size={24} color="#9b8a7c" />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-manrope-semibold text-[13.5px] text-tinta">
                    Sin cuenta conectada
                  </Text>
                  <Text className="font-manrope-medium text-[11.5px] text-tinta-muted">
                    Tus textos solo viven en este móvil
                  </Text>
                </View>
              </View>
              {motivo ? (
                <Text className="mt-3 font-manrope-medium text-[11.5px] leading-[18px] text-marron-light">
                  {motivo}
                </Text>
              ) : (
                <Pressable
                  onPress={conectar}
                  className="mt-3.5 flex-row items-center justify-center gap-2 rounded-[12px] bg-vino py-3"
                >
                  <Icon name="add_to_drive" size={18} color="#FBF7F1" />
                  <Text className="font-manrope-semibold text-[12.5px] text-papel">
                    Entrar con Google
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </Tarjeta>

        {/* --- Objetivo diario --- */}
        <LabelSeccion className="mb-2.5 mt-6">Objetivo diario</LabelSeccion>
        <Tarjeta className="p-4">
          <Text className="font-manrope-medium text-[12.5px] text-marron">
            Palabras al día. Alimenta el anillo de la biblioteca y la racha.
          </Text>
          <View className="mt-3.5 flex-row items-center gap-3.5">
            <Pressable
              onPress={() => cambiarObjetivo(-100)}
              className="h-12 w-12 items-center justify-center rounded-[14px] bg-papel-warm"
            >
              <Icon name="remove" size={20} color="#5E1F2B" />
            </Pressable>
            <View className="flex-1 items-center">
              <Text className="font-lora-medium text-[26px] text-tinta">{objetivo}</Text>
              <Text className="font-manrope-medium text-[11px] text-tinta-muted">palabras</Text>
            </View>
            <Pressable
              onPress={() => cambiarObjetivo(100)}
              className="h-12 w-12 items-center justify-center rounded-[14px] bg-papel-warm"
            >
              <Icon name="add" size={20} color="#5E1F2B" />
            </Pressable>
          </View>
        </Tarjeta>

        {/* --- Drive --- */}
        <LabelSeccion className="mb-2.5 mt-6">Google Drive</LabelSeccion>
        <Tarjeta className="p-4">
          <View className="flex-row items-center gap-2.5">
            <Icon name={sync.icono} size={20} color={sync.color} />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="font-manrope-semibold text-[13px] text-tinta">
                {sync.texto}
              </Text>
              <Text className="font-manrope-medium text-[11px] text-tinta-muted">
                {pendientes > 0 ? `${pendientes} en cola · Tinta / Proyectos` : 'Tinta / Proyectos'}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => sincronizarAhora()}
            disabled={!cuenta}
            className="mt-3.5 flex-row items-center justify-center gap-2 rounded-[12px] bg-papel-warm py-3"
            style={!cuenta ? { opacity: 0.5 } : undefined}
          >
            <Icon name="sync" size={18} color="#5E1F2B" />
            <Text className="font-manrope-semibold text-[12.5px] text-vino-dark">
              Sincronizar ahora
            </Text>
          </Pressable>

          <Pressable
            onPress={() => Linking.openURL(CARPETA_DRIVE)}
            className="mt-2.5 flex-row items-center justify-center gap-2 rounded-[12px] border border-borde-strong py-3"
          >
            <Icon name="open_in_new" size={18} color="#6E5241" />
            <Text className="font-manrope-semibold text-[12.5px] text-marron">
              Ver mis ficheros en Drive
            </Text>
          </Pressable>

          <Text className="mt-3 font-manrope-medium text-[11.5px] leading-[18px] text-marron-light">
            Tus capítulos son ficheros de texto normales y tus fichas, ficheros de datos legibles. Si
            algún día Tinta desapareciera, tus historias seguirían ahí y podrías abrirlas desde Drive
            o desde Documentos.
          </Text>
        </Tarjeta>

        {/* --- Empezar de cero --- */}
        <LabelSeccion className="mb-2.5 mt-6">Empezar de cero</LabelSeccion>
        <Tarjeta className="p-4" style={{ borderColor: borde.peligro }}>
          <View className="flex-row items-center gap-2">
            <Icon name="warning" size={18} color="#7B2D3B" />
            <Text className="font-manrope-semibold text-[13px] text-vino">Borrar todo</Text>
          </View>
          <Text className="mt-2 font-manrope-medium text-[12.5px] leading-[19px] text-marron">
            Borra tus proyectos, personajes y notas <Text className="font-manrope-semibold">de
            este móvil y también de tu Drive</Text>. No quedará ninguna copia.
          </Text>
          <Text className="mt-2 font-manrope-medium text-[11.5px] leading-[18px] text-marron-light">
            La carpeta de Drive va a la papelera, donde Google la guarda unos 30 días. Es la única
            red de seguridad que hay, y solo dura eso.
          </Text>
          <Pressable
            onPress={confirmarBorradoTotal}
            disabled={limpiando}
            accessibilityRole="button"
            className="mt-3.5 flex-row items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-dashed py-3"
            style={[{ borderColor: borde.peligro }, limpiando ? { opacity: 0.5 } : null]}
          >
            <Icon name="delete_forever" size={18} color="#7B2D3B" />
            <Text className="font-manrope-semibold text-[12.5px] text-vino">
              {limpiando ? 'Borrando…' : 'Borrar todo'}
            </Text>
          </Pressable>
        </Tarjeta>

        {/* --- Acerca de --- */}
        <LabelSeccion className="mb-2.5 mt-6">Acerca de</LabelSeccion>
        <Tarjeta className="p-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-manrope-medium text-[12.5px] text-tinta-body">Versión</Text>
            <Text className="font-manrope-semibold text-[12.5px] text-tinta-muted">
              {Constants.expoConfig?.version ?? '1.0.0'}
            </Text>
          </View>
          <View className="mt-3 border-t border-borde-soft pt-3">
            <Text className="font-manrope-medium text-[11px] leading-[17px] text-tinta-disabled">
              Carpeta local: {rutaLocal()}
            </Text>
          </View>
        </Tarjeta>
      </ScrollView>
    </View>
  );
}
