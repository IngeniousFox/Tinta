import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Pantalla } from '@/components/Chrome';
import { Icon } from '@/components/Icon';
import { BotonAnadir, EnlaceVolver, Tarjeta } from '@/components/ui';
import { useGuardarNotaMundo, useProyecto } from '@/datos/consultas';
import { plural } from '@/datos/derivados';
import { ahora, nuevoId } from '@/datos/rutas';

/** Listado de notas de mundo. */
export default function Mundo() {
  const { proyecto } = useLocalSearchParams<{ proyecto: string }>();
  const router = useRouter();
  const { data } = useProyecto(proyecto);
  const guardar = useGuardarNotaMundo(proyecto);

  const base = `/p/${encodeURIComponent(proyecto)}`;

  const nueva = async () => {
    const nota = {
      id: nuevoId('mundo'),
      titulo: 'Nota sin título',
      etiquetas: [],
      descripcion: '',
      reglas: [],
      menciones: [],
      modificado: ahora(),
    };
    await guardar.mutateAsync({ nota });
    router.push(`${base}/nota-mundo?id=${encodeURIComponent(nota.id)}` as never);
  };

  return (
    <Pantalla proyecto={proyecto}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <EnlaceVolver etiqueta="Proyecto" onPress={() => router.push(base as never)} />

        <Text className="mt-3 font-lora text-[22px] leading-[27px] text-tinta">Mundo</Text>
        <Text className="mt-1.5 font-manrope-medium text-[12px] text-tinta-muted">
          Geografía, mitos y todo lo que sostiene la historia
        </Text>

        <View className="mt-[18px] gap-2.5">
          {(data?.mundo ?? []).map((n) => (
            <Pressable
              key={n.id}
              onPress={() => router.push(`${base}/nota-mundo?id=${encodeURIComponent(n.id)}` as never)}
            >
              <Tarjeta className="p-3.5">
                <Text numberOfLines={1} className="font-lora-medium text-[15px] text-tinta">
                  {n.titulo}
                </Text>
                {n.descripcion ? (
                  <Text numberOfLines={2} className="mt-1.5 font-lora text-[12.5px] leading-5 text-marron-light">
                    {n.descripcion}
                  </Text>
                ) : null}
                <View className="mt-2.5 flex-row flex-wrap gap-1.5">
                  {n.etiquetas.map((e) => (
                    <View
                      key={e.id}
                      className="rounded-pill px-2.5 py-1"
                      style={{ backgroundColor: e.color === 'verde' ? 'rgba(53,81,63,0.10)' : 'rgba(110,82,65,0.10)' }}
                    >
                      <Text
                        className="font-manrope-semibold text-[11px]"
                        style={{ color: e.color === 'verde' ? '#35513F' : '#6E5241' }}
                      >
                        {e.texto}
                      </Text>
                    </View>
                  ))}
                  {n.reglas.length > 0 ? (
                    <View className="rounded-pill bg-papel-warm px-2.5 py-1">
                      <Text className="font-manrope-semibold text-[11px] text-marron-light">
                        {plural(n.reglas.length, 'regla', 'reglas')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Tarjeta>
            </Pressable>
          ))}
        </View>

        {(data?.mundo.length ?? 0) === 0 ? (
          <Text className="mt-4 text-center font-manrope-medium text-[12px] text-tinta-disabled">
            Todavía no hay notas de mundo
          </Text>
        ) : null}

        <BotonAnadir etiqueta="Nueva nota de mundo" onPress={nueva} className="mt-3.5" />
      </ScrollView>
    </Pantalla>
  );
}
