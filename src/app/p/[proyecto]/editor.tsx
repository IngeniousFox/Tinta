import {
  RichText,
  useBridgeState,
  useEditorBridge,
  useEditorContent,
} from '@10play/tentap-editor';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { EnlaceVolver, LabelSeccion, PuntoEstado } from '@/components/ui';
import { registrarPalabras } from '@/datos/actividad';
import { guardarCapitulo, leerCapitulo } from '@/datos/almacen';
import { claves, invalidarProyecto, useProyecto } from '@/datos/consultas';
import { unidad } from '@/datos/derivados';
import type { Capitulo, EstadoCapitulo } from '@/datos/tipos';
import { textoSync, useSync } from '@/drive/SyncContext';
import {
  type Alineacion,
  BRIDGES,
  JS_CENTRAR_ESCENAS,
  JS_INSERTAR_ESCENA,
  PREFERENCIAS_POR_DEFECTO,
  type PreferenciasEditor,
  cssPreferencias,
} from '@/editor/config';
import { cssFuentes } from '@/editor/fuentesWebview';
import { HojaTipografia } from '@/editor/HojaTipografia';
import { cuando } from '@/lib/fechas';
import { contarPalabras, htmlAMarkdown, markdownAHtml, minutosDeLectura } from '@/lib/markdown';
import { borde, estadoCapitulo as coloresEstado } from '@/theme/tokens';

const SIGUIENTE_ALINEACION: Record<Alineacion, Alineacion> = {
  left: 'center',
  center: 'justify',
  justify: 'left',
};

const ICONO_ALINEACION: Record<Alineacion, string> = {
  left: 'format_align_left',
  center: 'format_align_center',
  justify: 'format_align_justify',
};

const ESTADOS: EstadoCapitulo[] = ['Borrador', 'Escribiendo ahora', 'Revisado', 'Listo'];

/** Margen tras cargar el documento antes de dar por suya lo que llegue del webview. */
const MARGEN_CARGA_MS = 500;

/**
 * Lo máximo que se frena la salida esperando el HTML del webview. Es un tope,
 * no un tiempo de espera normal: el puente contesta en milisegundos, pero si
 * alguna vez enmudeciera, la usuaria no puede quedarse atrapada en la pantalla.
 */
const ESPERA_HTML_MS = 1500;

const VERDE = '#35513F';
const ROJO = '#7B2D3B';

/** Editor de capítulo (TINTA-SPEC §4.2.4). */
export default function PantallaEditor() {
  const { proyecto, ruta } = useLocalSearchParams<{ proyecto: string; ruta: string }>();
  const router = useRouter();
  const navegacion = useNavigation();
  const insets = useSafeAreaInsets();
  const cliente = useQueryClient();
  const { data: datosProyecto } = useProyecto(proyecto);
  const u = unidad(datosProyecto?.manifiesto.genero);
  const esPoemario = datosProyecto?.manifiesto.genero === 'poemario';
  /** La lista de la que se viene: «Capítulos» en una novela, «Poemas» en un poemario. */
  const listaUnidad = `${u.plural.slice(0, 1).toUpperCase()}${u.plural.slice(1)}`;

  const [capitulo, setCapitulo] = useState<Capitulo | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [tituloBorrador, setTituloBorrador] = useState('');
  const [preferencias, setPreferencias] = useState<PreferenciasEditor>(PREFERENCIAS_POR_DEFECTO);
  const [enfoque, setEnfoque] = useState(false);
  const [hoja, setHoja] = useState(false);
  const [menuEstado, setMenuEstado] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null);
  const [errorGuardado, setErrorGuardado] = useState(false);

  /** HTML del fichero. El webview NO se monta hasta tenerlo (ver abajo). */
  const [htmlInicial, setHtmlInicial] = useState<string | null>(null);
  /**
   * Cuántas veces ha cargado el documento del webview. Es un contador y no un
   * booleano porque, si el documento volviera a cargar, habría que reinyectar
   * el CSS: un booleano que ya está en `true` no distingue esa segunda carga.
   */
  const [cargasWebview, setCargasWebview] = useState(0);

  /** Palabras del último guardado, para saber cuántas ha escrito de nuevo. */
  const palabrasGuardadas = useRef(0);
  const cargado = useRef(false);
  /** Temporizador que arma el autoguardado; se cancela si se sale antes. */
  const temporizadorCarga = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * El capítulo vivo. El estado de React no sirve para esto: `guardar` es
   * asíncrono y puede correr con la clausura de un render anterior, y guardar
   * el texto de ahora junto a los metadatos de antes es lo que duplicaba
   * ficheros al renombrar. Este ref siempre tiene la última versión escrita.
   */
  const capituloRef = useRef<Capitulo | null>(null);
  /** Mismo motivo, para el aviso de fallo: `guardar` no debe recrearse por él. */
  const hayError = useRef(false);

  /**
   * El contenido entra por `initialContent`, que tentap inyecta en el webview
   * **antes de que cargue el documento** — es su mecanismo de carga y no tiene
   * carreras. Mandarlo después con `setContent` sí las tiene: si el editor web
   * aún no ha montado, el mensaje se pierde y el capítulo aparece en blanco
   * (pasaba con el emulador en frío). Por eso el webview no se monta hasta que
   * el fichero está leído.
   */
  const editor = useEditorBridge({
    bridgeExtensions: BRIDGES,
    autofocus: false,
    initialContent: htmlInicial ?? undefined,
  });
  const estado = useBridgeState(editor);
  const html = useEditorContent(editor, { type: 'html', debounceInterval: 2000 });
  const texto = useEditorContent(editor, { type: 'text', debounceInterval: 400 });
  const { estado: estadoDrive } = useSync();

  /**
   * `useEditorBridge` devuelve un objeto NUEVO en cada render (no memoiza), y
   * mientras se teclea hay un render cada pocos milisegundos. Meterlo en las
   * dependencias de un efecto es hacer que ese efecto corra sin parar; por eso
   * en todas partes se usa este ref y no la variable.
   */
  const refEditor = useRef(editor);
  refEditor.current = editor;
  /** Último HTML que llegó por el autoguardado, por si el puente enmudece. */
  const refUltimoHtml = useRef<string | null>(null);
  if (html) refUltimoHtml.current = html;

  // --- Carga inicial -------------------------------------------------------
  useEffect(() => {
    let vigente = true;
    // Aquí, no en la limpieza: lo que llegue del webview a partir de ahora es
    // la carga del fichero, no escritura de la usuaria. Ponerlo al desmontar
    // apagaba el aviso justo antes de que lo mirase el guardado al salir.
    cargado.current = false;
    setNoEncontrado(false);
    leerCapitulo(proyecto, ruta)
      .then((c) => {
        if (!vigente) return;
        if (!c) {
          // El fichero ya no está donde decía la ruta (un renombrado, una
          // entrada vieja en caché). Sin esto la pantalla se quedaba en
          // «Cargando…» para siempre, sin salida ni explicación.
          setNoEncontrado(true);
          return;
        }
        setCapitulo(c);
        capituloRef.current = c;
        setTituloBorrador(c.titulo);
        palabrasGuardadas.current = contarPalabras(c.texto);
        setHtmlInicial(markdownAHtml(c.texto));
      })
      .catch(() => {
        if (vigente) setNoEncontrado(true);
      });
    return () => {
      vigente = false;
    };
  }, [proyecto, ruta]);

  // El temporizador de la carga puede sobrevivir a la pantalla si se sale antes
  // de medio segundo: cabo suelto en el mecanismo que decide si se escribe.
  useEffect(() => {
    return () => {
      if (temporizadorCarga.current) clearTimeout(temporizadorCarga.current);
    };
  }, []);

  // --- Escritura en disco --------------------------------------------------
  /**
   * Único camino de escritura del capítulo. Todos los cambios (texto, título,
   * estado) pasan por aquí para que un fallo de disco deje siempre el mismo
   * rastro: sin esto, `guardarCapitulo` podía lanzar y la cabecera seguía
   * diciendo «Guardado» con el fichero sin escribir.
   */
  const escribir = useCallback(
    (cambio: Partial<Capitulo>): Capitulo | null => {
      const actual = capituloRef.current;
      if (!actual) return null;
      try {
        const actualizado = guardarCapitulo(proyecto, { ...actual, ...cambio });
        capituloRef.current = actualizado;
        setCapitulo(actualizado);
        setGuardadoEn(new Date());
        hayError.current = false;
        setErrorGuardado(false);
        invalidarProyecto(cliente, proyecto);
        return actualizado;
      } catch {
        hayError.current = true;
        setErrorGuardado(true);
        return null;
      }
    },
    [proyecto, cliente],
  );

  // Renombrar cambia también el nombre del fichero (y su homólogo en Drive).
  const confirmarTitulo = () => {
    const actual = capituloRef.current;
    if (!actual) return;
    const titulo = tituloBorrador.trim() || u.sinTitulo;
    if (titulo === actual.titulo) return;
    const actualizado = escribir({ titulo });
    if (actualizado) setTituloBorrador(actualizado.titulo);
  };

  const cambiarEstado = (nuevo: EstadoCapitulo) => {
    escribir({ estado: nuevo });
    setMenuEstado(false);
  };

  // --- Tipografía y alineación (CSS, igual que el prototipo) ---------------
  // Inyectar antes de que el webview cargue es tirar el CSS a la nada; por eso
  // ambos efectos esperan a que el documento haya cargado.
  /** Qué se inyectó ya en esta carga del webview, para no repetirlo. */
  const cssInyectado = useRef('');
  const fuenteInyectada = useRef('');

  useEffect(() => {
    if (cargasWebview === 0) return;
    const css = cssPreferencias(preferencias);
    const clave = `${cargasWebview}·${css}`;
    if (cssInyectado.current === clave) return;
    cssInyectado.current = clave;
    refEditor.current.injectCSS(css, 'preferencias-tinta');
  }, [preferencias, cargasWebview]);

  useEffect(() => {
    if (cargasWebview === 0) return;
    const clave = `${cargasWebview}·${preferencias.fuente}`;
    if (fuenteInyectada.current === clave) return;
    let vigente = true;
    cssFuentes(preferencias.fuente).then((css) => {
      if (!vigente || !css) return;
      // Marcar solo cuando la inyección ocurre de verdad. Son ~650 KB de
      // base64 por el puente: repetirlos en cada render agarrotaba el editor.
      fuenteInyectada.current = clave;
      refEditor.current.injectCSS(css, 'fuentes-tinta');
    });
    return () => {
      vigente = false;
    };
  }, [preferencias.fuente, cargasWebview]);

  // --- Autoguardado --------------------------------------------------------
  const guardar = useCallback(
    async (htmlActual: string) => {
      const actual = capituloRef.current;
      if (!actual) return;
      const markdown = htmlAMarkdown(htmlActual);
      // Si no hay cambios no hay nada que escribir, salvo que el último intento
      // fallara: entonces el fichero puede estar sin escribir y hay que volver.
      if (markdown === actual.texto && !hayError.current) return;

      // Cinturón contra la pérdida de prosa: un capítulo con texto nunca pasa
      // a vacío por autoguardado. Si el webview devolviera un documento en
      // blanco (carga a medias, webview muerto), esto lo pararía; el precio es
      // que vaciar un capítulo del todo a mano no se persiste, y ese caso se
      // resuelve borrando el capítulo, que para eso tiene camino propio.
      if (markdown === '' && actual.texto !== '') return;

      if (!escribir({ texto: markdown })) return;

      // Que una recarga del documento no resucite el texto de apertura: lo que
      // el webview reinyectaría al volver a cargar tiene que ser lo último
      // guardado, no lo que había cuando se abrió el capítulo.
      setHtmlInicial(markdownAHtml(markdown));

      // Solo se apunta lo que suma: borrar no descuenta de la racha del día.
      const ahoraPalabras = contarPalabras(markdown);
      const escritas = ahoraPalabras - palabrasGuardadas.current;
      palabrasGuardadas.current = ahoraPalabras;
      if (escritas > 0) {
        try {
          await registrarPalabras(escritas);
          cliente.invalidateQueries({ queryKey: claves.actividad });
        } catch {
          // La racha no es prosa: si no se puede apuntar, no hay que alarmar.
        }
      }
    },
    [escribir, cliente],
  );

  useEffect(() => {
    if (!cargado.current || !html) return;
    void guardar(html);
  }, [html, guardar]);

  /**
   * El HTML con el que salir, pedido al webview mientras sigue vivo. Si el
   * puente no contesta a tiempo se cae al último HTML del autoguardado: mejor
   * guardar algo de hace un momento que quedarse esperando a un webview mudo.
   */
  const htmlDeSalida = useCallback(async (): Promise<string | null> => {
    try {
      const actual = await Promise.race([
        refEditor.current.getHTML(),
        new Promise<null>((resolver) => setTimeout(() => resolver(null), ESPERA_HTML_MS)),
      ]);
      return actual ?? refUltimoHtml.current;
    } catch {
      return refUltimoHtml.current;
    }
  }, []);

  /**
   * Guardado al salir. El webview muere con la pantalla, así que su HTML hay
   * que pedirlo ANTES de desmontar: se frena la salida, se guarda y solo
   * entonces se repite la acción de navegación. Pasan por aquí los tres
   * caminos de vuelta —la flecha, el botón físico y el gesto—, que es lo que
   * garantiza que no se pierda ni lo tecleado en los últimos dos segundos.
   */
  const saliendo = useRef(false);
  useEffect(() => {
    return navegacion.addListener('beforeRemove', (e) => {
      if (saliendo.current || !cargado.current) return;
      e.preventDefault();
      saliendo.current = true;
      void htmlDeSalida()
        .then((h) => (h ? guardar(h) : undefined))
        .finally(() => navegacion.dispatch(e.data.action));
    });
  }, [navegacion, htmlDeSalida, guardar]);

  /**
   * Última red, por si la pantalla se desmontara sin pasar por `beforeRemove`
   * (el navegador entero se va). Aquí ya no se puede preguntar al webview
   * —muere con la pantalla, y ese era el fallo del guardado al salir de
   * antes—, así que se escribe el último HTML que llegó por el autoguardado.
   */
  const refGuardar = useRef(guardar);
  refGuardar.current = guardar;
  useEffect(() => {
    return () => {
      if (!cargado.current || saliendo.current) return;
      const ultimo = refUltimoHtml.current;
      if (ultimo) void refGuardar.current(ultimo);
    };
  }, []);

  const reintentarGuardado = () => {
    void htmlDeSalida().then((h) => (h ? guardar(h) : undefined));
  };

  // `setContent` no emite actualización de contenido, así que hasta la primera
  // tecla el recuento sale del fichero, no del webview.
  const palabras = contarPalabras(texto ?? capitulo?.texto ?? '');
  const cambiar = (p: Partial<PreferenciasEditor>) => setPreferencias((v) => ({ ...v, ...p }));

  // La cabecera habla del fichero y el pie de Drive. Cuando las dos líneas
  // salían de `textoSync` se leía «Guardado · guardado en drive · hace un
  // momento»: la palabra repetida y el nombre propio en minúscula.
  const sync = textoSync(estadoDrive);
  const avisoGuardado = errorGuardado
    ? 'Sin guardar — toca para reintentar'
    : guardadoEn
      ? `Guardado · ${cuando(guardadoEn.toISOString()).toLowerCase()}`
      : 'Guardado';

  return (
    <View className="flex-1 bg-papel" style={{ paddingTop: insets.top }}>
      {enfoque ? (
        <View className="flex-none flex-row justify-end px-3 pb-0.5 pt-2.5">
          <Pressable
            onPress={() => setEnfoque(false)}
            className="h-9 flex-row items-center gap-1.5 rounded-pill border border-borde-strong bg-papel-warm px-3.5"
          >
            <Icon name="fullscreen_exit" size={18} color="#5E1F2B" />
            <Text className="font-manrope-semibold text-[12.5px] text-vino-dark">
              Salir del modo enfoque
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View className="flex-none flex-row items-center gap-2 px-3 pb-2 pt-2.5">
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              className="h-9 w-9 items-center justify-center rounded-[11px]"
            >
              <Icon name="arrow_back" size={22} color="#5E1F2B" />
            </Pressable>
            <View className="min-w-0 flex-1">
              {capitulo ? (
                <View className="flex-row items-baseline gap-1">
                  <Text className="font-lora-medium text-[13.5px] text-tinta">
                    {capitulo.orden}.
                  </Text>
                  {/* El título se renombra tocándolo, como todo en la app. */}
                  <TextInput
                    value={tituloBorrador}
                    onChangeText={setTituloBorrador}
                    onBlur={confirmarTitulo}
                    placeholder={u.sinTitulo}
                    placeholderTextColor="#b3a597"
                    className="min-w-0 flex-1 font-lora-medium text-[13.5px] text-tinta"
                    style={{ padding: 0, margin: 0 }}
                  />
                </View>
              ) : (
                <Text className="font-lora-medium text-[13.5px] text-tinta">
                  {noEncontrado ? `No encuentro este ${u.singular}` : 'Cargando…'}
                </Text>
              )}
              {capitulo ? (
                <Pressable onPress={reintentarGuardado} disabled={!errorGuardado} hitSlop={6}>
                  <Text
                    numberOfLines={1}
                    className="font-manrope-medium text-[10.5px]"
                    style={{ color: errorGuardado ? ROJO : VERDE }}
                  >
                    {avisoGuardado}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => setMenuEstado(true)}
              accessibilityRole="button"
              accessibilityLabel={`Cambiar el estado del ${u.singular}`}
              className="h-9 flex-row items-center gap-1.5 rounded-pill border border-borde-strong px-2.5"
            >
              <PuntoEstado color={capitulo ? coloresEstado[capitulo.estado] : null} />
              <Icon name="expand_more" size={16} color="#9b8a7c" />
            </Pressable>
            <Pressable
              onPress={() => setEnfoque(true)}
              accessibilityRole="button"
              accessibilityLabel="Modo enfoque"
              className="h-9 w-9 items-center justify-center rounded-[11px]"
            >
              <Icon name="fullscreen" size={21} color="#6E5241" />
            </Pressable>
          </View>

          {/* Desplazable en horizontal por si el ancho no da (poemario añade un botón). */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            className="flex-none border-b border-borde"
            contentContainerStyle={{
              alignItems: 'center',
              paddingHorizontal: 10,
              paddingTop: 4,
              paddingBottom: 8,
              flexGrow: 1,
            }}
          >
            <Boton onPress={editor.undo} icono="undo" etiqueta="Deshacer" deshabilitado={!estado.canUndo} />
            <Boton onPress={editor.redo} icono="redo" etiqueta="Rehacer" deshabilitado={!estado.canRedo} />
            <Separador />
            <Letra onPress={editor.toggleBold} activo={estado.isBoldActive} letra="B" etiqueta="Negrita" peso="bold" />
            <Letra onPress={editor.toggleItalic} activo={estado.isItalicActive} letra="I" etiqueta="Cursiva" peso="italic" />
            <Letra
              onPress={editor.toggleUnderline}
              activo={estado.isUnderlineActive}
              letra="U"
              etiqueta="Subrayado"
              peso="underline"
            />
            <Separador />
            <Boton
              onPress={() => editor.toggleHeading(3)}
              icono="title"
              etiqueta="Encabezado de escena"
              activo={estado.headingLevel === 3}
            />
            <Letra onPress={() => editor.injectJS(JS_INSERTAR_ESCENA)} letra="✦" etiqueta="Separador de escena" color="#7B2D3B" />
            {/* Verso: salto de línea sin cerrar el párrafo. Solo en poemarios. */}
            {esPoemario ? <Boton onPress={editor.setHardBreak} icono="keyboard_return" etiqueta="Salto de verso" /> : null}
            <Boton
              onPress={() => cambiar({ alineacion: SIGUIENTE_ALINEACION[preferencias.alineacion] })}
              icono={ICONO_ALINEACION[preferencias.alineacion]}
              etiqueta="Cambiar la alineación"
            />
            <Pressable
              onPress={() => setHoja(true)}
              accessibilityRole="button"
              accessibilityLabel="Tipografía y tamaño de letra"
              className="ml-auto h-9 flex-row items-center gap-1.5 rounded-[10px] bg-papel-warm px-3"
            >
              <Icon name="text_fields" size={19} color="#5E1F2B" />
              <Text className="font-manrope-semibold text-[13px] text-vino-dark">Aa</Text>
            </Pressable>
          </ScrollView>
        </>
      )}

      {noEncontrado ? (
        <View className="flex-1 items-center justify-center gap-2.5 px-9">
          <Icon name="search_off" size={34} color="#9b8a7c" />
          <Text className="text-center font-lora-medium text-[15px] text-tinta">
            Este {u.singular} no está donde apuntaba el enlace
          </Text>
          <Text className="text-center font-manrope-medium text-[12.5px] leading-[18px] text-tinta-muted">
            Seguramente se renombró y el fichero cambió de nombre. Vuelve a la lista y ábrelo desde
            ahí: el texto sigue guardado.
          </Text>
          <EnlaceVolver etiqueta={listaUnidad} onPress={() => router.back()} />
        </View>
      ) : htmlInicial !== null ? (
        <RichText
          editor={editor}
          style={{ flex: 1, backgroundColor: '#FBF7F1' }}
          originWhitelist={['*']}
          textZoom={100}
          onLoadEnd={() => {
            setCargasWebview((n) => n + 1);
            editor.injectJS(JS_CENTRAR_ESCENAS);
            // A partir de aquí, lo que cambie es de la usuaria, no de la carga.
            if (temporizadorCarga.current) clearTimeout(temporizadorCarga.current);
            temporizadorCarga.current = setTimeout(() => {
              cargado.current = true;
            }, MARGEN_CARGA_MS);
          }}
        />
      ) : (
        <View className="flex-1 bg-papel" />
      )}

      <View
        className="flex-none flex-row items-center justify-between gap-3 border-t border-borde bg-papel-soft px-4 py-2.5"
        style={{ paddingBottom: insets.bottom + 10 }}
      >
        <Text className="font-manrope-medium text-[12px] text-tinta-muted">
          {palabras.toLocaleString('es-ES')} palabras · {minutosDeLectura(palabras)} min
        </Text>
        {/* El estado real de Drive, no una frase fija: aquí decía siempre
            «Disponible sin conexión», incluso con la cola llena. */}
        <View className="min-w-0 flex-row items-center gap-1.5">
          <Icon name={sync.icono} size={16} color={sync.color} />
          <Text
            numberOfLines={1}
            className="font-manrope-semibold text-[11.5px]"
            style={{ color: sync.color }}
          >
            {sync.texto}
          </Text>
        </View>
      </View>

      <HojaTipografia
        visible={hoja}
        preferencias={preferencias}
        onCambiar={cambiar}
        onCerrar={() => setHoja(false)}
      />

      <Modal visible={menuEstado} transparent animationType="slide" onRequestClose={() => setMenuEstado(false)}>
        <Pressable className="flex-1 bg-[rgba(42,35,32,0.34)]" onPress={() => setMenuEstado(false)} />
        <View className="rounded-t-sheet bg-papel px-[18px] pt-2.5" style={{ paddingBottom: insets.bottom + 26 }}>
          <View className="mx-auto mb-4 h-1 w-[38px] rounded-pill bg-rail-handle" />
          <LabelSeccion>Estado del {u.singular}</LabelSeccion>
          <View className="mt-3 gap-2">
            {ESTADOS.map((e) => (
              <Pressable
                key={e}
                onPress={() => cambiarEstado(e)}
                className="flex-row items-center gap-3 rounded-[14px] border-[1.5px] bg-papel-card px-3.5 py-3"
                style={{ borderColor: capitulo?.estado === e ? borde.seleccion : borde.neutro }}
              >
                <PuntoEstado color={coloresEstado[e]} tamano={9} />
                <Text className="flex-1 font-manrope-semibold text-[13px] text-tinta-body">{e}</Text>
                {capitulo?.estado === e ? <Icon name="check" size={18} color="#7B2D3B" /> : null}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------

function Separador() {
  return <View className="mx-1 h-[22px] w-px bg-rail-divider" />;
}

function Boton({
  onPress,
  icono,
  etiqueta,
  activo = false,
  deshabilitado = false,
}: {
  onPress: () => void;
  icono: string;
  etiqueta: string;
  activo?: boolean;
  deshabilitado?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ selected: activo, disabled: deshabilitado }}
      className={`h-9 w-[34px] items-center justify-center rounded-[10px] ${activo ? 'bg-papel-warm' : ''}`}
      style={deshabilitado ? { opacity: 0.35 } : undefined}
    >
      <Icon name={icono} size={20} color={activo ? '#5E1F2B' : '#6E5241'} />
    </Pressable>
  );
}

function Letra({
  onPress,
  letra,
  etiqueta,
  activo = false,
  peso,
  color,
}: {
  onPress: () => void;
  letra: string;
  etiqueta: string;
  activo?: boolean;
  peso?: 'bold' | 'italic' | 'underline';
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ selected: activo }}
      className={`h-9 w-[34px] items-center justify-center rounded-[10px] ${activo ? 'bg-papel-warm' : ''}`}
    >
      <Text
        style={{
          fontFamily:
            peso === 'bold'
              ? 'Lora_600SemiBold'
              : peso === 'italic'
                ? 'Lora_400Regular_Italic'
                : 'Lora_400Regular',
          fontSize: 15,
          color: color ?? '#2A2320',
          textDecorationLine: peso === 'underline' ? 'underline' : 'none',
        }}
      >
        {letra}
      </Text>
    </Pressable>
  );
}
