import {
  BoldBridge,
  CoreBridge,
  HardBreakBridge,
  HeadingBridge,
  HistoryBridge,
  ItalicBridge,
  PlaceholderBridge,
  UnderlineBridge,
} from '@10play/tentap-editor';

import { SEPARADOR_ESCENA } from '@/lib/markdown';

/**
 * Esquema deliberadamente pequeño (TINTA-SPEC §6.1): párrafo, título, negrita,
 * cursiva, subrayado y separador de escena. Nada de listas, tablas, enlaces ni
 * imágenes.
 *
 * No es una limitación caprichosa: cada nodo que se admite aquí es un nodo que
 * el conversor a Markdown tiene que saber guardar y recuperar sin pérdida. Con
 * seis, el ida y vuelta es demostrable; con veinte, deja de serlo.
 */

/** Alineación del editor completo — preferencia de lectura, no se guarda. */
export type Alineacion = 'left' | 'center' | 'justify';

/** Opciones de la hoja «Aa». */
export type FuenteEditor = 'Lora' | 'Manrope' | 'Maquina';

export const FAMILIAS: Record<FuenteEditor, string> = {
  Lora: "Lora, Georgia, 'Times New Roman', serif",
  Manrope: 'Manrope, system-ui, sans-serif',
  Maquina: "'Courier Prime', ui-monospace, monospace",
};

export const ETIQUETA_FUENTE: Record<FuenteEditor, string> = {
  Lora: 'Lora — serif literaria',
  Manrope: 'Manrope — sans limpia',
  Maquina: 'Courier — máquina de escribir',
};

export const INTERLINEADO = { justo: 1.45, normal: 1.75, aire: 2.1 } as const;

export const TAMANO_MIN = 14;
export const TAMANO_MAX = 26;

export type PreferenciasEditor = {
  fuente: FuenteEditor;
  tamano: number;
  interlineado: number;
  anchoCompleto: boolean;
  alineacion: Alineacion;
};

export const PREFERENCIAS_POR_DEFECTO: PreferenciasEditor = {
  fuente: 'Lora',
  tamano: 18,
  interlineado: INTERLINEADO.normal,
  anchoCompleto: false,
  alineacion: 'left',
};

/**
 * CSS base del lienzo. Réplica del prototipo: Lora 18/1.75 sobre papel, con los
 * márgenes de lectura y el título de capítulo en Manrope versalita.
 */
const CSS_BASE = `
  .ProseMirror {
    background: #FBF7F1;
    color: #2A2320;
    caret-color: #7B2D3B;
    padding: 22px 34px 28px;
    -webkit-tap-highlight-color: transparent;
  }
  .ProseMirror p {
    margin: 0 0 1.15em;
    text-wrap: pretty;
  }
  .ProseMirror h3 {
    font-family: Manrope, system-ui, sans-serif;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.3;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: #9b8a7c;
    margin: 0 0 18px;
  }
  .ProseMirror strong { font-weight: 600; }
  .ProseMirror ::selection { background: rgba(123, 45, 59, .18); }
  .ProseMirror p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    color: #b3a597;
    float: left;
    height: 0;
    pointer-events: none;
  }
  .ProseMirror p.tinta-escena {
    text-align: center;
    color: #c0b2a3;
    letter-spacing: .5em;
    margin: 28px 0;
  }
`;

/**
 * Insertar el separador de escena.
 *
 * tentap no admite bridges propios con su editor preempaquetado (los
 * manejadores del lado web solo existen para los bridges de serie), así que
 * se usa `document.execCommand`, que dispara `beforeinput` — y eso ProseMirror
 * sí lo procesa: el texto entra como párrafos normales por el flujo estándar.
 */
export const JS_INSERTAR_ESCENA = `(function () {
  document.execCommand('insertParagraph');
  // Sin quitar las marcas activas el separador entraría en negrita o cursiva si
  // el cursor venía de un texto marcado, y entonces deja de reconocerse como
  // separador: ni se centra en el editor ni en el PDF.
  document.execCommand('removeFormat');
  document.execCommand('insertText', false, '${SEPARADOR_ESCENA}');
  document.execCommand('insertParagraph');
})(); true;`;

/**
 * Centrar los `✦ ✦ ✦` dentro del editor.
 *
 * El primer intento **añadía una clase** a los párrafos separadores y colgaba
 * el webview entero: ProseMirror vigila su propio DOM, revierte lo que toca
 * alguien de fuera, nuestro observador lo volvía a marcar, y el bucle se comía
 * el hilo. Regla aprendida: **el DOM de ProseMirror no se toca.**
 *
 * Aquí el observador solo *lee*. Localiza en qué posiciones está el separador
 * y escribe una regla `:nth-child(...)` en una hoja de estilo del `<head>`,
 * fuera del editor. ProseMirror no se entera de nada porque su DOM no cambia,
 * y el estilo se aplica igual.
 */
export const JS_CENTRAR_ESCENAS = `(function () {
  if (window.__tintaEscenas) return;
  window.__tintaEscenas = true;

  var SEP = '${SEPARADOR_ESCENA}';
  var hoja = document.createElement('style');
  hoja.setAttribute('data-tag', 'tinta-escenas');
  document.head.appendChild(hoja);

  var ultimo = '';
  var pendiente = false;

  function recalcular() {
    pendiente = false;
    var pm = document.querySelector('.ProseMirror');
    if (!pm) return;

    var selectores = [];
    for (var i = 0; i < pm.children.length; i++) {
      var hijo = pm.children[i];
      // El descarte va antes de tocar el texto: esto corre una vez por frame
      // mientras ella escribe, y materializar el textContent de cada párrafo
      // del capítulo es trabajo O(texto) en el hilo que atiende el teclado. Un
      // separador es siempre un único nodo de texto corto, así que ningún caso
      // real se escapa por este filtro.
      var nodo = hijo.firstChild;
      if (
        hijo.tagName !== 'P' ||
        !nodo ||
        nodo !== hijo.lastChild ||
        nodo.nodeType !== 3 ||
        nodo.data.length > 16
      ) {
        continue;
      }
      if (nodo.data.trim() === SEP) {
        selectores.push('.ProseMirror > :nth-child(' + (i + 1) + ')');
      }
    }

    var css = selectores.length
      ? selectores.join(',') + '{text-align:center;color:#c0b2a3;letter-spacing:.5em;margin:28px 0;}'
      : '';

    // Reescribir la hoja en cada tecla sería tirar trabajo a la basura.
    if (css !== ultimo) {
      ultimo = css;
      hoja.textContent = css;
    }
  }

  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(recalcular);
  }

  new MutationObserver(programar).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  recalcular();
})(); true;`;

/** CSS que depende de las preferencias — se reinyecta al cambiarlas. */
export function cssPreferencias(p: PreferenciasEditor): string {
  const margen = p.anchoCompleto ? 14 : 34;
  return `
    .ProseMirror {
      font-family: ${FAMILIAS[p.fuente]};
      font-size: ${p.tamano}px;
      line-height: ${p.interlineado};
      text-align: ${p.alineacion};
      padding-left: ${margen}px;
      padding-right: ${margen}px;
    }
  `;
}

export const BRIDGES = [
  CoreBridge.configureCSS(CSS_BASE),
  BoldBridge,
  ItalicBridge,
  UnderlineBridge,
  // Solo nivel 3, que es el único título que el conversor a Markdown sabe
  // guardar. Sin limitarlo, teclear «# » o pegar texto de otra app creaba un h1
  // o un h2 que el editor mostraba pero que se perdía al guardar.
  HeadingBridge.configureExtension({ levels: [3] }),
  HistoryBridge,
  // Salto de línea dentro del párrafo: el verso de un poema. En prosa no
  // estorba, pero el botón solo se enseña en poemarios.
  HardBreakBridge,
  PlaceholderBridge.configureExtension({ placeholder: 'Escribe aquí la primera frase…' }),
];
