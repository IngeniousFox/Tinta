import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Pantalla } from '@/components/Chrome';
import { Icon } from '@/components/Icon';
import { BotonAnadir, EnlaceVolver, Tarjeta } from '@/components/ui';
import { TextoEditable } from '@/components/TextoEditable';
import { useBorrarNotaSuelta, useGuardarNotaSuelta, useProyecto } from '@/datos/consultas';
import { ahora, nuevoId } from '@/datos/rutas';
import { cuando } from '@/lib/fechas';
import type { NotaSuelta } from '@/datos/tipos';

/** Notas sueltas (TINTA-SPEC §4.2.7). */
export default function NotasSueltas() {
  const { proyecto } = useLocalSearchParams<{ proyecto: string }>();
  const router = useRouter();
  const { data } = useProyecto(proyecto);
  const guardar = useGuardarNotaSuelta(proyecto);
  const borrar = useBorrarNotaSuelta(proyecto);

  const confirmarBorrado = (n: NotaSuelta) => {
    Alert.alert('¿Borrar esta nota?', n.texto ? `«${n.texto.slice(0, 80)}…»` : 'La nota está vacía.', [
      { text: 'Conservar', style: 'cancel' },
      { text: 'Borrar nota', style: 'destructive', onPress: () => borrar.mutate(n.id) },
    ]);
  };

  const base = `/p/${encodeURIComponent(proyecto)}`;

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
              Toca una nota para editarla
            </Text>
          </View>
        </View>

        <Text className="mt-3.5 font-lora text-[22px] leading-[27px] text-tinta">Notas sueltas</Text>
        <Text className="mt-1.5 font-manrope-medium text-[12px] text-tinta-muted">
          Ideas que todavía no tienen sitio
        </Text>

        <View className="mt-[18px] gap-2.5">
          {(data?.notas ?? []).map((n) => (
            <Tarjeta key={n.id} className="px-4 py-3.5">
              <TextoEditable
                valor={n.texto}
                onGuardar={(texto) => guardar.mutate({ ...n, texto, modificado: ahora() })}
                placeholder="Toca para escribir la idea…"
                multilinea
                style={{ fontFamily: 'Lora_400Regular', fontSize: 14, lineHeight: 23, color: '#3f352f' }}
              />
              <View className="mt-2.5 flex-row items-center justify-between">
                <Text className="font-manrope-medium text-[10.5px] text-tinta-disabled">
                  {cuando(n.creado)}
                </Text>
                <Pressable
                  onPress={() => confirmarBorrado(n)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Borrar esta nota"
                >
                  <Icon name="delete" size={15} color="#d4c8ba" />
                </Pressable>
              </View>
            </Tarjeta>
          ))}
        </View>

        {(data?.notas.length ?? 0) === 0 ? (
          <Text className="mt-4 text-center font-manrope-medium text-[12px] text-tinta-disabled">
            Aquí caben las ideas que aún no sabes dónde poner
          </Text>
        ) : null}

        <BotonAnadir
          etiqueta="Nueva nota"
          className="mt-3.5"
          onPress={() =>
            guardar.mutate({
              id: nuevoId('nota'),
              texto: '',
              creado: ahora(),
              modificado: ahora(),
            })
          }
        />
      </ScrollView>
    </Pantalla>
  );
}
