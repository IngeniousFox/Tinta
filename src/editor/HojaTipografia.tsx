import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { borde } from '@/theme/tokens';
import {
  ETIQUETA_FUENTE,
  type FuenteEditor,
  INTERLINEADO,
  type PreferenciasEditor,
  TAMANO_MAX,
  TAMANO_MIN,
} from './config';

/** Hoja «Aa» del editor (TINTA-SPEC §4.2.4). */
export function HojaTipografia({
  visible,
  preferencias,
  onCambiar,
  onCerrar,
}: {
  visible: boolean;
  preferencias: PreferenciasEditor;
  onCambiar: (parcial: Partial<PreferenciasEditor>) => void;
  onCerrar: () => void;
}) {
  const insets = useSafeAreaInsets();
  const progresoTamano =
    ((preferencias.tamano - TAMANO_MIN) / (TAMANO_MAX - TAMANO_MIN)) * 100;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <Pressable className="flex-1 bg-[rgba(42,35,32,0.34)]" onPress={onCerrar} />

      <View
        className="rounded-t-sheet bg-papel px-[18px] pt-2.5"
        style={{ paddingBottom: insets.bottom + 26 }}
      >
        <View className="mx-auto mb-4 h-1 w-[38px] rounded-pill bg-rail-handle" />

        <View className="flex-row items-center justify-between">
          <Text className="font-manrope-semibold text-[11.5px] uppercase tracking-label text-tinta-muted">
            Tipografía
          </Text>
          <Pressable onPress={onCerrar}>
            <Text className="font-manrope-semibold text-[12.5px] text-vino">Listo</Text>
          </Pressable>
        </View>

        {/* Fuente */}
        <View className="mt-3.5 flex-row gap-2.5">
          <TarjetaFuente
            clave="Lora"
            muestra="Aa"
            familia="Lora_400Regular"
            tamano={20}
            actual={preferencias.fuente}
            onPress={onCambiar}
          />
          <TarjetaFuente
            clave="Manrope"
            muestra="Aa"
            familia="Manrope_500Medium"
            tamano={20}
            actual={preferencias.fuente}
            onPress={onCambiar}
          />
          <TarjetaFuente
            clave="Maquina"
            etiqueta="Máquina"
            muestra="Aa"
            familia="CourierPrime_400Regular"
            tamano={19}
            actual={preferencias.fuente}
            onPress={onCambiar}
          />
        </View>
        <Text className="mt-2.5 text-center font-manrope-medium text-[11.5px] text-tinta-muted">
          Fuente actual: {ETIQUETA_FUENTE[preferencias.fuente]}
        </Text>

        {/* Tamaño */}
        <View className="mt-[18px]">
          <View className="flex-row items-center justify-between">
            <Text className="font-manrope-semibold text-[12px] text-tinta-body">Tamaño</Text>
            <Text className="font-manrope-semibold text-[12px] text-tinta-muted">
              {preferencias.tamano} px
            </Text>
          </View>
          <View className="mt-2.5 flex-row items-center gap-3">
            <Pressable
              onPress={() => onCambiar({ tamano: Math.max(TAMANO_MIN, preferencias.tamano - 2) })}
              className="h-11 w-11 items-center justify-center rounded-[13px] bg-papel-warm"
            >
              <Text style={{ fontFamily: 'Lora_500Medium', fontSize: 14, color: '#5E1F2B' }}>A</Text>
            </Pressable>
            <View className="h-1.5 flex-1 rounded-pill bg-rail">
              <View
                className="h-full rounded-pill bg-vino"
                style={{ width: `${Math.max(8, Math.min(100, progresoTamano))}%` }}
              />
            </View>
            <Pressable
              onPress={() => onCambiar({ tamano: Math.min(TAMANO_MAX, preferencias.tamano + 2) })}
              className="h-11 w-11 items-center justify-center rounded-[13px] bg-papel-warm"
            >
              <Text style={{ fontFamily: 'Lora_500Medium', fontSize: 22, color: '#5E1F2B' }}>A</Text>
            </Pressable>
          </View>
        </View>

        {/* Interlineado */}
        <View className="mt-[18px]">
          <Text className="font-manrope-semibold text-[12px] text-tinta-body">Interlineado</Text>
          <View className="mt-2.5 flex-row gap-2.5">
            <OpcionInterlineado
              etiqueta="Justo"
              icono="density_small"
              valor={INTERLINEADO.justo}
              actual={preferencias.interlineado}
              onPress={onCambiar}
            />
            <OpcionInterlineado
              etiqueta="Normal"
              icono="density_medium"
              valor={INTERLINEADO.normal}
              actual={preferencias.interlineado}
              onPress={onCambiar}
            />
            <OpcionInterlineado
              etiqueta="Aire"
              icono="density_large"
              valor={INTERLINEADO.aire}
              actual={preferencias.interlineado}
              onPress={onCambiar}
            />
          </View>
        </View>

        {/* Ancho */}
        <View className="mt-[18px] flex-row items-center justify-between rounded-[14px] border border-borde-verde bg-papel-crema px-3.5 py-3">
          <View>
            <Text className="font-manrope-semibold text-[12.5px] text-tinta">
              Ancho de página completo
            </Text>
            <Text className="mt-1 font-manrope-medium text-[11px] text-marron-light">
              {preferencias.anchoCompleto ? 'Ocupa toda la pantalla' : 'Márgenes de lectura cómoda'}
            </Text>
          </View>
          <Pressable
            onPress={() => onCambiar({ anchoCompleto: !preferencias.anchoCompleto })}
            className="h-[30px] w-[50px] justify-center rounded-pill px-[3px]"
            style={{ backgroundColor: preferencias.anchoCompleto ? '#35513F' : '#DDE0D2' }}
          >
            <View
              className="h-6 w-6 rounded-full bg-white"
              style={{
                transform: [{ translateX: preferencias.anchoCompleto ? 20 : 0 }],
                boxShadow: '0px 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function TarjetaFuente({
  clave,
  etiqueta,
  muestra,
  familia,
  tamano,
  actual,
  onPress,
}: {
  clave: FuenteEditor;
  etiqueta?: string;
  muestra: string;
  familia: string;
  tamano: number;
  actual: FuenteEditor;
  onPress: (parcial: Partial<PreferenciasEditor>) => void;
}) {
  const activa = actual === clave;
  return (
    <Pressable
      onPress={() => onPress({ fuente: clave })}
      className="flex-1 items-center rounded-[14px] border-[1.5px] bg-papel-card px-2 py-3"
      style={{ borderColor: activa ? borde.seleccion : borde.neutro }}
    >
      <Text style={{ fontFamily: familia, fontSize: tamano, color: '#2A2320' }}>{muestra}</Text>
      <Text className="mt-[7px] font-manrope-semibold text-[10.5px] text-marron-light">
        {etiqueta ?? clave}
      </Text>
    </Pressable>
  );
}

function OpcionInterlineado({
  etiqueta,
  icono,
  valor,
  actual,
  onPress,
}: {
  etiqueta: string;
  icono: string;
  valor: number;
  actual: number;
  onPress: (parcial: Partial<PreferenciasEditor>) => void;
}) {
  const activa = actual === valor;
  return (
    <Pressable
      onPress={() => onPress({ interlineado: valor })}
      className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-[13px] border-[1.5px] bg-papel-card"
      style={{ borderColor: activa ? borde.seleccion : borde.neutro }}
    >
      <Icon name={icono} size={18} color="#6E5241" />
      <Text className="font-manrope-semibold text-[12px] text-tinta-body">{etiqueta}</Text>
    </Pressable>
  );
}
