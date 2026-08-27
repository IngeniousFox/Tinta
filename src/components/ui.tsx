import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from './Icon';
import { LOMO_INNER_SHADOW, type LomoKey, lomo, shadow } from '@/theme/tokens';

/** Piezas visuales que se repiten por toda la app (TINTA-SPEC §3.4). */

// ---------------------------------------------------------------------------

export function LabelSeccion({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <Text
      className={`font-manrope-semibold text-[11.5px] uppercase tracking-label text-tinta-muted ${className}`}
    >
      {children}
    </Text>
  );
}

export function Tarjeta({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      className={`rounded-[18px] border border-borde bg-papel-card ${className}`}
      style={[{ boxShadow: shadow.card }, style]}
    >
      {children}
    </View>
  );
}

/** El patrón de «añadir» en toda la app: recuadro de borde discontinuo. */
export function BotonAnadir({
  etiqueta,
  icono = 'add',
  onPress,
  color = '#6E5241',
  className = '',
}: {
  etiqueta: string;
  icono?: string;
  onPress: () => void;
  color?: string;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-borde-dashed px-3 py-3 ${className}`}
    >
      <Icon name={icono} size={18} color={color} />
      <Text className="font-manrope-semibold text-[12.5px]" style={{ color }}>
        {etiqueta}
      </Text>
    </Pressable>
  );
}

/**
 * El «← Biblioteca» / «← Proyecto» que encabeza casi todas las pantallas.
 *
 * Estaba escrito a mano en cada una y medía lo que mide el icono: 17 px de
 * alto, muy por debajo de los 48 dp que pide Android, y justo en la esquina
 * donde el pulgar acierta peor. El padding y el `hitSlop` le dan cuerpo sin
 * mover el texto de sitio (el margen negativo devuelve el borde a su columna).
 */
export function EnlaceVolver({ etiqueta, onPress }: { etiqueta: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={`Volver a ${etiqueta}`}
      className="-ml-1 flex-row items-center gap-1.5 self-start py-2 pl-1 pr-2"
    >
      <Icon name="arrow_back" size={17} color="#7B2D3B" />
      <Text className="font-manrope-semibold text-[12px] text-vino">{etiqueta}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

/**
 * Lomo de libro. El `inset box-shadow` por la izquierda es lo que lo hace
 * parecer un lomo y no un rectángulo: sin esa franja, la metáfora se cae.
 */
export function Lomo({
  genero,
  ancho = 52,
  alto = 70,
  etiqueta,
}: {
  genero: LomoKey;
  ancho?: number;
  alto?: number;
  etiqueta?: string;
}) {
  const c = lomo[genero];
  return (
    <LinearGradient
      colors={[c.c1, c.c2]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{
        width: ancho,
        height: alto,
        borderTopLeftRadius: 5,
        borderBottomLeftRadius: 5,
        borderTopRightRadius: 10,
        borderBottomRightRadius: 10,
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
        padding: 7,
        boxShadow: LOMO_INNER_SHADOW,
      }}
    >
      {etiqueta ? (
        // Una sola línea siempre: «poemario» no cabe a 8.5px y se partía en dos.
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{ fontFamily: 'Lora_400Regular', fontSize: 8.5, color: 'rgba(251,247,241,0.8)' }}
        >
          {etiqueta}
        </Text>
      ) : null}
    </LinearGradient>
  );
}

/** Barra de progreso fina de la biblioteca. */
export function BarraProgreso({ porcentaje, color }: { porcentaje: number; color: string }) {
  return (
    <View className="h-[5px] overflow-hidden rounded-pill bg-rail">
      <View
        className="h-full rounded-pill"
        style={{ width: `${Math.max(0, Math.min(100, porcentaje))}%`, backgroundColor: color }}
      />
    </View>
  );
}

/**
 * Anillo del objetivo diario. El prototipo lo hace con `conic-gradient`, que no
 * existe en React Native: aquí es un círculo SVG con `strokeDasharray`.
 */
export function AnilloObjetivo({
  porcentaje,
  tamano = 64,
  grosor = 8,
  fondo = '#F2F0E6',
}: {
  porcentaje: number;
  tamano?: number;
  grosor?: number;
  fondo?: string;
}) {
  const radio = (tamano - grosor) / 2;
  const perimetro = 2 * Math.PI * radio;
  const avance = (Math.max(0, Math.min(100, porcentaje)) / 100) * perimetro;

  return (
    <View style={{ width: tamano, height: tamano }} className="items-center justify-center">
      <Svg width={tamano} height={tamano} style={{ position: 'absolute' }}>
        <Circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={radio}
          stroke="#DDE0D2"
          strokeWidth={grosor}
          fill={fondo}
        />
        {/* Con 0% no se dibuja nada: el extremo redondeado dejaría un punto
            suelto arriba que parece un fallo de render. */}
        {avance > 0 ? (
          <Circle
            cx={tamano / 2}
            cy={tamano / 2}
            r={radio}
            stroke="#35513F"
            strokeWidth={grosor}
            strokeLinecap="round"
            strokeDasharray={`${avance} ${perimetro}`}
            fill="none"
            // Empezar arriba en vez de a la derecha.
            transform={`rotate(-90 ${tamano / 2} ${tamano / 2})`}
          />
        ) : null}
      </Svg>
      <Text className="font-manrope-semibold text-[14px] text-verde">{porcentaje}%</Text>
    </View>
  );
}

/**
 * Punto de color del estado de un capítulo o suceso. Sin color (`null`) sale
 * el círculo de borde discontinuo: lo que todavía no está escrito.
 */
export function PuntoEstado({ color, tamano = 7 }: { color: string | null; tamano?: number }) {
  return (
    <View
      style={{
        width: tamano,
        height: tamano,
        borderRadius: tamano / 2,
        backgroundColor: color ?? 'transparent',
        borderWidth: color ? 0 : 1.5,
        borderColor: '#C9BAAA',
        borderStyle: 'dashed',
      }}
    />
  );
}

/** Avatar circular con iniciales, para personajes y relaciones. */
export function Avatar({ texto, tamano = 30 }: { texto: string; tamano?: number }) {
  const iniciales = texto
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      className="items-center justify-center rounded-full bg-rail-avatar"
      style={{ width: tamano, height: tamano }}
    >
      <Text className="font-manrope-semibold text-marron" style={{ fontSize: tamano * 0.37 }}>
        {iniciales || '·'}
      </Text>
    </View>
  );
}
