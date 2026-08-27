import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Pantalla } from '@/components/Chrome';
import { Icon } from '@/components/Icon';
import { BotonAnadir, EnlaceVolver, Tarjeta } from '@/components/ui';
import { TextoEditable } from '@/components/TextoEditable';
import { useBorrarNotaMundo, useGuardarNotaMundo, useProyecto } from '@/datos/consultas';
import { capitulosDeProyecto } from '@/datos/derivados';
import { ahora, nuevoId } from '@/datos/rutas';
import type { NotaMundo } from '@/datos/tipos';
import { borde } from '@/theme/tokens';

/** Nota de mundo (TINTA-SPEC §4.2.6). */
export default function DetalleMundo() {
  const { proyecto, id } = useLocalSearchParams<{ proyecto: string; id: string }>();
  const router = useRouter();
  const { data, isLoading } = useProyecto(proyecto);
  const guardar = useGuardarNotaMundo(proyecto);
  const borrar = useBorrarNotaMundo(proyecto);

  const nota = data?.mundo.find((n) => n.id === id) ?? null;
  const base = `/p/${encodeURIComponent(proyecto)}`;

  if (!nota) {
    // Cargando y «ya no existe» son cosas distintas: la segunda necesita una
    // salida, no una espera que no va a terminar nunca.
    return (
      <Pantalla proyecto={proyecto}>
        <View className="p-[18px]">
          {isLoading ? (
            <Text className="font-manrope-medium text-[13px] text-tinta-muted">Cargando…</Text>
          ) : (
            <>
              <Text className="font-lora text-[16px] text-tinta">Esta nota ya no está</Text>
              <Text className="mt-1.5 font-manrope-medium text-[12.5px] text-tinta-muted">
                Puede que se haya borrado desde otro sitio.
              </Text>
              <EnlaceVolver etiqueta="Mundo" onPress={() => router.push(`${base}/mundo` as never)} />
            </>
          )}
        </View>
      </Pantalla>
    );
  }

  const actualizar = (parcial: Partial<NotaMundo>) =>
    guardar.mutate({
      nota: { ...nota, ...parcial, modificado: ahora() },
      // Si cambia el título, el fichero viejo debe retirarse, no duplicarse.
      tituloAnterior: nota.titulo,
    });

  /**
   * Capítulos donde aparece la última palabra del título. Derivado, nunca
   * guardado. Con una palabra de menos de tres letras no se busca: casaría
   * dentro de cualquier cosa y la lista sería puro ruido.
   */
  const palabraClave = nota.titulo.toLowerCase().split(' ').filter(Boolean).at(-1) ?? '';
  const mencionada =
    data && palabraClave.length >= 3
      ? capitulosDeProyecto(data).filter((c) => c.texto.toLowerCase().includes(palabraClave))
      : [];

  return (
    <Pantalla proyecto={proyecto}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between">
          <EnlaceVolver etiqueta="Mundo" onPress={() => router.push(`${base}/mundo` as never)} />
          <View className="flex-row items-center gap-1">
            <Icon name="stylus" size={13} color="#b3a597" />
            <Text className="font-manrope-medium text-[10.5px] text-tinta-disabled">
              Toca cualquier texto para editarlo
            </Text>
          </View>
        </View>

        <TextoEditable
          valor={nota.titulo}
          onGuardar={(titulo) => actualizar({ titulo })}
          style={{ marginTop: 14, fontFamily: 'Lora_400Regular', fontSize: 22, color: '#2A2320' }}
        />

        <View className="mt-2.5 flex-row flex-wrap gap-1.5">
          {nota.etiquetas.map((e, i) => (
            <View
              key={e.id}
              className="rounded-pill px-2.5 py-1.5"
              style={{ backgroundColor: e.color === 'verde' ? 'rgba(53,81,63,0.10)' : 'rgba(110,82,65,0.10)' }}
            >
              <TextoEditable
                valor={e.texto}
                onGuardar={(texto) => {
                  const etiquetas = [...nota.etiquetas];
                  if (texto.trim() === '') etiquetas.splice(i, 1);
                  else etiquetas[i] = { ...e, texto };
                  actualizar({ etiquetas });
                }}
                style={{
                  fontFamily: 'Manrope_600SemiBold',
                  fontSize: 11,
                  color: e.color === 'verde' ? '#35513F' : '#6E5241',
                }}
              />
            </View>
          ))}
          <Pressable
            onPress={() =>
              actualizar({
                etiquetas: [...nota.etiquetas, { id: nuevoId('et'), texto: 'Etiqueta', color: 'marron' }],
              })
            }
            className="rounded-pill bg-papel-warm px-2.5 py-1.5"
          >
            <Text className="font-manrope-semibold text-[11px] text-marron-light">+ etiqueta</Text>
          </Pressable>
        </View>

        <Tarjeta className="mt-4 p-4">
          <TextoEditable
            valor={nota.descripcion}
            onGuardar={(descripcion) => actualizar({ descripcion })}
            placeholder="Describe este rincón del mundo…"
            multilinea
            style={{ fontFamily: 'Lora_400Regular', fontSize: 14.5, lineHeight: 25, color: '#3f352f' }}
          />
        </Tarjeta>

        <View className="mt-3 rounded-[16px] border border-borde-verde bg-papel-crema p-4">
          <Text className="font-manrope-semibold text-[11px] uppercase tracking-label text-verde">
            Reglas del mundo
          </Text>
          <View className="mt-3 gap-2.5">
            {nota.reglas.map((regla, i) => (
              <View key={i} className="flex-row gap-2.5">
                <Text className="font-lora text-[13.5px] leading-[22px] text-verde">{i + 1}.</Text>
                <TextoEditable
                  valor={regla}
                  onGuardar={(texto) => {
                    const reglas = [...nota.reglas];
                    if (texto.trim() === '') reglas.splice(i, 1);
                    else reglas[i] = texto;
                    actualizar({ reglas });
                  }}
                  multilinea
                  className="flex-1"
                  style={{ fontFamily: 'Lora_400Regular', fontSize: 13.5, lineHeight: 22, color: '#3f352f' }}
                />
              </View>
            ))}
          </View>
          <BotonAnadir
            etiqueta="Añadir regla"
            color="#35513F"
            className="mt-3"
            onPress={() => actualizar({ reglas: [...nota.reglas, 'Toca para escribir la regla.'] })}
          />
        </View>

        {mencionada.length > 0 ? (
          <Tarjeta className="mt-3 p-4">
            <Text className="font-manrope-semibold text-[11px] uppercase tracking-label text-tinta-muted">
              Mencionada en
            </Text>
            <View className="mt-2.5">
              {mencionada.map((c, i) => (
                <Pressable
                  key={c.id}
                  onPress={() => router.push(`${base}/editor?ruta=${encodeURIComponent(c.ruta)}` as never)}
                  className={`flex-row items-center gap-2.5 py-2.5 ${i > 0 ? 'border-t border-borde-soft' : ''}`}
                >
                  <Icon name="description" size={18} color="#c0b2a3" />
                  <Text numberOfLines={1} className="flex-1 font-manrope-medium text-[13px] text-vino">
                    {c.orden}. {c.titulo}
                  </Text>
                  <Icon name="north_east" size={17} color="#d4c8ba" />
                </Pressable>
              ))}
            </View>
          </Tarjeta>
        ) : null}

        <Pressable
          onPress={() =>
            Alert.alert(
              `¿Borrar «${nota.titulo}»?`,
              'Se borrará la nota y sus reglas, aquí y en Drive.',
              [
                { text: 'Conservar', style: 'cancel' },
                {
                  text: 'Borrar nota',
                  style: 'destructive',
                  onPress: () => {
                    borrar.mutate(nota.titulo);
                    router.push(`${base}/mundo` as never);
                  },
                },
              ],
            )
          }
          accessibilityRole="button"
          accessibilityLabel="Borrar esta nota"
          className="mt-3 flex-row items-center justify-center gap-1.5 rounded-[13px] border-[1.5px] border-dashed py-3"
          style={{ borderColor: borde.peligro }}
        >
          <Icon name="delete" size={17} color="#7B2D3B" />
          <Text className="font-manrope-semibold text-[12px] text-vino">Borrar esta nota</Text>
        </Pressable>
      </ScrollView>
    </Pantalla>
  );
}
