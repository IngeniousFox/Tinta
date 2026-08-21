import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { estadoCapitulo, lomo, shadow } from '@/theme/tokens';

/**
 * TEMPORAL — comprobación del sistema de diseño.
 * Se sustituye por la Biblioteca (TINTA-SPEC §4.2.1).
 */
export default function SmokeTest() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1 bg-papel"
      contentContainerStyle={{ padding: 18, paddingTop: insets.top + 12, paddingBottom: 48 }}
    >
      <Text className="font-lora text-[22px] leading-[27px] text-tinta">Buenas tardes, Marta.</Text>
      <Text className="mt-[5px] font-manrope-medium text-[13px] text-tinta-muted">
        Comprobación del sistema de diseño
      </Text>

      <Section title="Tipografía" />
      <View className="gap-2 rounded-[18px] border border-borde bg-papel-card p-4" style={{ boxShadow: shadow.card }}>
        <Text className="font-lora text-[15.5px] text-tinta">Lora 400 · El jardín de las horas muertas</Text>
        <Text className="font-lora-medium text-[15.5px] text-tinta">Lora 500 · El nombre de Adela</Text>
        <Text className="font-lora-italic text-[14px] text-tinta-body">
          Lora cursiva · esa mujer va a abrir algo
        </Text>
        <Text className="font-manrope-medium text-[13px] text-tinta-body">Manrope 500 · interfaz</Text>
        <Text className="font-manrope-semibold text-[13px] text-tinta-body">Manrope 600 · botones</Text>
        <Text className="font-maquina text-[14px] text-tinta-body">Courier Prime · máquina</Text>
      </View>

      <Section title="Iconos" />
      <View
        className="flex-row items-center gap-4 rounded-[18px] border border-borde bg-papel-card p-4"
        style={{ boxShadow: shadow.card }}
      >
        <Icon name="menu" size={24} color="#5E1F2B" />
        <Icon name="search" size={22} color="#5E1F2B" />
        <Icon name="cloud_done" size={20} color="#35513F" />
        <Icon name="edit_note" size={24} color="#7B2D3B" />
        <Icon name="folder" size={22} color="#6E5241" />
        <Icon name="offline_pin" size={20} color="#35513F" />
      </View>
      <Text className="mt-2 text-center font-manrope text-[11px] text-tinta-disabled">
        Si ves palabras en vez de iconos, la ligadura no está funcionando
      </Text>

      <Section title="Estados de capítulo" />
      <View className="gap-2 rounded-[18px] border border-borde bg-papel-card p-4" style={{ boxShadow: shadow.card }}>
        {Object.entries(estadoCapitulo).map(([nombre, color]) => (
          <View key={nombre} className="flex-row items-center gap-[7px]">
            <View className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: color }} />
            <Text className="font-manrope-medium text-[11.5px] text-tinta-muted">{nombre}</Text>
          </View>
        ))}
      </View>

      <Section title="Lomos de proyecto" />
      <View className="flex-row gap-3">
        {Object.entries(lomo).map(([nombre, c]) => (
          <View key={nombre} className="items-center gap-2">
            <View
              className="h-[70px] w-[52px] rounded-l-[5px] rounded-r-[10px]"
              style={{ backgroundColor: c.c1, boxShadow: 'inset 6px 0px 0px rgba(0,0,0,0.22)' }}
            />
            <Text className="font-manrope-medium text-[10.5px] text-tinta-muted">{nombre}</Text>
          </View>
        ))}
      </View>

      <Section title="Superficies" />
      <View className="flex-row flex-wrap gap-2">
        <Swatch label="papel" className="bg-papel" />
        <Swatch label="card" className="bg-papel-card" />
        <Swatch label="warm" className="bg-papel-warm" />
        <Swatch label="crema" className="bg-papel-crema" />
        <Swatch label="vino" className="bg-vino" />
        <Swatch label="verde" className="bg-verde" />
        <Swatch label="marrón" className="bg-marron" />
      </View>
    </ScrollView>
  );
}

function Section({ title }: { title: string }) {
  return (
    <Text className="mb-3 mt-7 font-manrope-semibold text-[11.5px] uppercase tracking-label text-tinta-muted">
      {title}
    </Text>
  );
}

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <View className="items-center gap-1">
      <View className={`h-12 w-12 rounded-[12px] border border-borde ${className}`} />
      <Text className="font-manrope text-[10px] text-tinta-muted">{label}</Text>
    </View>
  );
}
