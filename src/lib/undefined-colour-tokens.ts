/**
 * Los tokens de color que este proyecto **no** define.
 *
 * `ExpandableTabs` y `GooeyTextMorphing` se copiaron de una biblioteca externa
 * que da por hecho el sistema de diseño de shadcn/ui: `--color-border`,
 * `--color-muted`, `--color-background` y compañía. Este repo nunca lo adoptó;
 * su `@theme` (ver `src/app/globals.css`) define tres colores de marca y nada
 * más, así que esas clases no generan ninguna regla.
 *
 * Ojo con dos de la lista: `background` y `foreground` **sí** existen en
 * `globals.css`, pero como variables sueltas en `:root`, no dentro de `@theme`.
 * Tailwind sólo genera utilidades desde `@theme`, así que la variable pinta
 * —de ahí `bg-[var(--background)]`— y la utilidad con su nombre no. Si algún
 * día se mudan a `@theme`, hay que sacarlas de esta lista.
 *
 * El fallo es mudo: no hay error de compilación ni aviso de Tailwind, la clase
 * simplemente no pinta. Los separadores de la barra de navegación llevaban
 * meses invisibles y la pestaña seleccionada no tenía fondo, sin que nada lo
 * dijera.
 *
 * Por eso esto es una lista y no un comentario: `undefined-colour-tokens.test.ts`
 * recorre el código y rompe la suite si alguno reaparece, que es lo que pasará
 * la próxima vez que se pegue aquí un componente de la misma fuente.
 *
 * La búsqueda es textual y no distingue código de prosa: un comentario que
 * escriba una de estas clases entera también rompe la suite. Es a propósito
 * —una clase citada de pasada acaba copiada— así que en los comentarios se
 * nombra el token pelado, «muted», y no la clase.
 */

/**
 * Los nombres de color que shadcn/ui define y este proyecto no. Se escriben
 * pelados —sin el prefijo de utilidad— para que esta misma lista no se dispare
 * a sí misma cuando la comprobación recorre el código.
 */
const UNDEFINED_COLOUR_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
] as const;

/**
 * Las utilidades de Tailwind que aceptan un color. Un token sólo es un color
 * cuando va detrás de una de éstas: `border-b` o `ring-2` no nombran ningún
 * color, y `bg-border` sí.
 */
const COLOUR_UTILITIES = [
  'bg',
  'text',
  'border',
  'divide',
  'ring',
  'outline',
  'fill',
  'stroke',
  'shadow',
  'accent',
  'caret',
  'decoration',
  'placeholder',
  'from',
  'via',
  'to',
];

/** Un uso concreto de un token indefinido, con lo que hace falta para ir a arreglarlo. */
export type UndefinedColourToken = {
  /** El nombre del color, sin la utilidad: `muted-foreground`. */
  token: string;
  /**
   * La utilidad con su color, sin la variante que la preceda: de
   * `hover:text-muted-foreground` guarda `text-muted-foreground`. Es lo que hay
   * que buscar para arreglarlo.
   */
  utility: string;
  /** Línea dentro del fichero, en base 1. */
  line: number;
};

/**
 * Los tokens más largos primero: sin eso `bg-muted-foreground` se leería como
 * `bg-muted` seguido de basura, y el informe nombraría el token equivocado.
 */
const TOKENS_LONGEST_FIRST = [...UNDEFINED_COLOUR_TOKENS].sort((a, b) => b.length - a.length);

const UNDEFINED_COLOUR_CLASS = new RegExp(
  // Ni letra ni guion por delante, para no partir `bg-my-primary` por la mitad;
  // ni por detrás, para que `bg-primary` no case dentro de `bg-primary-foreground`.
  String.raw`(?<![\w-])((?:${COLOUR_UTILITIES.join('|')})-(?:${TOKENS_LONGEST_FIRST.join('|')}))(?![\w-])`,
  'g'
);

/** Cada token indefinido que aparece en un fichero fuente, en orden de lectura. */
export function findUndefinedColourTokens(source: string): UndefinedColourToken[] {
  const found: UndefinedColourToken[] = [];

  source.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(UNDEFINED_COLOUR_CLASS)) {
      const utility = match[1];
      found.push({
        token: utility.slice(utility.indexOf('-') + 1),
        utility,
        line: index + 1,
      });
    }
  });

  return found;
}
