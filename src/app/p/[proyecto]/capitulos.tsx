import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pantalla } from '@/components/Chrome';
import { Icon } from '@/components/Icon';
import { BotonAnadir, EnlaceVolver, LabelSeccion, PuntoEstado } from '@/components/ui';
import {
  useBorrarCapitulo,
  useCrearParte,
  useGuardarCapitulo,
  useProyecto,
} from '@/datos/consultas';
import { conMayuscula, palabrasDeCapitulo, plural, unidad } from '@/datos/derivados';
import { nuevoId, ahora } from '@/datos/rutas';
import type { Capitulo, Carpeta, EstadoCapitulo } from '@/datos/tipos';
import { borde, estadoCapitulo, shadow } from '@/theme/tokens';

const ESTADOS: EstadoCapitulo[] = ['Borrador', 'Escribiendo ahora', 'Revisado', 'Listo'];

/** Lista de capítulos de una carpeta (TINTA-SPEC §4.2.3). */
export default function ListaCapitulos() {
  const { proyecto, ruta } = useLocalSearchParams<{ proyecto: string; ruta: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useProyecto(proyecto);
  const guardar = useGuardarCapitulo(proyecto);
  const borrar = useBorrarCapitulo(proyecto);
  const crearParte = useCrearParte(proyecto);

  /** Capítulo con la hoja de acciones abierta. */
  const [accion, setAccion] = useState<Capitulo | null>(null);
  const [titulo, setTitulo] = useState('');

  // «Manuscrito» a secas es el comodín con el que llega un proyecto sin
  // partes. Si mientras tanto ya hay alguna —el primer capítulo crea
  // «Parte I» al vuelo y al volver del editor esta pantalla revive con el
  // comodín viejo— se resuelve a la primera parte en vez de fingir que la
  // carpeta se borró.
  const carpeta = data
    ? (buscarCarpeta(data.manuscrito, ruta) ?? (ruta === 'Manuscrito' ? (data.manuscrito[0] ?? null) : null))
    : null;
  const u = unidad(data?.manifiesto.genero);
  const base = `/p/${encodeURIComponent(proyecto)}`;

  /**
   * Un proyecto recién creado no trae ninguna parte, así que aquí no hay dónde
   * meter el capítulo. En vez de dejar el botón inerte —que era lo que pasaba—
   * se crea «Parte I» al vuelo: el primer capítulo de una novela no debería
   * exigirle entender antes el árbol de carpetas.
   */
  const sinPartes = data !== undefined && data !== null && data.manuscrito.length === 0;

  /**
   * La ruta pedida no está en el manuscrito: parte borrada o renombrada. Se
   * exige tener los datos delante para decirlo — mientras se leen del disco no
   * se sabe todavía, y afirmarlo sería la misma mentira que el «Cargando…»
   * eterno, pero al revés.
   */
  const parteFantasma = Boolean(data) && !carpeta && !sinPartes;

  const palabras = carpeta?.capitulos.reduce((t, c) => t + palabrasDeCapitulo(c), 0) ?? 0;

  const nuevoCapitulo = async () => {
    if (!data) return;
    let destino = carpeta;

    if (!destino) {
      if (!sinPartes) return;
      const rutaParte = await crearParte.mutateAsync('Parte I');
      destino = { nombre: 'Parte I', ruta: rutaParte, icono: 'folder', subcarpetas: [], capitulos: [] };
    }

    const orden = Math.max(0, ...destino.capitulos.map((c) => c.orden)) + 1;
    const capitulo: Capitulo = {
      id: nuevoId('cap'),
      ruta: `${destino.ruta}/nuevo.md`,
      titulo: u.sinTitulo,
      estado: 'Borrador',
      orden,
      exportar: true,
      texto: '',
      modificado: ahora(),
    };
    const guardado = await guardar.mutateAsync(capitulo);
    router.push(`${base}/editor?ruta=${encodeURIComponent(guardado.ruta)}` as never);
  };

  /**
   * Mueve un capítulo un puesto y renumera la carpeta entera 1..n. Renumerar
   * todo mantiene los prefijos de fichero limpios en Drive («01 - », «02 - »…)
   * aunque haya habido huecos o empates.
   */
  const mover = async (c: Capitulo, delta: -1 | 1) => {
    if (!carpeta) return;
    const orden = [...carpeta.capitulos].sort((a, b) => a.orden - b.orden);
    const desde = orden.findIndex((x) => x.id === c.id);
    const hasta = desde + delta;
    if (desde === -1 || hasta < 0 || hasta >= orden.length) return;

    [orden[desde], orden[hasta]] = [orden[hasta], orden[desde]];

    for (let i = 0; i < orden.length; i += 1) {
      if (orden[i].orden !== i + 1) {
        await guardar.mutateAsync({ ...orden[i], orden: i + 1 });
      }
    }
    setAccion(null);
  };

  /**
   * Guarda el título sin cerrar la hoja. Antes cerraba siempre, y como estaba
   * enganchado al `onBlur`, tocar cualquier otro control de la propia hoja
   * —subir, bajar, el interruptor del PDF— la hacía desaparecer entera. La hoja
   * es un panel donde se hacen varias cosas seguidas, no un diálogo de un uso.
   */
  const renombrar = async () => {
    if (!accion) return;
    const limpio = titulo.trim() || u.sinTitulo;
    if (limpio === accion.titulo) return;
    const actualizado = await guardar.mutateAsync({ ...accion, titulo: limpio });
    setAccion(actualizado);
    setTitulo(actualizado.titulo);
  };

  /** Intro sí es un «ya está»: guarda y cierra. */
  const renombrarYCerrar = async () => {
    await renombrar();
    setAccion(null);
  };

  const cambiarEstado = async (estado: EstadoCapitulo) => {
    if (!accion) return;
    await guardar.mutateAsync({ ...accion, estado });
    setAccion(null);
  };

  /** Sigue en el manuscrito, pero no sale en el PDF. Se queda en la hoja para que se vea el cambio. */
  const cambiarExportar = async (exportar: boolean) => {
    if (!accion) return;
    const actualizado = await guardar.mutateAsync({ ...accion, exportar });
    setAccion(actualizado);
  };

  const confirmarBorrado = () => {
    if (!accion) return;
    const c = accion;
    Alert.alert(
      `¿Borrar «${c.titulo}»?`,
      `Se borrará el ${u.singular} y sus ${plural(palabrasDeCapitulo(c), 'palabra', 'palabras')}, aquí y en Drive. Esto no se puede deshacer.`,
      [
        { text: 'Conservar', style: 'cancel' },
        {
          text: `Borrar ${u.singular}`,
          style: 'destructive',
          onPress: () => {
            setAccion(null);
            borrar.mutate(c.ruta);
          },
        },
      ],
    );
  };

  return (
    <Pantalla proyecto={proyecto}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <EnlaceVolver etiqueta="Manuscrito" onPress={() => router.push(base as never)} />

        <Text className="mt-3 font-lora text-[21px] leading-[26px] text-tinta">
          {carpeta?.nombre ?? (parteFantasma ? 'Esta parte ya no está' : 'Manuscrito')}
        </Text>
        <Text className="mt-1.5 font-manrope-medium text-[12px] text-tinta-muted">
          {carpeta
            ? `${plural(carpeta.capitulos.length, u.singular, u.plural)} · ${plural(palabras, 'palabra', 'palabras')}`
            : sinPartes
              ? `Aquí van tus ${u.plural}, agrupados por partes`
              : parteFantasma
                ? 'Puede que la hayas borrado o renombrado'
                : 'Cargando…'}
        </Text>

        <View className="mt-[18px] gap-2.5">
          {(carpeta?.capitulos ?? []).map((c) => {
            const activo = c.estado === 'Escribiendo ahora';
            return (
              <Pressable
                key={c.id}
                onPress={() =>
                  router.push(`${base}/editor?ruta=${encodeURIComponent(c.ruta)}` as never)
                }
                onLongPress={() => {
                  setAccion(c);
                  setTitulo(c.titulo);
                }}
                delayLongPress={350}
                className="flex-row items-center gap-3 rounded-[16px] border-[1.5px] bg-papel-card p-3.5"
                style={{
                  borderColor: activo ? '#7B2D3B' : '#EDE4D8',
                  boxShadow: activo ? shadow.chapterActive : undefined,
                  opacity: c.exportar ? 1 : 0.72,
                }}
              >
                <Text
                  className="w-[22px] text-center font-lora-medium text-[16px]"
                  style={{ color: activo ? '#7B2D3B' : '#D8C9B6' }}
                >
                  {c.orden}
                </Text>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={2} className="font-lora-medium text-[14.5px] text-tinta">
                    {c.titulo}
                  </Text>
                  <View className="mt-1.5 flex-row items-center gap-[7px]">
                    <PuntoEstado color={estadoCapitulo[c.estado]} />
                    <Text
                      className="font-manrope-medium text-[11.5px]"
                      style={{ color: activo ? '#7B2D3B' : '#9b8a7c' }}
                    >
                      {c.estado} · {plural(palabrasDeCapitulo(c), 'palabra', 'palabras')}
                    </Text>
                    {!c.exportar ? (
                      <View className="flex-row items-center gap-1">
                        <Icon name="print_disabled" size={13} color="#b3a597" />
                        <Text className="font-manrope-medium text-[10.5px] text-tinta-disabled">
                          fuera del PDF
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Pressable
                  onPress={() => {
                    setAccion(c);
                    setTitulo(c.titulo);
                  }}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Acciones de «${c.titulo}»`}
                  className="h-11 w-11 items-center justify-center rounded-[10px]"
                >
                  {/* `drag_indicator` prometía arrastrar para reordenar y esto
                      abre la hoja de acciones: el orden se cambia ahí dentro. */}
                  <Icon
                    name={activo ? 'edit' : 'more_vert'}
                    size={20}
                    color={activo ? '#7B2D3B' : '#d4c8ba'}
                  />
                </Pressable>
              </Pressable>
            );
          })}
        </View>

        {carpeta && carpeta.capitulos.length === 0 ? (
          <Text className="mt-4 text-center font-manrope-medium text-[12px] text-tinta-disabled">
            Esta parte todavía está vacía
          </Text>
        ) : null}

        {sinPartes ? (
          <Text className="mt-4 text-center font-manrope-medium text-[12px] leading-[18px] text-tinta-disabled">
            Todavía no hay ninguna parte. Empieza tu {u.singular}: se creará «Parte I» y ya podrás
            escribir.
          </Text>
        ) : null}

        {/* Con una ruta que ya no existe no se ofrece crear nada: el fichero
            acabaría en una parte distinta de la que ella pidió, sin enterarse.
            Se la devuelve al manuscrito, donde sí ve lo que hay. */}
        {parteFantasma ? (
          <>
            <Text className="mt-4 text-center font-manrope-medium text-[12px] leading-[18px] text-tinta-disabled">
              La parte que buscabas ya no existe. Tus {u.plural} siguen en el manuscrito.
            </Text>
            <BotonAnadir
              etiqueta="Ver las partes del manuscrito"
              icono="folder_open"
              onPress={() => router.push(base as never)}
              className="mt-3.5"
            />
          </>
        ) : isLoading ? null : (
          <BotonAnadir etiqueta={u.nuevo} onPress={nuevoCapitulo} className="mt-3.5" />
        )}

        {carpeta ? (
          <Text className="mt-2.5 text-center font-manrope-medium text-[11px] text-tinta-disabled">
            Mantén pulsado un {u.singular} para moverlo, renombrarlo o borrarlo
          </Text>
        ) : null}
      </ScrollView>

      {/* Hoja de acciones del capítulo */}
      <Modal
        visible={accion !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setAccion(null)}
      >
        <Pressable className="flex-1 bg-[rgba(42,35,32,0.34)]" onPress={() => setAccion(null)} />
        <View
          className="rounded-t-sheet bg-papel px-[18px] pt-2.5"
          style={{ paddingBottom: insets.bottom + 26 }}
        >
          <View className="mx-auto mb-4 h-1 w-[38px] rounded-pill bg-rail-handle" />

          <LabelSeccion>
            {conMayuscula(u.singular)} {accion?.orden}
          </LabelSeccion>

          <TextInput
            value={titulo}
            onChangeText={setTitulo}
            onSubmitEditing={renombrarYCerrar}
            onBlur={renombrar}
            // Intro no debe además quitar el foco: si lo hiciera, el `onBlur`
            // se dispararía justo después del cierre y volvería a abrir la hoja.
            submitBehavior="submit"
            placeholder={u.sinTitulo}
            placeholderTextColor="#b3a597"
            className="mt-3 rounded-[14px] border-[1.5px] border-borde-strong bg-papel-card px-3.5 py-3 font-lora text-[15px] text-tinta"
          />

          <View className="mt-3 flex-row gap-2">
            {ESTADOS.map((e) => (
              <Pressable
                key={e}
                onPress={() => cambiarEstado(e)}
                className="h-11 flex-1 items-center justify-center gap-1 rounded-[12px] border-[1.5px] bg-papel-card"
                style={{ borderColor: accion?.estado === e ? borde.seleccion : borde.neutro }}
              >
                <PuntoEstado color={estadoCapitulo[e]} tamano={8} />
                <Text className="font-manrope-semibold text-[9px] text-tinta-body" numberOfLines={1}>
                  {e === 'Escribiendo ahora' ? 'Ahora' : e}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Entra en el PDF o no. Sigue en el manuscrito igualmente. */}
          <View className="mt-3 flex-row items-center justify-between rounded-[14px] border border-borde-verde bg-papel-crema px-3.5 py-3">
            <View className="min-w-0 flex-1 pr-3">
              <Text className="font-manrope-semibold text-[12.5px] text-tinta">
                Incluir en la exportación
              </Text>
              <Text className="mt-0.5 font-manrope-medium text-[11px] text-marron-light">
                {accion?.exportar
                  ? 'Saldrá en el PDF'
                  : 'Se queda en el manuscrito, pero no sale en el PDF'}
              </Text>
            </View>
            <Switch
              value={accion?.exportar ?? true}
              onValueChange={cambiarExportar}
              trackColor={{ false: '#DDE0D2', true: '#35513F' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View className="mt-3 flex-row gap-2.5">
            <Pressable
              onPress={() => accion && mover(accion, -1)}
              className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-[13px] bg-papel-warm"
            >
              <Icon name="arrow_upward" size={18} color="#5E1F2B" />
              <Text className="font-manrope-semibold text-[12px] text-vino-dark">Subir</Text>
            </Pressable>
            <Pressable
              onPress={() => accion && mover(accion, 1)}
              className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-[13px] bg-papel-warm"
            >
              <Icon name="arrow_downward" size={18} color="#5E1F2B" />
              <Text className="font-manrope-semibold text-[12px] text-vino-dark">Bajar</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={confirmarBorrado}
            accessibilityRole="button"
            className="mt-3 flex-row items-center justify-center gap-1.5 rounded-[13px] border-[1.5px] border-dashed py-3"
            style={{ borderColor: borde.peligro }}
          >
            <Icon name="delete" size={17} color="#7B2D3B" />
            <Text className="font-manrope-semibold text-[12px] text-vino">Borrar {u.singular}</Text>
          </Pressable>
        </View>
      </Modal>
    </Pantalla>
  );
}

/**
 * Busca la parte por su ruta exacta, y devuelve null si no está.
 *
 * Antes caía en `carpetas[0]`, así que una ruta borrada o renombrada pintaba
 * OTRA parte —su nombre, su recuento, sus capítulos— sin ninguna señal, y
 * «Nuevo capítulo» habría escrito el fichero dentro de esa otra parte. El
 * fallback también contaminaba la recursión: la primera subcarpeta volvía como
 * si fuera un acierto.
 */
function buscarCarpeta(carpetas: Carpeta[], ruta: string): Carpeta | null {
  for (const c of carpetas) {
    if (c.ruta === ruta) return c;
    const hijo = buscarCarpeta(c.subcarpetas, ruta);
    if (hijo) return hijo;
  }
  return null;
}
