import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActividad, useAjustes, useProyecto, useProyectos } from '@/datos/consultas';
import {
  capitulosDeProyecto,
  etiquetaGenero,
  porcentajeObjetivo,
  palabrasDeHoy,
} from '@/datos/derivados';
import { textoSync, textoSyncEnFrase, useSync } from '@/drive/SyncContext';
import { gradient, shadow } from '@/theme/tokens';

import { Icon } from './Icon';
import { BarraProgreso, Lomo } from './ui';

const ANCHO_DRAWER = 308;

// ---------------------------------------------------------------------------

/**
 * Armazón común a todas las pantallas: barra superior, menú lateral y selector
 * de proyecto. El estado de Drive va siempre visible — la usuaria no debería
 * tener que preguntarse nunca si su texto está a salvo (TINTA-SPEC §6.3).
 */
export function Pantalla({
  proyecto,
  children,
  fab,
}: {
  proyecto?: string;
  children: ReactNode;
  fab?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [selector, setSelector] = useState(false);

  const { estado: estadoSync } = useSync();
  const sync = textoSync(estadoSync);

  return (
    <View className="flex-1 bg-papel" style={{ paddingTop: insets.top }}>
      <View className="flex-none flex-row items-center gap-1.5 border-b border-borde px-2.5 pb-2.5 pt-2">
        {/* Los botones de solo icono se anuncian con su etiqueta en español: el
            icono es una ligadura de la fuente, y sin esto un lector de pantalla
            leería la cadena cruda «menu». */}
        <Pressable
          onPress={() => setDrawer(true)}
          accessibilityRole="button"
          accessibilityLabel="Abrir el menú"
          className="h-10 w-10 items-center justify-center rounded-[12px]"
        >
          <Icon name="menu" size={24} color="#5E1F2B" />
        </Pressable>

        {proyecto ? (
          <Pressable
            onPress={() => setSelector(true)}
            className="min-w-0 flex-1 flex-row items-center gap-[7px] rounded-[12px] px-2.5 py-1.5"
          >
            <View className="h-7 w-7 items-center justify-center rounded-[9px] overflow-hidden">
              <LinearGradient
                colors={[...gradient.projectChip]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={{ position: 'absolute', width: 28, height: 28 }}
              />
              <Text style={{ fontFamily: 'Lora_600SemiBold', fontSize: 12, color: '#FBF7F1' }}>
                {proyecto.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="font-lora-semibold text-[13.5px] text-tinta">
                {proyecto}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1">
                <Icon name={sync.icono} size={12} color={sync.color} />
                <Text className="font-manrope-medium text-[10.5px] text-tinta-muted">
                  {sync.texto}
                </Text>
              </View>
            </View>
            <Icon name="expand_more" size={20} color="#9b8a7c" />
          </Pressable>
        ) : (
          <View className="min-w-0 flex-1 flex-row items-center gap-2.5 px-2.5 py-1.5">
            <View className="h-7 w-7 items-center justify-center rounded-[9px] bg-papel-warm">
              <Icon name="stylus_note" size={17} color="#5E1F2B" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-lora-semibold text-[14px] text-tinta">Tinta</Text>
              <View className="mt-0.5 flex-row items-center gap-1">
                <Icon name={sync.icono} size={12} color={sync.color} />
                <Text numberOfLines={1} className="font-manrope-medium text-[10.5px] text-tinta-muted">
                  Tu biblioteca · {textoSyncEnFrase(estadoSync)}
                </Text>
              </View>
            </View>
          </View>
        )}

        <Pressable
          onPress={() => router.push('/buscar')}
          accessibilityRole="button"
          accessibilityLabel="Buscar en todo lo que has escrito"
          className="h-10 w-10 items-center justify-center rounded-[12px]"
        >
          <Icon name="search" size={22} color="#5E1F2B" />
        </Pressable>
      </View>

      <View className="min-h-0 flex-1">{children}</View>

      {fab}

      <MenuLateral
        visible={drawer}
        proyecto={proyecto}
        onCerrar={() => setDrawer(false)}
        onCambiarProyecto={() => {
          setDrawer(false);
          setSelector(true);
        }}
      />
      <SelectorProyecto
        visible={selector}
        actual={proyecto}
        onCerrar={() => setSelector(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

function MenuLateral({
  visible,
  proyecto,
  onCerrar,
  onCambiarProyecto,
}: {
  visible: boolean;
  proyecto?: string;
  onCerrar: () => void;
  onCambiarProyecto: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const desplazamiento = useRef(new Animated.Value(-ANCHO_DRAWER)).current;
  const { data: datos } = useProyecto(proyecto);
  const { data: actividad } = useActividad();
  const { data: ajustes } = useAjustes();
  const { estado: estadoSync, cuenta } = useSync();

  useEffect(() => {
    Animated.timing(desplazamiento, {
      toValue: visible ? 0 : -ANCHO_DRAWER,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, desplazamiento]);

  const objetivo = ajustes?.objetivoDiario ?? 500;
  const hoy = palabrasDeHoy(actividad ?? {});
  const pct = porcentajeObjetivo(actividad ?? {}, objetivo);

  const ir = (destino: string) => {
    onCerrar();
    router.push(destino as never);
  };

  /**
   * Marca la entrada donde ella está de verdad. Antes «Carpetas del proyecto»
   * llevaba el resaltado fijo, así que desde Mundo o desde la Línea temporal el
   * menú señalaba un sitio en el que no estaba: mentía.
   *
   * `usePathname` devuelve la ruta ya descodificada y los destinos se
   * construyen con `encodeURIComponent`, así que se comparan las dos formas
   * para que un proyecto con espacios o acentos también se reconozca.
   */
  const enRuta = (destino: string) =>
    pathname === destino || pathname === decodeURIComponent(destino);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable className="flex-1 bg-[rgba(42,35,32,0.42)]" onPress={onCerrar} />
      <Animated.View
        className="absolute bottom-0 left-0 top-0 bg-papel"
        style={{
          width: ANCHO_DRAWER,
          transform: [{ translateX: desplazamiento }],
          boxShadow: shadow.drawer,
        }}
      >
        <LinearGradient
          colors={[...gradient.drawerHeader]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          // El drawer se pinta de borde a borde: la cabecera baja por debajo de
          // la barra de estado (o del recorte de la cámara) en vez de reservar
          // los 42 px a ojo que había aquí.
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: 16 }}
        >
          <View className="flex-row items-center gap-2.5">
            <View className="h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-[rgba(251,247,241,0.16)]">
              {cuenta ? (
                <Text style={{ fontFamily: 'Lora_600SemiBold', fontSize: 14, color: '#FBF7F1' }}>
                  {cuenta.nombre.charAt(0).toUpperCase()}
                </Text>
              ) : (
                <Icon name="stylus_note" size={17} color="#FBF7F1" />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="font-manrope-semibold text-[13px] text-papel">
                {cuenta?.nombre ?? 'Tinta'}
              </Text>
              <Text numberOfLines={1} className="font-manrope-medium text-[10.5px] text-[rgba(251,247,241,0.72)]">
                {cuenta?.email ?? 'Sin cuenta conectada'}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={proyecto ? onCambiarProyecto : () => ir('/')}
            className="mt-4 rounded-[14px] bg-[rgba(251,247,241,0.13)] px-3 py-2.5"
          >
            <Text className="font-manrope-semibold text-[9.5px] uppercase tracking-micro text-[rgba(251,247,241,0.66)]">
              {proyecto ? 'Proyecto' : 'Biblioteca'}
            </Text>
            <View className="mt-[7px] flex-row items-center gap-2">
              <Text numberOfLines={1} className="flex-1 font-lora-medium text-[14px] text-papel">
                {proyecto ?? 'Todos tus proyectos'}
              </Text>
              <Icon name={proyecto ? 'swap_horiz' : 'arrow_forward'} size={20} color="#FBF7F1" />
            </View>
          </Pressable>
        </LinearGradient>

        <ScrollView className="min-h-0 flex-1 px-2.5 py-3">
          <EntradaDrawer
            icono="home_storage"
            etiqueta="Biblioteca"
            activa={enRuta('/')}
            onPress={() => ir('/')}
          />

          {proyecto ? (
            <>
              {(() => {
                const raiz = `/p/${encodeURIComponent(proyecto)}`;
                return (
                  <>
                    <EntradaDrawer
                      icono="folder_open"
                      etiqueta="Carpetas del proyecto"
                      activa={enRuta(raiz)}
                      onPress={() => ir(raiz)}
                    />
                    {/* Manuscrito y Personajes son atajos a esa misma pantalla:
                        no se resaltan también, o el menú tendría tres entradas
                        encendidas a la vez y ninguna diría dónde está. */}
                    <EntradaDrawer
                      icono="menu_book"
                      etiqueta="Manuscrito"
                      anidada
                      contador={datos ? capitulosDeProyecto(datos).length : undefined}
                      onPress={() => ir(raiz)}
                    />
                    <EntradaDrawer
                      icono="groups"
                      etiqueta="Personajes"
                      anidada
                      contador={datos?.personajes.length}
                      // Las fichas se despliegan dentro de la pantalla de proyecto,
                      // igual que en el prototipo: no hay listado aparte.
                      onPress={() => ir(raiz)}
                    />
                    <EntradaDrawer
                      icono="public"
                      etiqueta="Mundo"
                      anidada
                      contador={datos?.mundo.length}
                      activa={enRuta(`${raiz}/mundo`)}
                      onPress={() => ir(`${raiz}/mundo`)}
                    />
                    <EntradaDrawer
                      icono="sticky_note_2"
                      etiqueta="Notas sueltas"
                      anidada
                      contador={datos?.notas.length}
                      activa={enRuta(`${raiz}/notas`)}
                      onPress={() => ir(`${raiz}/notas`)}
                    />
                    <EntradaDrawer
                      icono="timeline"
                      etiqueta="Línea temporal"
                      activa={enRuta(`${raiz}/tiempo`)}
                      onPress={() => ir(`${raiz}/tiempo`)}
                    />
                  </>
                );
              })()}
            </>
          ) : null}

          <EntradaDrawer
            icono="search"
            etiqueta="Buscar en todo"
            activa={enRuta('/buscar')}
            onPress={() => ir('/buscar')}
          />

          <View className="mt-3.5 rounded-[14px] border border-borde-verde bg-papel-crema p-3.5">
            <View className="flex-row items-center justify-between">
              <Text className="font-manrope-semibold text-[11.5px] text-verde">Objetivo de hoy</Text>
              <Text className="font-manrope-semibold text-[11.5px] text-marron">
                {hoy} / {objetivo}
              </Text>
            </View>
            <View className="mt-2.5">
              <BarraProgreso porcentaje={pct} color="#35513F" />
            </View>
          </View>
        </ScrollView>

        <View
          className="flex-none border-t border-borde px-3.5 pt-3"
          // «Ajustes» es la última entrada del menú y quedaba pegada a la barra
          // de gestos o de los tres botones: el inset la separa de verdad.
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <View className="flex-row items-center gap-2.5 rounded-[12px] bg-papel-crema px-2 py-2.5">
            <Icon name={textoSync(estadoSync).icono} size={20} color={textoSync(estadoSync).color} />
            <View className="min-w-0 flex-1">
              <Text className="font-manrope-semibold text-[11.5px] text-tinta">Google Drive</Text>
              <Text numberOfLines={1} className="font-manrope-medium text-[10.5px] text-marron-light">
                Tinta / Proyectos · {textoSyncEnFrase(estadoSync)}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => ir('/ajustes')}
            className="flex-row items-center gap-3.5 px-2 py-3"
          >
            <Icon name="settings" size={20} color="#9b8a7c" />
            <Text className="font-manrope-medium text-[13px] text-tinta-body">Ajustes</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

function EntradaDrawer({
  icono,
  etiqueta,
  onPress,
  anidada = false,
  activa = false,
  contador,
}: {
  icono: string;
  etiqueta: string;
  onPress: () => void;
  anidada?: boolean;
  activa?: boolean;
  contador?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3.5 rounded-[13px] py-3 pr-3 ${anidada ? 'pl-6' : 'pl-3'} ${activa ? 'bg-[rgba(123,45,59,0.09)]' : ''}`}
    >
      <Icon
        name={icono}
        size={anidada ? 19 : 21}
        color={activa ? '#7B2D3B' : anidada ? '#9b8a7c' : '#6E5241'}
      />
      <Text
        className={`flex-1 ${anidada ? 'font-manrope-medium text-[13px]' : 'font-manrope-semibold text-[13.5px]'} ${activa ? 'text-vino-dark' : 'text-tinta-body'}`}
      >
        {etiqueta}
      </Text>
      {contador !== undefined ? (
        <Text className="font-manrope-medium text-[11px] text-tinta-muted">{contador}</Text>
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

function SelectorProyecto({
  visible,
  actual,
  onCerrar,
}: {
  visible: boolean;
  actual?: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: proyectos } = useProyectos();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <Pressable className="flex-1 bg-[rgba(42,35,32,0.42)]" onPress={onCerrar} />
      {/* Con una decena de proyectos la lista pasaba del alto de la pantalla y
          las últimas filas —y el botón de crear— quedaban fuera sin forma de
          desplazarse. Techo de altura y scroll, como la hoja de enlace de la
          línea temporal. */}
      <View
        className="max-h-[70%] rounded-t-sheet bg-papel pt-2.5"
        style={{ paddingBottom: insets.bottom + 26 }}
      >
        <View className="mx-auto mb-3.5 h-1 w-[38px] rounded-pill bg-rail-handle" />
        <Text className="px-[18px] pb-2.5 font-manrope-semibold text-[11.5px] uppercase tracking-label text-tinta-muted">
          Cambiar de proyecto
        </Text>

        <ScrollView style={{ flexShrink: 1 }}>
          {(proyectos ?? []).map((p) => {
            const esActual = p.nombre === actual;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  onCerrar();
                  router.push(`/p/${encodeURIComponent(p.nombre)}` as never);
                }}
                className="flex-row items-center gap-3 px-[18px] py-3.5"
                style={esActual ? { backgroundColor: 'rgba(123,45,59,0.07)' } : undefined}
              >
                <Lomo genero={p.genero} ancho={34} alto={34} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-lora-medium text-[14px] text-tinta">
                    {p.nombre}
                  </Text>
                  <Text className="font-manrope-medium text-[11px] text-tinta-muted">
                    {etiquetaGenero(p.genero)}
                  </Text>
                </View>
                {esActual ? <Icon name="check" size={20} color="#7B2D3B" /> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={() => {
            onCerrar();
            router.push('/' as never);
          }}
          className="flex-row items-center gap-3 px-[18px] pb-1.5 pt-4"
        >
          <Icon name="add_circle" size={21} color="#7B2D3B" />
          <Text className="font-manrope-semibold text-[13.5px] text-vino">
            Nuevo proyecto en Drive
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
