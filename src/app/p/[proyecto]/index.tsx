import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pantalla } from '@/components/Chrome';
import { Icon } from '@/components/Icon';
import { TextoEditable } from '@/components/TextoEditable';
import { Avatar, EnlaceVolver, LabelSeccion, Lomo } from '@/components/ui';
import { uriPortada, usePortada } from '@/components/usePortada';
import {
  useBorrarParte,
  useCrearParte,
  useGuardarPersonaje,
  useProyecto,
  useRenombrarParte,
  useRenombrarProyecto,
} from '@/datos/consultas';
import {
  capitulosDeCarpeta,
  capitulosDeProyecto,
  palabrasDeCarpeta,
  palabrasDeProyecto,
  plural,
  unidad,
} from '@/datos/derivados';
import { ahora, nuevoId } from '@/datos/rutas';
import type { Carpeta } from '@/datos/tipos';
import { cssFuentes } from '@/editor/fuentesWebview';
import {
  OPCIONES_POR_DEFECTO,
  type OpcionesExportacion,
  exportacionDisponible,
  exportarPdf,
  resumenExportacion,
} from '@/exportar/pdf';
import { borde, shadow } from '@/theme/tokens';

/** Interior del proyecto (TINTA-SPEC §4.2.2). */
export default function InteriorProyecto() {
  const { proyecto } = useLocalSearchParams<{ proyecto: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useProyecto(proyecto);
  const guardarFicha = useGuardarPersonaje(proyecto);
  const crearParte = useCrearParte(proyecto);
  const renombrarParte = useRenombrarParte(proyecto);
  const borrarParte = useBorrarParte(proyecto);
  const renombrarProyecto = useRenombrarProyecto();
  const portada = usePortada(data?.manifiesto);

  const [manuscrito, setManuscrito] = useState(true);
  const [personajes, setPersonajes] = useState(false);
  /** Parte con la hoja de acciones abierta. */
  const [parteAccion, setParteAccion] = useState<Carpeta | null>(null);
  const [nombreParte, setNombreParte] = useState('');

  /** Hoja de exportación a PDF. */
  const [exportando, setExportando] = useState(false);
  const [opcionesPdf, setOpcionesPdf] = useState<OpcionesExportacion>(OPCIONES_POR_DEFECTO);
  const [generando, setGenerando] = useState(false);

  const generarPdf = async () => {
    if (!data || generando) return;
    setGenerando(true);
    try {
      // Lora y Manrope empotradas como en el editor; si falla, fuentes del sistema.
      const fuentes = await cssFuentes('Lora');
      await exportarPdf(data, { ...opcionesPdf, cssFuentes: fuentes });
      setExportando(false);
    } catch (e) {
      Alert.alert('No se pudo exportar', (e as Error).message);
    } finally {
      setGenerando(false);
    }
  };

  if (isLoading) {
    return (
      <Pantalla proyecto={proyecto}>
        <Text className="p-[18px] font-manrope-medium text-[13px] text-tinta-muted">Cargando…</Text>
      </Pantalla>
    );
  }

  // «Cargando…» y «no está» no son lo mismo: leerProyecto devuelve null cuando
  // la carpeta o el manifiesto no existen (proyecto borrado desde otro sitio,
  // renombrado, o un enlace viejo) y sin distinguirlos la pantalla se quedaba
  // cargando para siempre, sin salida.
  if (!data) {
    return (
      <Pantalla proyecto={proyecto}>
        <View className="p-[18px]">
          <Text className="font-lora text-[18px] leading-[24px] text-tinta">
            Este proyecto ya no está aquí
          </Text>
          <Text className="mt-2 font-manrope-medium text-[12.5px] leading-[19px] text-tinta-muted">
            Puede que lo hayas borrado o renombrado desde otro sitio. Tus demás historias siguen en
            la biblioteca.
          </Text>
          <Pressable
            onPress={() => router.replace('/')}
            accessibilityRole="button"
            className="mt-4 flex-row items-center justify-center gap-2 rounded-[14px] bg-vino py-3.5"
          >
            <Icon name="home_storage" size={18} color="#FBF7F1" />
            <Text className="font-manrope-semibold text-[12.5px] text-papel">
              Volver a la biblioteca
            </Text>
          </Pressable>
        </View>
      </Pantalla>
    );
  }

  const capitulos = capitulosDeProyecto(data).length;
  const u = unidad(data.manifiesto.genero);
  const irA = (destino: string) => router.push(destino as never);
  const base = `/p/${encodeURIComponent(proyecto)}`;

  // Renombrar el proyecto mueve su carpeta local (y, tras sincronizar, la de
  // Drive). La ruta lleva el nombre, así que hay que reemplazarla entera.
  const confirmarNombreProyecto = async (nuevo: string) => {
    const limpio = nuevo.trim();
    if (!limpio || limpio === proyecto) return;
    const m = await renombrarProyecto.mutateAsync({ viejo: proyecto, nuevo: limpio });
    // null = el almacén no pudo renombrar porque ya hay otra carpeta con ese
    // nombre. Callarlo dejaría el título nuevo en pantalla y el viejo en disco.
    if (!m) {
      Alert.alert(
        'Ya tienes un proyecto con ese nombre',
        `«${limpio}» ya existe en tu biblioteca. Prueba con otro título.`,
      );
      return;
    }
    router.replace(`/p/${encodeURIComponent(m.nombre)}` as never);
  };

  const nuevaParte = async () => {
    const n = (data?.manuscrito.length ?? 0) + 1;
    const ruta = await crearParte.mutateAsync(`Parte ${n}`);
    irA(`${base}/capitulos?ruta=${encodeURIComponent(ruta)}`);
  };

  const confirmarRenombreParte = async () => {
    if (!parteAccion) return;
    const limpio = nombreParte.trim();
    if (limpio && limpio !== parteAccion.nombre) {
      await renombrarParte.mutateAsync({ ruta: parteAccion.ruta, nombre: limpio });
    }
    setParteAccion(null);
  };

  const confirmarBorrarParte = () => {
    if (!parteAccion) return;
    const parte = parteAccion;
    const n = capitulosDeCarpeta(parte).length;
    Alert.alert(
      `¿Borrar «${parte.nombre}»?`,
      n > 0
        ? `Se borrarán sus ${plural(n, 'capítulo', 'capítulos')} y ${plural(palabrasDeCarpeta(parte), 'palabra', 'palabras')}, aquí y en Drive. Esto no se puede deshacer.`
        : 'La parte está vacía. Se borrará aquí y en Drive.',
      [
        { text: 'Conservar', style: 'cancel' },
        {
          text: 'Borrar parte',
          style: 'destructive',
          onPress: () => {
            setParteAccion(null);
            borrarParte.mutate(parte.ruta);
          },
        },
      ],
    );
  };

  // La ficha se crea antes de navegar: así la pantalla de personaje trabaja
  // siempre con un id real y no hay estados fantasma de «nuevo».
  const nuevaFicha = async () => {
    const ficha = {
      id: nuevoId('per'),
      nombre: 'Personaje sin nombre',
      apodos: ['Toca su ficha para escribirla'],
      foto: null,
      edad: '',
      aspecto: '',
      personalidad: '',
      trasfondo: '',
      arco: [],
      relaciones: [],
      notas: '',
      modificado: ahora(),
    };
    await guardarFicha.mutateAsync({ personaje: ficha });
    irA(`${base}/personaje?id=${encodeURIComponent(ficha.id)}`);
  };

  return (
    <Pantalla proyecto={proyecto}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 100 }}>
        <EnlaceVolver etiqueta="Biblioteca" onPress={() => router.push('/')} />

        <View className="mt-3 flex-row items-center gap-3.5">
          {/* La portada se cambia tocándola; sin portada propia, el lomo del género. */}
          <Pressable
            onPress={portada.menu}
            disabled={portada.ocupada}
            accessibilityRole="button"
            accessibilityLabel={data.manifiesto.portada ? 'Cambiar o quitar la portada' : 'Poner portada'}
          >
            <Lomo
              genero={data.manifiesto.genero}
              portada={uriPortada(data.manifiesto)}
              version={data.manifiesto.modificado}
            />
            <View
              className="absolute -bottom-1 -right-1 h-[22px] w-[22px] items-center justify-center rounded-full border border-borde bg-papel-card"
              style={{ boxShadow: shadow.card }}
            >
              <Icon name={portada.ocupada ? 'hourglass_empty' : 'add_photo_alternate'} size={13} color="#5E1F2B" />
            </View>
          </Pressable>
          <View className="min-w-0 flex-1">
            {/* El nombre del proyecto se renombra tocándolo (TINTA-SPEC §4.1). */}
            <TextoEditable
              valor={proyecto}
              onGuardar={confirmarNombreProyecto}
              espera={120000}
              style={{
                fontFamily: 'Lora_400Regular',
                fontSize: 21,
                lineHeight: 26,
                color: '#2A2320',
              }}
            />
            <View className="mt-2 flex-row gap-3.5">
              <Text className="font-manrope-medium text-[12px] text-tinta-muted">
                {plural(palabrasDeProyecto(data), 'palabra', 'palabras')}
              </Text>
              <Text className="font-manrope-medium text-[12px] text-verde">
                {plural(capitulos, u.singular, u.plural)}
              </Text>
            </View>
          </View>
        </View>

        {/* Los chips desbordan en pantallas estrechas o con fuente grande:
            scroll horizontal, como el prototipo (overflow-x:auto), y el margen
            negativo devuelve el carril al borde de la pantalla para que el
            último chip no muera contra el corte del padding. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-[18px] mt-4"
          contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}
        >
          <Pressable
            onPress={() => irA(`${base}/capitulos?ruta=${encodeURIComponent(data.manuscrito[0]?.ruta ?? 'Manuscrito')}`)}
            className="flex-row items-center gap-1.5 rounded-pill bg-vino px-3.5 py-2.5"
          >
            <Icon name="edit" size={17} color="#FBF7F1" />
            <Text className="font-manrope-semibold text-[12.5px] text-papel">Seguir escribiendo</Text>
          </Pressable>
          <Pressable
            onPress={() => irA(`${base}/tiempo`)}
            className="flex-row items-center gap-1.5 rounded-pill border border-borde-strong bg-papel-card px-3.5 py-2.5"
          >
            <Icon name="timeline" size={17} color="#5E1F2B" />
            <Text className="font-manrope-semibold text-[12.5px] text-vino-dark">Línea temporal</Text>
          </Pressable>
          <Pressable
            onPress={() => setExportando(true)}
            className="flex-row items-center gap-1.5 rounded-pill border border-borde-strong bg-papel-card px-3.5 py-2.5"
          >
            <Icon name="picture_as_pdf" size={17} color="#5E1F2B" />
            <Text className="font-manrope-semibold text-[12.5px] text-vino-dark">Exportar PDF</Text>
          </Pressable>
        </ScrollView>

        <LabelSeccion className="mb-2.5 mt-6">Carpetas del proyecto</LabelSeccion>

        <View
          className="overflow-hidden rounded-[18px] border border-borde bg-papel-card"
          style={{ boxShadow: shadow.card }}
        >
          <FilaCarpeta
            icono="folder"
            color="#7B2D3B"
            titulo="Manuscrito"
            subtitulo={`${plural(data.manuscrito.length, 'parte', 'partes')} · ${plural(capitulos, u.singular, u.plural)}`}
            chevron={manuscrito ? 'expand_less' : 'expand_more'}
            onPress={() => setManuscrito((v) => !v)}
          />
          {manuscrito ? (
            <View className="border-t border-borde-soft">
              {data.manuscrito.map((carpeta) => (
                <SubFila
                  key={carpeta.ruta}
                  icono="folder_open"
                  titulo={carpeta.nombre}
                  subtitulo={`${plural(capitulosDeCarpeta(carpeta).length, u.singular, u.plural)} · ${plural(palabrasDeCarpeta(carpeta), 'palabra', 'palabras')}`}
                  onPress={() => irA(`${base}/capitulos?ruta=${encodeURIComponent(carpeta.ruta)}`)}
                  onLongPress={() => {
                    setParteAccion(carpeta);
                    setNombreParte(carpeta.nombre);
                  }}
                />
              ))}
              <Pressable
                onPress={nuevaParte}
                className="flex-row items-center gap-2.5 bg-papel-soft py-3 pl-10 pr-3.5"
              >
                <Icon name="create_new_folder" size={20} color="#7B2D3B" />
                <Text className="font-manrope-semibold text-[12.5px] text-vino">Nueva parte</Text>
              </Pressable>
            </View>
          ) : null}

          <FilaCarpeta
            icono="folder"
            color="#35513F"
            titulo="Personajes"
            subtitulo={plural(data.personajes.length, 'ficha', 'fichas')}
            chevron={personajes ? 'expand_less' : 'expand_more'}
            borde
            onPress={() => setPersonajes((v) => !v)}
          />
          {personajes ? (
            <View className="border-t border-borde-soft">
              {data.personajes.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => irA(`${base}/personaje?id=${encodeURIComponent(p.id)}`)}
                  className="flex-row items-center gap-2.5 border-b border-borde-soft bg-papel-soft py-3 pl-10 pr-3.5"
                >
                  <Avatar texto={p.nombre} tamano={28} />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="font-manrope-semibold text-[13.5px] text-tinta">
                      {p.nombre}
                    </Text>
                    <Text numberOfLines={1} className="font-manrope-medium text-[11px] text-tinta-muted">
                      {p.apodos[0] ?? 'Sin rol'}
                    </Text>
                  </View>
                  <Icon name="chevron_right" size={18} color="#c0b2a3" />
                </Pressable>
              ))}
              <Pressable
                onPress={nuevaFicha}
                className="flex-row items-center gap-2.5 bg-papel-soft py-3 pl-10 pr-3.5"
              >
                <Icon name="person_add" size={20} color="#7B2D3B" />
                <Text className="font-manrope-semibold text-[12.5px] text-vino">
                  Nueva ficha de personaje
                </Text>
              </Pressable>
            </View>
          ) : null}

          <FilaCarpeta
            icono="folder"
            color="#6E5241"
            titulo="Mundo"
            subtitulo={plural(data.mundo.length, 'nota', 'notas')}
            chevron="chevron_right"
            borde
            onPress={() => irA(`${base}/mundo`)}
          />
          <FilaCarpeta
            icono="folder"
            color="#9b8a7c"
            titulo="Notas sueltas"
            subtitulo={plural(data.notas.length, 'nota', 'notas')}
            chevron="chevron_right"
            borde
            onPress={() => irA(`${base}/notas`)}
          />
        </View>

        <Text className="mt-3 text-center font-manrope-medium text-[11px] text-tinta-disabled">
          Todo esto son carpetas y ficheros normales en tu Drive
        </Text>
        <Text className="mt-1 text-center font-manrope-medium text-[11px] text-tinta-disabled">
          Mantén pulsada una parte para renombrarla o borrarla
        </Text>
      </ScrollView>

      {/* Hoja de acciones de la parte */}
      <Modal
        visible={parteAccion !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setParteAccion(null)}
      >
        <Pressable className="flex-1 bg-[rgba(42,35,32,0.34)]" onPress={() => setParteAccion(null)} />
        <View
          className="rounded-t-sheet bg-papel px-[18px] pt-2.5"
          style={{ paddingBottom: insets.bottom + 26 }}
        >
          <View className="mx-auto mb-4 h-1 w-[38px] rounded-pill bg-rail-handle" />
          <LabelSeccion>Parte del manuscrito</LabelSeccion>

          <TextInput
            value={nombreParte}
            onChangeText={setNombreParte}
            onSubmitEditing={confirmarRenombreParte}
            placeholder="Nombre de la parte"
            placeholderTextColor="#b3a597"
            className="mt-3 rounded-[14px] border-[1.5px] border-borde-strong bg-papel-card px-3.5 py-3 font-lora text-[15px] text-tinta"
          />

          <Pressable
            onPress={confirmarRenombreParte}
            className="mt-3 flex-row items-center justify-center gap-2 rounded-[13px] bg-vino py-3"
          >
            <Icon name="check" size={18} color="#FBF7F1" />
            <Text className="font-manrope-semibold text-[12.5px] text-papel">Guardar nombre</Text>
          </Pressable>

          <Pressable
            onPress={confirmarBorrarParte}
            accessibilityRole="button"
            className="mt-2.5 flex-row items-center justify-center gap-1.5 rounded-[13px] border-[1.5px] border-dashed py-3"
            style={{ borderColor: borde.peligro }}
          >
            <Icon name="delete" size={17} color="#7B2D3B" />
            <Text className="font-manrope-semibold text-[12px] text-vino">Borrar parte</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Hoja de exportación a PDF */}
      <Modal
        visible={exportando}
        transparent
        animationType="slide"
        onRequestClose={() => setExportando(false)}
      >
        <Pressable className="flex-1 bg-[rgba(42,35,32,0.34)]" onPress={() => setExportando(false)} />
        <View
          className="rounded-t-sheet bg-papel px-[18px] pt-2.5"
          style={{ paddingBottom: insets.bottom + 26 }}
        >
          <View className="mx-auto mb-4 h-1 w-[38px] rounded-pill bg-rail-handle" />
          <LabelSeccion>Exportar a PDF</LabelSeccion>

          {(() => {
            const r = resumenExportacion(data);
            return (
              <Text className="mt-2.5 font-manrope-medium text-[12.5px] leading-[19px] text-marron">
                {plural(r.capitulosIncluidos, u.singular, u.plural)} ·{' '}
                {plural(r.palabras, 'palabra', 'palabras')}
                {r.capitulosExcluidos > 0
                  ? ` · ${plural(r.capitulosExcluidos, 'excluido', 'excluidos')}`
                  : ''}
              </Text>
            );
          })()}
          <Text className="mt-1 font-manrope-medium text-[11px] leading-[17px] text-tinta-disabled">
            Cada {u.singular} empieza en página nueva. Para dejar uno fuera, mantenlo pulsado en
            su lista y apaga «Incluir en la exportación».
          </Text>

          <View className="mt-3.5 flex-row items-center justify-between rounded-[14px] border border-borde-verde bg-papel-crema px-3.5 py-3">
            <View className="min-w-0 flex-1 pr-3">
              <Text className="font-manrope-semibold text-[12.5px] text-tinta">
                Encabezar cada {u.singular} con su título
              </Text>
              <Text className="mt-0.5 font-manrope-medium text-[11px] text-marron-light">
                «3. El nombre de Adela» arriba de su página, sin escribirlo a mano
              </Text>
            </View>
            <Switch
              value={opcionesPdf.encabezarCapitulos}
              onValueChange={(v) => setOpcionesPdf((o) => ({ ...o, encabezarCapitulos: v }))}
              trackColor={{ false: '#DDE0D2', true: '#35513F' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {data.manuscrito.length >= 2 ? (
            <View className="mt-2.5 flex-row items-center justify-between rounded-[14px] border border-borde-verde bg-papel-crema px-3.5 py-3">
              <View className="min-w-0 flex-1 pr-3">
                <Text className="font-manrope-semibold text-[12.5px] text-tinta">
                  Página de título por cada parte
                </Text>
                <Text className="mt-0.5 font-manrope-medium text-[11px] text-marron-light">
                  «Parte I — El invierno» en su propia página
                </Text>
              </View>
              <Switch
                value={opcionesPdf.separarPartes}
                onValueChange={(v) => setOpcionesPdf((o) => ({ ...o, separarPartes: v }))}
                trackColor={{ false: '#DDE0D2', true: '#35513F' }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}

          {exportacionDisponible() ? (
            <Pressable
              onPress={generarPdf}
              disabled={generando}
              className="mt-4 flex-row items-center justify-center gap-2 rounded-[16px] bg-vino py-4"
              style={{ boxShadow: shadow.cta, opacity: generando ? 0.7 : 1 }}
            >
              <Icon name="picture_as_pdf" size={19} color="#FBF7F1" />
              <Text className="font-manrope-semibold text-[13.5px] text-papel">
                {generando ? 'Generando…' : 'Generar y compartir PDF'}
              </Text>
            </Pressable>
          ) : (
            <Text className="mt-4 text-center font-manrope-medium text-[12px] leading-[18px] text-marron-light">
              Exportar a PDF necesita la app actualizada: esta versión aún no lo trae.
            </Text>
          )}
        </View>
      </Modal>
    </Pantalla>
  );
}

function FilaCarpeta({
  icono,
  color,
  titulo,
  subtitulo,
  chevron,
  onPress,
  borde = false,
}: {
  icono: string;
  color: string;
  titulo: string;
  subtitulo: string;
  chevron: string;
  onPress: () => void;
  borde?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 p-3.5 ${borde ? 'border-t border-borde-soft' : ''}`}
    >
      <Icon name={icono} size={22} color={color} />
      <View className="min-w-0 flex-1">
        <Text className="font-manrope-semibold text-[14px] text-tinta">{titulo}</Text>
        <Text className="font-manrope-medium text-[11.5px] text-tinta-muted">{subtitulo}</Text>
      </View>
      <Icon name={chevron} size={20} color="#c0b2a3" />
    </Pressable>
  );
}

function SubFila({
  icono,
  titulo,
  subtitulo,
  onPress,
  onLongPress,
}: {
  icono: string;
  titulo: string;
  subtitulo: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      className="flex-row items-center gap-2.5 border-b border-borde-soft bg-papel-soft py-3 pl-10 pr-3.5"
    >
      <Icon name={icono} size={20} color="#6E5241" />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-manrope-semibold text-[13.5px] text-tinta">
          {titulo}
        </Text>
        <Text className="font-manrope-medium text-[11px] text-tinta-muted">{subtitulo}</Text>
      </View>
      <Icon name="chevron_right" size={18} color="#c0b2a3" />
    </Pressable>
  );
}
