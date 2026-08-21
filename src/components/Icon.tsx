import { Text, type StyleProp, type TextStyle } from 'react-native';

/**
 * Material Symbols Rounded por ligadura: el nombre del icono se escribe como
 * texto y la fuente lo convierte en glifo. Tamaños del prototipo: 15 (barra de
 * estado), 20 (dentro de componentes), 24 (navegación/toolbar).
 */
export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      allowFontScaling={false}
      style={[
        {
          fontFamily: 'MaterialSymbolsRounded_400Regular',
          fontSize: size,
          lineHeight: size,
          color,
        },
        style,
      ]}
    >
      {name}
    </Text>
  );
}
