import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Pantalla } from '@/components/Chrome';
import { AnilloObjetivo, BarraProgreso, LabelSeccion, Lomo, Tarjeta } from '@/components/ui';
import {
  useActividad,
  useAjustes,
  useBorrarProyecto,
  useContinuar,
  useCrearProyecto,
  useProyecto,
  useProyectos,
} from '@/datos/consultas';
import {
  GENEROS_ELEGIBLES,
  capitulosDeProyecto,
  etiquetaGenero,
  miles,
  palabrasDeProyecto,
  plural,
  porcentajeObjetivo,
  progresoProyecto,
  racha,
  unidad,
} from '@/datos/derivados';
import { sembrarEjemplo } from '@/datos/semilla';
import { useSync } from '@/drive/SyncContext';
import { cuando } from '@/lib/fechas';
import type { GeneroProyecto, Manifiesto } from '@/datos/tipos';
import { borde, gradient, lomo, shadow } from '@/theme/tokens';

/** Biblioteca — pantalla de inicio (TINTA-SPEC §4.2.1). */
export default function Biblioteca() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: proyectos, isLoading, refetch } = useProyectos();
  const { data: actividad } = useActividad();
  const [creando, setCreando] = useState(false);
  const { cuenta, motivo, entrar } = useSync();

  const lista = proyectos ?? [];
  const { data: continuar } = useContinuar();
  const { data: ajustes } = useAjustes();

  const objetivo = ajustes?.objetivoDiario ?? 500;
  const pct = porcentajeObjetivo(actividad ?? {}, objetivo);
  const dias = racha(actividad ?? {});

  const conectarDrive = async () => {
    try {
      await entrar();
    } catch {
      Alert.alert(
        'No se pudo entrar',
        'Google no dejó completar el acceso. Prueba otra vez en un momento.',
      );
    }
  };

  return (
    <Pantalla
      fab={
        <Pressable
          onPress={() => setCreando(true)}
          className="absolute right-[18px] flex-row items-center gap-2 rounded-[20px] bg-vino px-5 py-4"
          // El FAB se ancla al borde físico de la pantalla, y con edge-to-edge
          // la barra de navegación queda por debajo: sin el inset, sus últimos
          // milímetros caen bajo ella y le comen área táctil.
          style={{ bottom: insets.bottom + 24, boxShadow: shadow.fab }}
        >
          <Icon name="add" size={20} color="#FBF7F1" />
          <Text className="font-manrope-semibold text-[13.5px] text-papel">Nuevo proyecto</Text>
        </Pressable>
      }
    >
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="font-lora text-[22px] leading-[27px] text-tinta">
          {saludo(cuenta?.nombre)}
        </Text>
        {/* Sin sesión, prometer que todo está en Drive es sencillamente falso —
            y la tarjeta de abajo, que invita a conectarla, lo desmentiría en la
            misma pantalla. Se dice lo que de verdad pasa en cada caso. */}
        <Text className="mt-[5px] font-manrope-medium text-[13px] text-tinta-muted">
          {cuenta
            ? lista.length === 0
              ? 'Todo se guarda en tu Drive sin que hagas nada'
              : `${plural(lista.length, 'proyecto', 'proyectos')} · todo se guarda en tu Drive sin que hagas nada`
            : lista.length === 0
              ? 'Todo se guarda en este móvil sin que hagas nada'
              : `${plural(lista.length, 'proyecto', 'proyectos')} · guardado en este móvil`}
        </Text>

        {/* Sin sesión no hay réplica en Drive: se avisa, pero no se bloquea —
            escribir funciona igual y sincronizará cuando entre. */}
        {!cuenta && motivo === null ? (
          <Pressable
            onPress={conectarDrive}
            className="mt-4 flex-row items-center gap-3 rounded-[16px] border border-borde-strong bg-papel-card p-3.5"
            style={{ boxShadow: shadow.card }}
          >
            <Icon name="add_to_drive" size={22} color="#35513F" />
            <View className="min-w-0 flex-1">
              <Text className="font-manrope-semibold text-[13px] text-tinta">
                Conecta tu Google Drive
              </Text>
              <Text className="mt-0.5 font-manrope-medium text-[11.5px] text-tinta-muted">
                Para que tus historias vivan también fuera de este móvil
              </Text>
            </View>
            <Icon name="arrow_forward" size={20} color="#35513F" />
          </Pressable>
        ) : null}

        {continuar ? (
          <Pressable
            onPress={() =>
              router.push(
                `/p/${encodeURIComponent(continuar.proyecto)}/editor?ruta=${encodeURIComponent(continuar.capitulo.ruta)}` as never,
              )
            }
            className="mt-[18px] overflow-hidden rounded-[20px]"
            style={{ boxShadow: shadow.cta }}
          >
            <LinearGradient
              colors={[...gradient.resumeCard]}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14 }}
            >
              <View
                className="h-14 w-[42px] items-center justify-center bg-[rgba(251,247,241,0.14)]"
                style={{
                  borderTopLeftRadius: 4,
                  borderBottomLeftRadius: 4,
                  borderTopRightRadius: 8,
                  borderBottomRightRadius: 8,
                  boxShadow: 'inset 5px 0px 0px rgba(0,0,0,0.25)',
                }}
              >
                <Icon name="edit_note" size={20} color="#FBF7F1" />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-manrope-semibold text-[9.5px] uppercase tracking-micro text-[rgba(251,247,241,0.66)]">
                  Continuar donde lo dejaste
                </Text>
                <Text numberOfLines={1} className="mt-1.5 font-lora-medium text-[14.5px] text-papel">
                  {continuar.capitulo.orden}. {continuar.capitulo.titulo}
                </Text>
                <Text numberOfLines={1} className="mt-[3px] font-manrope-medium text-[11px] text-[rgba(251,247,241,0.72)]">
                  {continuar.proyecto} · {cuando(continuar.capitulo.modificado).toLowerCase()}
                </Text>
              </View>
              <Icon name="arrow_forward" size={22} color="rgba(251,247,241,0.85)" />
            </LinearGradient>
          </Pressable>
        ) : null}

        <View className="mt-4 flex-row items-center gap-4 rounded-[20px] border border-borde-verde bg-papel-crema p-4">
          <AnilloObjetivo porcentaje={pct} />
          <View className="min-w-0 flex-1">
            <Text className="font-manrope-semibold text-[14px] text-tinta">Objetivo de hoy</Text>
            <Text className="mt-[3px] font-manrope-medium text-[12.5px] text-marron">
              {miles(Math.round((pct / 100) * objetivo))} de {plural(objetivo, 'palabra', 'palabras')}
            </Text>
            <Text className="mt-1.5 font-manrope-medium text-[11.5px] text-tinta-muted">
              {dias > 0
                ? `Llevas ${dias} ${dias === 1 ? 'día seguido' : 'días seguidos'} escribiendo 🌱`
                : 'Empieza hoy tu racha 🌱'}
            </Text>
          </View>
        </View>

        <LabelSeccion className="mb-3 mt-7">Tus proyectos</LabelSeccion>

        {isLoading ? (
          <Text className="font-manrope-medium text-[13px] text-tinta-muted">Cargando…</Text>
        ) : lista.length === 0 ? (
          <Vacio onSembrar={async () => { await sembrarEjemplo(); refetch(); }} />
        ) : (
          <View className="gap-3">
            {lista.map((p) => (
              <FilaProyecto key={p.id} manifiesto={p} />
            ))}
          </View>
        )}
      </ScrollView>

      <DialogoNuevoProyecto visible={creando} onCerrar={() => setCreando(false)} />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------

function FilaProyecto({ manifiesto }: { manifiesto: Manifiesto }) {
  const router = useRouter();
  const { data: proyecto } = useProyecto(manifiesto.nombre);
  const borrar = useBorrarProyecto();

  const palabras = proyecto ? palabrasDeProyecto(proyecto) : 0;
  const pct = proyecto ? progresoProyecto(proyecto) : 0;
  // Recuento único de toda la app: el reduce que había aquí se saltaba las
  // subcarpetas, así que un capítulo dentro de una carpeta anidada no se
  // contaba —ni en la fila ni en el diálogo de borrado, que es donde peor está.
  const capitulos = proyecto ? capitulosDeProyecto(proyecto).length : 0;

  /**
   * Borrar un proyecto son meses de trabajo: doble confirmación, con la
   * segunda enseñando el recuento de palabras para que no haya sorpresas.
   */
  const confirmarBorrado = () => {
    Alert.alert(`«${manifiesto.nombre}»`, '¿Qué quieres hacer con este proyecto?', [
      { text: 'Nada, cerrar', style: 'cancel' },
      {
        text: 'Borrarlo…',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            `¿Borrar «${manifiesto.nombre}» del todo?`,
            `Se borrarán sus ${plural(capitulos, 'capítulo', 'capítulos')} y ${plural(palabras, 'palabra', 'palabras')}, de este móvil y de tu Drive. Esto no se puede deshacer.`,
            [
              { text: 'Conservar', style: 'cancel' },
              {
                text: 'Borrar para siempre',
                style: 'destructive',
                onPress: () => borrar.mutate(manifiesto.nombre),
              },
            ],
          ),
      },
    ]);
  };

  return (
    <Pressable
      onPress={() => router.push(`/p/${encodeURIComponent(manifiesto.nombre)}` as never)}
      onLongPress={confirmarBorrado}
      delayLongPress={450}
      className="flex-row gap-3.5 rounded-[18px] border border-borde bg-papel-card p-3.5"
      style={{ boxShadow: shadow.card }}
    >
      <Lomo genero={manifiesto.genero} etiqueta={etiquetaGenero(manifiesto.genero).toLowerCase()} />
      <View className="min-w-0 flex-1 justify-center gap-[7px]">
        <Text numberOfLines={2} className="font-lora-medium text-[15.5px] text-tinta">
          {manifiesto.nombre}
        </Text>
        <Text className="font-manrope-medium text-[12px] text-tinta-muted">
          {capitulos === 0
            ? 'Vacío · 0 palabras'
            : `${plural(capitulos, unidad(manifiesto.genero).singular, unidad(manifiesto.genero).plural)} · ${plural(palabras, 'palabra', 'palabras')}`}
        </Text>
        <BarraProgreso porcentaje={pct} color={lomo[manifiesto.genero].bar} />
      </View>
    </Pressable>
  );
}

function Vacio({ onSembrar }: { onSembrar: () => void }) {
  return (
    <Tarjeta className="items-center p-6">
      <Icon name="auto_stories" size={30} color="#c0b2a3" />
      <Text className="mt-3 text-center font-lora text-[15px] text-tinta">
        Aquí vivirán tus historias
      </Text>
      <Text className="mt-1.5 text-center font-manrope-medium text-[12px] text-tinta-muted">
        Crea tu primer proyecto con el botón de abajo
      </Text>
      {__DEV__ ? (
        <Pressable onPress={onSembrar} className="mt-4 rounded-[10px] bg-papel-warm px-3 py-2">
          <Text className="font-manrope-semibold text-[11px] text-marron">
            Sembrar datos de ejemplo (solo desarrollo)
          </Text>
        </Pressable>
      ) : null}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------

function DialogoNuevoProyecto({ visible, onCerrar }: { visible: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const crear = useCrearProyecto();
  const [nombre, setNombre] = useState('');
  const [genero, setGenero] = useState<GeneroProyecto>('novela');

  const confirmar = async () => {
    const limpio = nombre.trim() || 'Proyecto sin título';
    const m = await crear.mutateAsync({ nombre: limpio, genero });
    setNombre('');
    setGenero('novela');
    onCerrar();
    router.push(`/p/${encodeURIComponent(m.nombre)}` as never);
  };

  // Modal y no un overlay dentro de la pantalla: si no, el FAB queda por
  // encima de la hoja y tapa el botón de crear.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <Pressable className="flex-1 bg-[rgba(42,35,32,0.42)]" onPress={onCerrar} />
      <View className="rounded-t-sheet bg-papel px-[18px] pb-9 pt-2.5">
        <View className="mx-auto mb-4 h-1 w-[38px] rounded-pill bg-rail-handle" />
        <LabelSeccion>Nuevo proyecto</LabelSeccion>

        <TextInput
          value={nombre}
          onChangeText={setNombre}
          placeholder="El título puede esperar…"
          placeholderTextColor="#b3a597"
          autoFocus
          className="mt-3.5 rounded-[14px] border-[1.5px] border-borde-strong bg-papel-card px-3.5 py-3 font-lora text-[15px] text-tinta"
        />

        <View className="mt-3 flex-row gap-2.5">
          {GENEROS_ELEGIBLES.map((g) => (
            <Pressable
              key={g}
              onPress={() => setGenero(g)}
              className="flex-1 items-center gap-2 rounded-[14px] border-[1.5px] bg-papel-card py-3"
              style={{ borderColor: genero === g ? borde.seleccion : borde.neutro }}
            >
              <Lomo genero={g} ancho={26} alto={34} />
              <Text className="font-manrope-semibold text-[11px] text-marron-light">
                {etiquetaGenero(g)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={confirmar}
          disabled={crear.isPending}
          className="mt-4 flex-row items-center justify-center gap-2 rounded-[16px] bg-vino py-4"
          style={{ boxShadow: shadow.cta }}
        >
          <Icon name="auto_stories" size={19} color="#FBF7F1" />
          <Text className="font-manrope-semibold text-[13.5px] text-papel">
            {crear.isPending ? 'Creando…' : 'Crear en Drive'}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function saludo(nombre?: string): string {
  const h = new Date().getHours();
  const momento =
    h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const pila = nombre?.split(' ')[0];
  return pila ? `${momento}, ${pila}.` : `${momento}.`;
}
