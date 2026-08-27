import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pantalla } from '@/components/Chrome';
import { Icon } from '@/components/Icon';
import { TextoEditable } from '@/components/TextoEditable';
import { BotonAnadir, EnlaceVolver, LabelSeccion, PuntoEstado } from '@/components/ui';
import { useGuardarLineaTemporal, useProyecto } from '@/datos/consultas';
import { capitulosDeProyecto, unidad } from '@/datos/derivados';
import { ahora, nuevoId } from '@/datos/rutas';
import type { Capitulo, Suceso } from '@/datos/tipos';
import { estadoCapitulo } from '@/theme/tokens';

/** Línea temporal (TINTA-SPEC §4.2.8). */
export default function LineaTemporalPantalla() {
  const { proyecto } = useLocalSearchParams<{ proyecto: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useProyecto(proyecto);
  const guardar = useGuardarLineaTemporal(proyecto);

  const sucesos = data?.lineaTemporal.sucesos ?? [];
  const u = unidad(data?.manifiesto.genero);
  const capitulos = data ? capitulosDeProyecto(data) : [];
  const base = `/p/${encodeURIComponent(proyecto)}`;

  /** Índice del suceso eligiendo capítulo en la hoja de enlace. */
  const [enlazando, setEnlazando] = useState<number | null>(null);

  const actualizar = (indice: number, parcial: Partial<Suceso>) => {
    const nuevos = [...sucesos];
    nuevos[indice] = { ...nuevos[indice], ...parcial };
    guardar.mutate({ sucesos: nuevos, modificado: ahora() });
  };

  const confirmarBorrado = (indice: number) => {
    const s = sucesos[indice];
    Alert.alert(`¿Borrar «${s.titulo}»?`, 'El suceso desaparece de la línea temporal.', [
      { text: 'Conservar', style: 'cancel' },
      {
        text: 'Borrar suceso',
        style: 'destructive',
        onPress: () => {
          const nuevos = [...sucesos];
          nuevos.splice(indice, 1);
          guardar.mutate({ sucesos: nuevos, modificado: ahora() });
        },
      },
    ]);
  };

  const capituloDe = (s: Suceso): Capitulo | null =>
    s.capitulo ? (capitulos.find((c) => c.id === s.capitulo) ?? null) : null;

  return (
    <Pantalla proyecto={proyecto}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between">
          <EnlaceVolver etiqueta="Proyecto" onPress={() => router.push(base as never)} />
          <View className="flex-row items-center gap-1">
            <Icon name="stylus" size={13} color="#b3a597" />
            <Text className="font-manrope-medium text-[10.5px] text-tinta-disabled">
              Toca un suceso para editarlo
            </Text>
          </View>
        </View>

        <Text className="mt-3.5 font-lora text-[22px] leading-[27px] text-tinta">Línea temporal</Text>
        <Text className="mt-1.5 font-manrope-medium text-[12px] text-tinta-muted">
          Lo que pasó, aunque no esté escrito todavía
        </Text>

        <View className="mt-5">
          {sucesos.map((s, i) => {
            const enlazado = capituloDe(s);
            return (
              <View key={s.id} className="flex-row gap-3.5">
                <View className="w-4 items-center">
                  <PuntoEstado color={s.estado ? estadoCapitulo[s.estado] : null} tamano={11} />
                  {i < sucesos.length - 1 ? (
                    <View className="w-[1.5px] flex-1 bg-rail-divider" />
                  ) : null}
                </View>

                <View className="flex-1 pb-5">
                  <View className="flex-row items-center justify-between">
                    <TextoFecha
                      valor={s.fecha}
                      onGuardar={(fecha) => actualizar(i, { fecha })}
                    />
                    <Pressable
                      onPress={() => confirmarBorrado(i)}
                      hitSlop={14}
                      accessibilityRole="button"
                      accessibilityLabel={`Borrar el suceso «${s.titulo}»`}
                    >
                      <Icon name="delete" size={15} color="#d4c8ba" />
                    </Pressable>
                  </View>
                  <TextoSuceso
                    valor={s.titulo}
                    onGuardar={(titulo) => actualizar(i, { titulo })}
                  />
                  <TextoDescripcion
                    valor={s.descripcion}
                    onGuardar={(descripcion) => actualizar(i, { descripcion })}
                  />

                  {enlazado ? (
                    <Pressable
                      onPress={() =>
                        router.push(
                          `${base}/editor?ruta=${encodeURIComponent(enlazado.ruta)}` as never,
                        )
                      }
                      onLongPress={() => setEnlazando(i)}
                      delayLongPress={350}
                      // Sin `self-start` y con el texto encogible: un título
                      // largo no cabe en la columna y en React Native nada se
                      // encoge por su cuenta, así que se salía por la derecha.
                      className="mt-2 flex-row items-center gap-1.5"
                    >
                      <Icon name="link" size={15} color="#7B2D3B" />
                      <Text
                        numberOfLines={1}
                        className="flex-1 font-manrope-semibold text-[11.5px] text-vino"
                      >
                        Capítulo {enlazado.orden} · {enlazado.titulo}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => setEnlazando(i)}
                      className="mt-2 flex-row items-center gap-1.5 self-start"
                    >
                      <Icon name="add_link" size={15} color="#b3a597" />
                      <Text className="font-manrope-semibold text-[11.5px] text-tinta-disabled">
                        Enlazar {u.singular}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {sucesos.length === 0 ? (
          <Text className="mb-3 mt-2 text-center font-manrope-medium text-[12px] text-tinta-disabled">
            Aquí puedes ordenar lo que pasa, aunque aún no lo hayas escrito
          </Text>
        ) : null}

        <BotonAnadir
          etiqueta="Añadir suceso"
          onPress={() =>
            guardar.mutate({
              sucesos: [
                ...sucesos,
                {
                  id: nuevoId('suc'),
                  fecha: 'SIN FECHA',
                  titulo: 'Nuevo suceso',
                  descripcion: '',
                  estado: null,
                  capitulo: null,
                },
              ],
              modificado: ahora(),
            })
          }
        />
      </ScrollView>

      {/* Hoja de enlace a capítulo */}
      <Modal
        visible={enlazando !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEnlazando(null)}
      >
        <Pressable className="flex-1 bg-[rgba(42,35,32,0.34)]" onPress={() => setEnlazando(null)} />
        <View
          className="max-h-[60%] rounded-t-sheet bg-papel pt-2.5"
          style={{ paddingBottom: insets.bottom + 20 }}
        >
          <View className="mx-auto mb-3.5 h-1 w-[38px] rounded-pill bg-rail-handle" />
          <View className="px-[18px]">
            <LabelSeccion>¿Dónde está escrito este suceso?</LabelSeccion>
          </View>

          <ScrollView className="mt-2">
            {capitulos.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => {
                  if (enlazando !== null) actualizar(enlazando, { capitulo: c.id });
                  setEnlazando(null);
                }}
                className="flex-row items-center gap-3 px-[18px] py-3"
              >
                <PuntoEstado color={estadoCapitulo[c.estado]} tamano={8} />
                <Text numberOfLines={1} className="flex-1 font-lora-medium text-[14px] text-tinta">
                  {c.orden}. {c.titulo}
                </Text>
              </Pressable>
            ))}
            {capitulos.length === 0 ? (
              <Text className="px-[18px] py-3 font-manrope-medium text-[12px] text-tinta-disabled">
                Todavía no hay {u.plural} que enlazar
              </Text>
            ) : null}
          </ScrollView>

          {enlazando !== null && sucesos[enlazando]?.capitulo ? (
            <Pressable
              onPress={() => {
                actualizar(enlazando, { capitulo: null });
                setEnlazando(null);
              }}
              className="mx-[18px] mt-2 flex-row items-center justify-center gap-1.5 rounded-[13px] border border-borde-strong py-3"
            >
              <Icon name="link_off" size={17} color="#6E5241" />
              <Text className="font-manrope-semibold text-[12px] text-marron">Quitar el enlace</Text>
            </Pressable>
          ) : null}
        </View>
      </Modal>
    </Pantalla>
  );
}

// Envoltorios finos para no repetir estilos en cada suceso.

function TextoFecha({ valor, onGuardar }: { valor: string; onGuardar: (v: string) => void }) {
  return (
    <TextoEditable
      valor={valor}
      onGuardar={onGuardar}
      style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 10.5, letterSpacing: 1, color: '#9b8a7c' }}
    />
  );
}

function TextoSuceso({ valor, onGuardar }: { valor: string; onGuardar: (v: string) => void }) {
  return (
    <TextoEditable
      valor={valor}
      onGuardar={onGuardar}
      multilinea
      style={{ marginTop: 6, fontFamily: 'Lora_500Medium', fontSize: 15, lineHeight: 20, color: '#2A2320' }}
    />
  );
}

function TextoDescripcion({ valor, onGuardar }: { valor: string; onGuardar: (v: string) => void }) {
  return (
    <TextoEditable
      valor={valor}
      onGuardar={onGuardar}
      placeholder="Toca para escribir qué pasa aquí."
      multilinea
      style={{ marginTop: 4, fontFamily: 'Manrope_400Regular', fontSize: 12.5, lineHeight: 19, color: '#8B7D72' }}
    />
  );
}
