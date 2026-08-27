import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Pantalla } from '@/components/Chrome';
import { Icon } from '@/components/Icon';
import { Avatar, BotonAnadir, EnlaceVolver, Tarjeta } from '@/components/ui';
import { TextoEditable } from '@/components/TextoEditable';
import { borrarFotoPersonaje, guardarFotoPersonaje, uriDeRuta } from '@/datos/almacen';
import { useBorrarPersonaje, useGuardarPersonaje, useProyecto } from '@/datos/consultas';
import { apariciones, capitulosDeProyecto, unidad } from '@/datos/derivados';
import { elegirImagen, seleccionDisponible } from '@/datos/imagenes';
import { ahora, nuevoId } from '@/datos/rutas';
import type { HitoArco, Personaje } from '@/datos/tipos';
import { borde } from '@/theme/tokens';

/** Ficha de personaje (TINTA-SPEC §4.2.5). */
export default function FichaPersonaje() {
  const { proyecto, id } = useLocalSearchParams<{ proyecto: string; id: string }>();
  const router = useRouter();
  const { data, isLoading } = useProyecto(proyecto);
  const guardar = useGuardarPersonaje(proyecto);
  const borrar = useBorrarPersonaje(proyecto);
  const [ocupadaFoto, setOcupadaFoto] = useState(false);

  const personaje = useMemo<Personaje | null>(
    () => data?.personajes.find((p) => p.id === id) ?? null,
    [data, id],
  );

  const base = `/p/${encodeURIComponent(proyecto)}`;

  if (!personaje) {
    // Cargando y «ya no existe» son cosas distintas: la segunda necesita una
    // salida, no una espera que no va a terminar nunca.
    return (
      <Pantalla proyecto={proyecto}>
        <View className="p-[18px]">
          {isLoading ? (
            <Text className="font-manrope-medium text-[13px] text-tinta-muted">Cargando…</Text>
          ) : (
            <>
              <Text className="font-lora text-[16px] text-tinta">Esta ficha ya no está</Text>
              <Text className="mt-1.5 font-manrope-medium text-[12.5px] text-tinta-muted">
                Puede que se haya borrado desde otro sitio.
              </Text>
              <EnlaceVolver etiqueta="Personajes" onPress={() => router.push(base as never)} />
            </>
          )}
        </View>
      </Pantalla>
    );
  }

  const actualizar = (parcial: Partial<Personaje>) =>
    guardar.mutate({
      personaje: { ...personaje, ...parcial, modificado: ahora() },
      // Si cambia el nombre, el fichero viejo debe retirarse, no duplicarse.
      nombreAnterior: personaje.nombre,
    });

  const enCapitulos = data ? apariciones(personaje, capitulosDeProyecto(data)) : 0;
  const u = unidad(data?.manifiesto.genero);

  /** Uri absoluto de la foto, que es lo que necesita `Image` para pintarla. */
  const uriFoto = personaje.foto ? uriDeRuta(proyecto, personaje.foto) : null;

  const ponerFoto = async () => {
    if (!seleccionDisponible()) {
      Alert.alert(
        'Todavía no',
        'Elegir fotos necesita la app actualizada. Esta versión aún no lo trae.',
      );
      return;
    }
    setOcupadaFoto(true);
    try {
      const origen = await elegirImagen();
      if (!origen) return;
      const ruta = guardarFotoPersonaje(proyecto, personaje.nombre, origen);
      actualizar({ foto: ruta });
    } catch (e) {
      Alert.alert('No se pudo usar esa foto', (e as Error).message);
    } finally {
      setOcupadaFoto(false);
    }
  };

  const quitarFoto = () => {
    if (personaje.foto) borrarFotoPersonaje(proyecto, personaje.foto);
    actualizar({ foto: null });
  };

  const menuFoto = () => {
    Alert.alert(`Foto de ${personaje.nombre}`, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cambiar la foto', onPress: ponerFoto },
      { text: 'Quitar la foto', style: 'destructive', onPress: quitarFoto },
    ]);
  };

  const borrarFicha = () => {
    Alert.alert(
      `¿Borrar la ficha de ${personaje.nombre}?`,
      'Se borrará la ficha, aquí y en Drive. El manuscrito no se toca.',
      [
        { text: 'Conservar', style: 'cancel' },
        {
          text: 'Borrar ficha',
          style: 'destructive',
          onPress: () => {
            borrar.mutate(personaje.nombre);
            router.push(`/p/${encodeURIComponent(proyecto)}` as never);
          },
        },
      ],
    );
  };

  const borrarRelacion = (indice: number) => {
    const relaciones = [...personaje.relaciones];
    relaciones.splice(indice, 1);
    actualizar({ relaciones });
  };

  const borrarHito = (indice: number) => {
    const arco = [...personaje.arco];
    arco.splice(indice, 1);
    actualizar({ arco });
  };

  return (
    <Pantalla proyecto={proyecto}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between">
          <EnlaceVolver etiqueta="Personajes" onPress={() => router.push(base as never)} />
          <View className="flex-row items-center gap-1">
            <Icon name="stylus" size={13} color="#b3a597" />
            <Text className="font-manrope-medium text-[10.5px] text-tinta-disabled">
              Toca cualquier texto para editarlo
            </Text>
          </View>
        </View>

        <View className="mt-4 flex-row items-center gap-3.5">
          <Pressable onPress={personaje.foto ? menuFoto : ponerFoto} disabled={ocupadaFoto}>
            {personaje.foto ? (
              <Image
                // La clave con `modificado` fuerza el redibujado al cambiarla:
                // la ruta es la misma y la caché enseñaría la foto anterior.
                key={`${personaje.foto}-${personaje.modificado}`}
                source={{ uri: uriFoto ?? undefined }}
                style={{ width: 76, height: 76, borderRadius: 38 }}
                contentFit="cover"
                transition={180}
              />
            ) : (
              <View className="h-[76px] w-[76px] items-center justify-center gap-0.5 rounded-full border-[1.5px] border-dashed border-estado-borrador bg-papel-warm">
                <Icon name={ocupadaFoto ? 'hourglass_empty' : 'add_a_photo'} size={22} color="#9b8a7c" />
                <Text className="font-manrope-semibold text-[8.5px] text-tinta-muted">
                  {ocupadaFoto ? '…' : 'Foto'}
                </Text>
              </View>
            )}
          </Pressable>
          <View className="min-w-0 flex-1">
            <TextoEditable
              valor={personaje.nombre}
              onGuardar={(nombre) => actualizar({ nombre })}
              placeholder="Nombre del personaje"
              style={{ fontFamily: 'Lora_400Regular', fontSize: 21, color: '#2A2320' }}
            />
            <View className="mt-2 flex-row flex-wrap gap-1.5">
              {personaje.apodos.map((apodo, i) => (
                <View
                  key={`${apodo}-${i}`}
                  className="rounded-pill px-2.5 py-1.5"
                  style={{ backgroundColor: i === 0 ? 'rgba(123,45,59,0.09)' : '#F1E9DE' }}
                >
                  <TextoEditable
                    valor={apodo}
                    onGuardar={(v) => {
                      const apodos = [...personaje.apodos];
                      if (v.trim() === '') apodos.splice(i, 1);
                      else apodos[i] = v;
                      actualizar({ apodos });
                    }}
                    style={{
                      fontFamily: 'Manrope_600SemiBold',
                      fontSize: 11,
                      color: i === 0 ? '#7B2D3B' : '#6E5241',
                    }}
                  />
                </View>
              ))}
              <Pressable
                onPress={() => actualizar({ apodos: [...personaje.apodos, 'Apodo'] })}
                className="rounded-pill bg-papel-warm px-2.5 py-1.5"
              >
                <Text className="font-manrope-semibold text-[11px] text-marron-light">+ apodo</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View className="mt-4 flex-row gap-2.5">
          <Tarjeta className="flex-1 px-3 py-2.5">
            <Text className="font-manrope-semibold text-[10px] uppercase tracking-label text-tinta-muted">
              Edad
            </Text>
            <TextoEditable
              valor={personaje.edad}
              onGuardar={(edad) => actualizar({ edad })}
              placeholder="—"
              style={{ fontFamily: 'Lora_500Medium', fontSize: 15, color: '#2A2320', marginTop: 6 }}
            />
          </Tarjeta>
          <Tarjeta className="flex-1 px-3 py-2.5">
            <Text className="font-manrope-semibold text-[10px] uppercase tracking-label text-tinta-muted">
              Aparece en
            </Text>
            <Text className="mt-1.5 font-lora-medium text-[15px] text-tinta">
              {enCapitulos} {enCapitulos === 1 ? u.singular : u.plural}
            </Text>
          </Tarjeta>
        </View>

        <View className="mt-3 gap-2.5">
          <BloqueTexto
            icono="face"
            titulo="Aspecto físico"
            valor={personaje.aspecto}
            onGuardar={(aspecto) => actualizar({ aspecto })}
          />
          <BloqueTexto
            icono="psychology"
            titulo="Personalidad"
            valor={personaje.personalidad}
            onGuardar={(personalidad) => actualizar({ personalidad })}
          />
          <BloqueTexto
            icono="history_edu"
            titulo="Trasfondo"
            valor={personaje.trasfondo}
            onGuardar={(trasfondo) => actualizar({ trasfondo })}
            sepia
          />

          {/* Arco narrativo */}
          <Tarjeta className="p-4">
            <View className="flex-row items-center gap-2">
              <Icon name="trending_up" size={18} color="#35513F" />
              <Text className="font-manrope-semibold text-[12.5px] text-verde">Arco narrativo</Text>
            </View>
            <View className="mt-3">
              {personaje.arco.map((h, i) => (
                <View key={h.id} className="flex-row gap-3">
                  <View className="w-3.5 items-center">
                    <View
                      className="h-[9px] w-[9px] rounded-full"
                      style={{
                        backgroundColor:
                          h.estado === 'hecho' ? '#35513F' : h.estado === 'ahora' ? '#7B2D3B' : 'transparent',
                        borderWidth: h.estado === 'pendiente' ? 1.5 : 0,
                        borderColor: '#D8C9B6',
                      }}
                    />
                    {i < personaje.arco.length - 1 ? (
                      <View className="w-[1.5px] flex-1 bg-rail-verde" />
                    ) : null}
                  </View>
                  <View className="flex-1 pb-3.5">
                    <TextoEditable
                      valor={h.titulo}
                      onGuardar={(titulo) => actualizarHito(personaje, i, { titulo }, actualizar)}
                      style={{
                        fontFamily: 'Manrope_600SemiBold',
                        fontSize: 12,
                        color: h.estado === 'pendiente' ? '#9b8a7c' : '#2A2320',
                      }}
                    />
                    <TextoEditable
                      valor={h.subtitulo}
                      onGuardar={(subtitulo) => actualizarHito(personaje, i, { subtitulo }, actualizar)}
                      style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#8B7D72' }}
                    />
                  </View>
                  <Pressable
                    onPress={() => borrarHito(i)}
                    hitSlop={8}
                    className="mt-0.5"
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar el hito ${h.titulo}`}
                  >
                    <Icon name="close" size={15} color="#d4c8ba" />
                  </Pressable>
                </View>
              ))}
            </View>
            <BotonAnadir
              etiqueta="Añadir hito del arco"
              color="#35513F"
              onPress={() =>
                actualizar({
                  arco: [
                    ...personaje.arco,
                    { id: nuevoId('hito'), titulo: 'Nuevo hito', subtitulo: 'Toca para describirlo', estado: 'pendiente' },
                  ],
                })
              }
            />
          </Tarjeta>

          {/* Relaciones */}
          <Tarjeta className="p-4">
            <View className="flex-row items-center gap-2">
              <Icon name="group" size={18} color="#6E5241" />
              <Text className="font-manrope-semibold text-[12.5px] text-marron">Relaciones</Text>
            </View>
            <View className="mt-3 gap-2.5">
              {personaje.relaciones.map((r, i) => (
                <View key={r.id} className="flex-row items-center gap-2.5">
                  <Avatar texto={r.nombre} />
                  <View className="min-w-0 flex-1 pr-1">
                    <TextoEditable
                      valor={r.nombre}
                      onGuardar={(nombre) => {
                        const relaciones = [...personaje.relaciones];
                        relaciones[i] = { ...r, nombre };
                        actualizar({ relaciones });
                      }}
                      style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#2A2320' }}
                    />
                    <TextoEditable
                      valor={r.descripcion}
                      onGuardar={(descripcion) => {
                        const relaciones = [...personaje.relaciones];
                        relaciones[i] = { ...r, descripcion };
                        actualizar({ relaciones });
                      }}
                      style={{ fontFamily: 'Manrope_400Regular', fontSize: 11.5, color: '#8B7D72' }}
                    />
                  </View>
                  <Pressable
                    onPress={() => borrarRelacion(i)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar la relación con ${r.nombre}`}
                  >
                    <Icon name="close" size={15} color="#d4c8ba" />
                  </Pressable>
                </View>
              ))}
              <BotonAnadir
                etiqueta="Añadir relación"
                onPress={() =>
                  actualizar({
                    relaciones: [
                      ...personaje.relaciones,
                      { id: nuevoId('rel'), nombre: 'Nombre del personaje', descripcion: 'Cómo se relacionan' },
                    ],
                  })
                }
              />
            </View>
          </Tarjeta>

          <BloqueTexto
            icono="sticky_note_2"
            titulo="Notas libres"
            valor={personaje.notas}
            onGuardar={(notas) => actualizar({ notas })}
          />

          <Pressable
            onPress={borrarFicha}
            className="mt-2 flex-row items-center justify-center gap-1.5 rounded-[13px] border-[1.5px] border-dashed py-3"
            style={{ borderColor: borde.peligro }}
            accessibilityRole="button"
            accessibilityLabel="Borrar esta ficha"
          >
            <Icon name="delete" size={17} color="#7B2D3B" />
            <Text className="font-manrope-semibold text-[12px] text-vino">Borrar esta ficha</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Pantalla>
  );
}

function actualizarHito(
  personaje: Personaje,
  indice: number,
  parcial: Partial<HitoArco>,
  actualizar: (p: Partial<Personaje>) => void,
) {
  const arco = [...personaje.arco];
  arco[indice] = { ...arco[indice], ...parcial };
  actualizar({ arco });
}

function BloqueTexto({
  icono,
  titulo,
  valor,
  onGuardar,
  sepia = false,
}: {
  icono: string;
  titulo: string;
  valor: string;
  onGuardar: (v: string) => void;
  sepia?: boolean;
}) {
  return (
    <View
      className={`rounded-[16px] border p-4 ${sepia ? 'border-borde-sepia bg-papel-sepia' : 'border-borde bg-papel-card'}`}
    >
      <View className="flex-row items-center gap-2">
        <Icon name={icono} size={18} color="#6E5241" />
        <Text className="font-manrope-semibold text-[12.5px] text-marron">{titulo}</Text>
      </View>
      <TextoEditable
        valor={valor}
        onGuardar={onGuardar}
        placeholder="Toca para escribir…"
        multilinea
        style={{
          marginTop: 9,
          fontFamily: 'Lora_400Regular',
          fontSize: 13.5,
          lineHeight: 22,
          color: '#3f352f',
        }}
      />
    </View>
  );
}
