import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Tarjeta } from '@/components/ui';
import { leerProyecto, listarProyectos } from '@/datos/almacen';
import { claves } from '@/datos/consultas';
import { capitulosDeProyecto, conMayuscula, plural, unidad } from '@/datos/derivados';

/**
 * La familia del resultado. El *texto* que se enseña no es esto: un capítulo
 * de un poemario se etiqueta «Poema». Por eso el tipo y su rótulo van sueltos.
 */
type FamiliaResultado = 'capitulo' | 'personaje' | 'mundo' | 'nota';

type Resultado = {
  clave: string;
  familia: FamiliaResultado;
  /** Lo que se lee en la tarjeta: «Capítulo», «Poema», «Personaje»… */
  rotulo: string;
  color: string;
  icono: string;
  titulo: string;
  fragmento: string;
  proyecto: string;
  destino: string;
  /** Para ordenar «lo último que has escrito» sin consulta. */
  modificado: string;
};

const ESTILO: Record<FamiliaResultado, { color: string; icono: string }> = {
  capitulo: { color: '#7B2D3B', icono: 'description' },
  personaje: { color: '#6E5241', icono: 'face' },
  mundo: { color: '#35513F', icono: 'public' },
  nota: { color: '#6E5241', icono: 'sticky_note_2' },
};

/** Cuántos elementos se enseñan cuando todavía no ha escrito nada en el campo. */
const RECIENTES = 12;

/**
 * Búsqueda global (TINTA-SPEC §4.2.9).
 *
 * Recorre todos los proyectos, no solo el abierto: una idea suelta puede estar
 * en cualquier sitio, y obligarla a recordar dónde la escribió sería justo lo
 * contrario de lo que sirve una búsqueda.
 */
export default function Buscar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [consulta, setConsulta] = useState('');

  const { data: corpus, isLoading } = useQuery({
    queryKey: claves.corpus,
    queryFn: async (): Promise<Resultado[]> => {
      const salida: Resultado[] = [];
      for (const m of await listarProyectos()) {
        const p = await leerProyecto(m.nombre);
        if (!p) continue;
        const base = `/p/${encodeURIComponent(m.nombre)}`;
        // En un poemario los documentos son poemas: el rótulo lo dice.
        const u = unidad(m.genero);

        for (const c of capitulosDeProyecto(p)) {
          salida.push({
            clave: `cap-${c.id}`,
            familia: 'capitulo',
            rotulo: conMayuscula(u.singular),
            ...ESTILO.capitulo,
            titulo: `${c.orden}. ${c.titulo}`,
            fragmento: c.texto,
            proyecto: m.nombre,
            destino: `${base}/editor?ruta=${encodeURIComponent(c.ruta)}`,
            modificado: c.modificado,
          });
        }
        for (const per of p.personajes) {
          salida.push({
            clave: `per-${per.id}`,
            familia: 'personaje',
            rotulo: 'Personaje',
            ...ESTILO.personaje,
            // Los apodos también se buscan: en la prosa casi nunca aparece el
            // nombre completo, y ella los busca como los llama.
            titulo: per.nombre,
            fragmento: [
              per.apodos.join(' '),
              per.aspecto,
              per.personalidad,
              per.trasfondo,
              per.notas,
            ].join(' '),
            proyecto: m.nombre,
            destino: `${base}/personaje?id=${encodeURIComponent(per.id)}`,
            modificado: per.modificado,
          });
        }
        for (const n of p.mundo) {
          salida.push({
            clave: `mun-${n.id}`,
            familia: 'mundo',
            rotulo: 'Mundo',
            ...ESTILO.mundo,
            titulo: n.titulo,
            fragmento: [n.descripcion, ...n.reglas, ...n.etiquetas.map((e) => e.texto)].join(' '),
            proyecto: m.nombre,
            destino: `${base}/nota-mundo?id=${encodeURIComponent(n.id)}`,
            modificado: n.modificado,
          });
        }
        for (const n of p.notas) {
          salida.push({
            clave: `not-${n.id}`,
            familia: 'nota',
            rotulo: 'Nota',
            ...ESTILO.nota,
            titulo: 'Notas sueltas',
            fragmento: n.texto,
            proyecto: m.nombre,
            destino: `${base}/notas`,
            modificado: n.modificado,
          });
        }
        // La línea temporal también es texto suyo y se buscaba fuera de ella.
        for (const s of p.lineaTemporal.sucesos) {
          salida.push({
            clave: `suc-${s.id}`,
            familia: 'nota',
            rotulo: 'Suceso',
            ...ESTILO.nota,
            icono: 'timeline',
            titulo: s.titulo,
            fragmento: [s.fecha, s.descripcion].join(' '),
            proyecto: m.nombre,
            destino: `${base}/tiempo`,
            // Un suceso no guarda fecha propia: la de la línea temporal entera
            // es lo más cercano a «cuándo lo tocó».
            modificado: p.lineaTemporal.modificado,
          });
        }
      }
      return salida;
    },
  });

  const q = consulta.trim().toLowerCase();
  const resultados = useMemo(() => {
    const todo = corpus ?? [];
    // Sin consulta se enseña lo último tocado, no los primeros doce del corpus:
    // el corpus se construye proyecto a proyecto y por tipos, así que recortar
    // sin ordenar daba doce cosas sueltas sin ningún criterio explicable.
    if (!q) {
      return [...todo]
        .sort((a, b) => b.modificado.localeCompare(a.modificado))
        .slice(0, RECIENTES);
    }
    return todo.filter((r) => `${r.titulo} ${r.fragmento}`.toLowerCase().includes(q));
  }, [corpus, q]);

  return (
    <View className="flex-1 bg-papel" style={{ paddingTop: insets.top + 8 }}>
      <View className="px-[18px]">
        <View className="h-12 flex-row items-center gap-2.5 rounded-[14px] border-[1.5px] border-vino bg-papel-card px-3.5">
          <Icon name="search" size={20} color="#7B2D3B" />
          <TextInput
            value={consulta}
            onChangeText={setConsulta}
            placeholder="Busca en capítulos, personajes, notas…"
            placeholderTextColor="#b3a597"
            autoFocus
            className="min-w-0 flex-1 font-manrope-medium text-[14px] text-tinta"
            style={{ padding: 0 }}
          />
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Cerrar la búsqueda"
            hitSlop={12}
            className="-mr-2 h-10 w-10 items-center justify-center"
          >
            <Icon name="close" size={19} color="#9b8a7c" />
          </Pressable>
        </View>

        {/* Leer todos los proyectos de disco tarda, y el campo tiene autoFocus:
            mientras tanto no puede decirse «0 resultados», que es afirmar que su
            texto no existe justo cuando todavía no se ha mirado. */}
        <Text className="mt-3 font-manrope-medium text-[12px] text-tinta-muted">
          {isLoading
            ? 'Buscando en todo lo que has escrito…'
            : q
              ? `${plural(resultados.length, 'resultado', 'resultados')} para «${consulta.trim()}»`
              : 'Lo último que has escrito · escribe para filtrar'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
        <View className="gap-2.5">
          {resultados.map((r) => (
            <Pressable key={r.clave} onPress={() => router.push(r.destino as never)}>
              <Tarjeta className="px-3.5 py-3.5">
                <View className="flex-row items-center gap-1.5">
                  <Icon name={r.icono} size={16} color={r.color} />
                  <Text className="font-manrope-semibold text-[12px]" style={{ color: r.color }}>
                    {r.rotulo}
                  </Text>
                  <Text className="font-manrope-medium text-[11px] text-tinta-disabled">
                    · {r.proyecto}
                  </Text>
                </View>
                <Text numberOfLines={1} className="mt-2 font-lora-medium text-[13.5px] text-tinta">
                  {r.titulo}
                </Text>
                {r.fragmento.trim() ? (
                  <Text numberOfLines={2} className="mt-1 font-lora text-[12.5px] leading-5 text-marron-light">
                    «{fragmento(r.fragmento, q)}»
                  </Text>
                ) : null}
              </Tarjeta>
            </Pressable>
          ))}
        </View>

        {q && resultados.length === 0 && !isLoading ? (
          <Text className="mt-6 text-center font-manrope-medium text-[12.5px] text-tinta-disabled">
            Nada por aquí. Prueba con otra palabra.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Recorta alrededor de la coincidencia, para que el fragmento sirva de algo. */
function fragmento(texto: string, consulta: string): string {
  const limpio = texto.replace(/[#*_]/g, '').replace(/\s+/g, ' ').trim();
  if (!consulta) return limpio.slice(0, 110);

  const i = limpio.toLowerCase().indexOf(consulta);
  if (i === -1) return limpio.slice(0, 110);

  const desde = Math.max(0, i - 40);
  const trozo = limpio.slice(desde, desde + 120);
  return `${desde > 0 ? '…' : ''}${trozo}`;
}
