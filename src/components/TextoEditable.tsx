import { useEffect, useRef, useState } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';

/**
 * Texto que se edita tocándolo, sin modo edición aparte (TINTA-SPEC §4.3).
 *
 * Guarda al perder el foco y con un respiro de dos segundos tras dejar de
 * teclear, igual que el editor: escribir nunca debe requerir buscar un botón de
 * guardar.
 */
export function TextoEditable({
  valor,
  onGuardar,
  placeholder,
  multilinea = false,
  style,
  className = '',
  espera = 2000,
}: {
  valor: string;
  onGuardar: (nuevo: string) => void;
  placeholder?: string;
  multilinea?: boolean;
  style?: StyleProp<TextStyle>;
  className?: string;
  espera?: number;
}) {
  const [borrador, setBorrador] = useState(valor);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoGuardado = useRef(valor);
  /**
   * Lo último tecleado y aún sin confirmar, y la versión viva de `onGuardar`.
   * La limpieza del desmontaje corre con la clausura del primer render, así
   * que ahí no se puede mirar ni `borrador` ni la prop directamente.
   */
  const pendiente = useRef(valor);
  const guardarVivo = useRef(onGuardar);
  guardarVivo.current = onGuardar;

  // Si el valor cambia por fuera (otra pantalla, una recarga), se adopta —
  // salvo que la usuaria esté escribiendo algo distinto ahora mismo.
  useEffect(() => {
    if (valor !== ultimoGuardado.current && borrador === ultimoGuardado.current) {
      setBorrador(valor);
      ultimoGuardado.current = valor;
    }
  }, [valor, borrador]);

  const programar = (texto: string) => {
    pendiente.current = texto;
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => confirmar(texto), espera);
  };

  const confirmar = (texto: string) => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
    if (texto === ultimoGuardado.current) return;
    ultimoGuardado.current = texto;
    onGuardar(texto);
  };

  // Al desmontar hay que CONFIRMAR lo pendiente, no descartarlo: si se sale de
  // la pantalla con el campo enfocado (botón atrás o gesto), Android no entrega
  // el blur antes de destruir el TextInput, y cancelar aquí tiraba lo escrito
  // —hasta dos minutos enteros en el nombre del proyecto, que usa espera larga.
  // Todas las escrituras del almacén son síncronas, así que da tiempo.
  useEffect(() => {
    return () => {
      if (!temporizador.current) return;
      clearTimeout(temporizador.current);
      temporizador.current = null;
      const texto = pendiente.current;
      if (texto === ultimoGuardado.current) return;
      ultimoGuardado.current = texto;
      guardarVivo.current(texto);
    };
  }, []);

  return (
    <TextInput
      value={borrador}
      onChangeText={(t) => {
        setBorrador(t);
        programar(t);
      }}
      onBlur={() => confirmar(borrador)}
      placeholder={placeholder}
      placeholderTextColor="#b3a597"
      multiline={multilinea}
      scrollEnabled={false}
      className={className}
      style={[{ padding: 0, margin: 0 }, style]}
    />
  );
}
