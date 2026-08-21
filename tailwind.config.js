/** @type {import('tailwindcss').Config} */
// Paleta y tipografía de Tinta — valores exactos del prototipo (TINTA-SPEC §3).
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Acción y significado
        vino: { DEFAULT: '#7B2D3B', dark: '#5E1F2B', deep: '#4d1b25' },
        verde: { DEFAULT: '#35513F', text: '#2b4234', soft: '#3f5c48' },
        marron: { DEFAULT: '#6E5241', light: '#8B7D72' },

        // Superficies (papel)
        papel: {
          DEFAULT: '#FBF7F1', // fondo de pantalla
          card: '#FFFFFF',
          soft: '#FDFBF7',
          warm: '#F1E9DE',
          crema: '#F2F0E6', // verde-crema
          tint: '#F7F1E8',
          deep: '#F5EFE6',
          sepia: '#F7F3EC', // tarjeta trasfondo
        },

        // Bordes y separadores
        borde: {
          DEFAULT: '#EDE4D8',
          strong: '#E4D9CC',
          soft: '#F3EBE0',
          dashed: '#DCCFBF',
          verde: '#E1E3D5',
          sepia: '#E9E0D1',
        },

        // Tinta (texto)
        tinta: {
          DEFAULT: '#2A2320', // titular
          body: '#3f352f', // cuerpo literario
          muted: '#9b8a7c', // metadatos
          disabled: '#b3a597', // placeholder
          faint: '#c0b2a3',
          ghost: '#d4c8ba',
        },

        // Pistas, raíles y rellenos
        rail: {
          DEFAULT: '#EFE7DB', // barra de progreso vacía
          verde: '#DDE0D2', // anillo/track verde
          divider: '#E7DED2',
          avatar: '#E7DFD2',
          handle: '#E0D6C8', // asa del bottom sheet
        },

        // Estados de capítulo (§3.1)
        estado: {
          listo: '#35513F',
          revisado: '#6E5241',
          borrador: '#D8C9B6',
          escribiendo: '#7B2D3B',
        },
      },

      // Cada peso es una familia propia: RN no sintetiza pesos en Android.
      fontFamily: {
        lora: ['Lora_400Regular'],
        'lora-medium': ['Lora_500Medium'],
        'lora-semibold': ['Lora_600SemiBold'],
        'lora-italic': ['Lora_400Regular_Italic'],
        manrope: ['Manrope_400Regular'],
        'manrope-medium': ['Manrope_500Medium'],
        'manrope-semibold': ['Manrope_600SemiBold'],
        'manrope-bold': ['Manrope_700Bold'],
        maquina: ['CourierPrime_400Regular'],
        symbols: ['MaterialSymbolsRounded_400Regular'],
      },

      borderRadius: {
        sheet: 26, // bottom sheets
        pill: 99,
      },

      letterSpacing: {
        label: '1.6px', // .14em sobre 11.5px — labels de sección
        micro: '1.5px', // .16em sobre 9.5px
      },
    },
  },
  plugins: [],
};
