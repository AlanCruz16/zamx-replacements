'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOnClickOutside } from 'usehooks-ts';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { TOUCH_TARGET } from '@/lib/touch-target';
import { usePrefersReducedMotion } from '@/lib/decorative-motion';

interface Tab {
  title: string;
  icon: LucideIcon;
  type?: never;
}

interface Separator {
  type: 'separator';
  title?: never;
  icon?: never;
}

export type TabItem = Tab | Separator;

interface ExpandableTabsProps {
  tabs: TabItem[];
  className?: string;
  activeColor?: string;
  onChange?: (index: number | null) => void;
}

const buttonVariants = {
  initial: {
    gap: 0,
    paddingLeft: '.5rem',
    paddingRight: '.5rem',
  },
  animate: (isSelected: boolean) => ({
    gap: isSelected ? '.5rem' : 0,
    paddingLeft: isSelected ? '1rem' : '.5rem',
    paddingRight: isSelected ? '1rem' : '.5rem',
  }),
};

const spanVariants = {
  initial: { width: 0, opacity: 0 },
  animate: { width: 'auto', opacity: 1 },
  exit: { width: 0, opacity: 0 },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SPRING: any = { delay: 0.1, type: 'spring', bounce: 0, duration: 0.6 };

/**
 * Cómo llega la etiqueta a su sitio: con muelle, o ya puesta (ticket 11 de
 * «usable-on-a-phone»).
 *
 * Este despliegue lo anima Framer Motion, es decir JavaScript escribiendo
 * estilos en línea, así que el `@media (prefers-reduced-motion)` de
 * `globals.css` no lo alcanza —apaga animaciones y transiciones del CSS, y aquí
 * no hay ninguna—. Y la opción `reducedMotion` de Framer tampoco vale: sólo
 * desactiva animaciones de transformación y de maquetación, y lo que se mueve
 * aquí es ancho, opacidad y relleno.
 *
 * Duración cero, y no quitar la animación: los estados de `AnimatePresence` se
 * siguen recorriendo, así que la etiqueta aparece y desaparece igual que antes.
 * Lo único que se quita es el camino entre los dos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INSTANT: any = { duration: 0 };

/**
 * Si la pantalla admite que la etiqueta de la pestaña elegida se despliegue.
 * Con ratón y sitio de sobra sí —ahí funciona y está bien—; con el dedo no,
 * porque desplegarla hacía crecer el control de 46px a 90px dentro de una
 * cabecera de 64px: se partía en dos filas, los iconos quedaban recortados por
 * arriba y la etiqueta se derramaba sobre la página. Pasaba en cada pulsación.
 *
 * El ancho entra en la condición junto al puntero porque una ventana estrecha
 * es estrecha con ratón también: medido en las cuatro pantallas objetivo, con
 * las etiquetas desplegadas la cabecera desbordaba hasta 449px de ancho —la
 * pestaña de la lista de Replacement Requests es la que más ocupa—. `flex-nowrap`
 * impide que el control se parta en dos filas, pero lo que sobra tiene que ir a
 * alguna parte; lo que arregla el desbordamiento es no desplegar la etiqueta.
 *
 * El corte es `40rem`, el `sm` de Tailwind. `DottedSurface` corta en 768px para
 * decidir otra cosa —si monta o no una escena de WebGL—, y no hay motivo para
 * que las dos preguntas compartan número: aquí el umbral es dónde deja de caber
 * este control, medido, y allí es a partir de dónde compensa el coste.
 *
 * Empieza en `false` a propósito. El servidor no sabe con qué se le va a tocar,
 * y de las dos respuestas posibles la que no despliega nada es la que cabe en
 * las dos pantallas: un teléfono pinta lo correcto desde el primer fotograma y
 * un escritorio gana la etiqueta al montar.
 */
function useExpandableLabels(): boolean {
  const [showLabels, setShowLabels] = React.useState(false);

  React.useEffect(() => {
    // Donde no haya `matchMedia` —jsdom no lo trae— la respuesta prudente ya
    // está puesta y no hay nada a lo que suscribirse.
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 40rem)');
    const read = () => setShowLabels(query.matches);
    read();

    // Safari trajo `addEventListener` en `MediaQueryList` en la 14; en un iPhone
    // con iOS 13 sólo está `addListener`. Suscribirse a ciegas lanzaba un
    // TypeError durante el commit, y como esta barra se monta dentro del chat, el
    // ChatErrorBoundary se tragaba la pantalla entera en cada carga. La respuesta
    // prudente ya está puesta: donde no se pueda escuchar, no se escucha.
    if (typeof query.addEventListener !== 'function') return;

    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);

  return showLabels;
}

/**
 * Este componente vino de fuera pintado con los tokens de shadcn/ui —«primary»,
 * «border», «muted», «background», «foreground»— que este proyecto no define.
 * No fallaban: no pintaban. Los separadores eran invisibles y la pestaña
 * seleccionada no tenía fondo. Ahora usa el azul de marca y la paleta de grises
 * de Tailwind, que sí existen, y `@/lib/undefined-colour-tokens` rompe la suite
 * si los otros vuelven.
 */
export function ExpandableTabs({
  tabs,
  className,
  activeColor = 'text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)]',
  onChange,
}: ExpandableTabsProps) {
  const [selected, setSelected] = React.useState<number | null>(null);
  const showLabels = useExpandableLabels();
  const transition = usePrefersReducedMotion() ? INSTANT : SPRING;
  const outsideClickRef = React.useRef<HTMLDivElement>(null!);

  useOnClickOutside(outsideClickRef, () => {
    setSelected(null);
    onChange?.(null);
  });

  // Una pulsación, una acción. `selected` solo decide el resaltado y qué título
  // se despliega; encadenarlo al aviso obligaba a pulsar dos veces, y una
  // pestaña que se llama `ES / en` tiene que cambiar el idioma a la primera.
  // El `null` sigue existiendo, pero solo lo emite el clic fuera de aquí abajo,
  // que es deselección y no acción.
  const handleSelect = (index: number) => {
    setSelected(index);
    onChange?.(index);
  };

  const Separator = () => (
    <div className="mx-1 h-[24px] w-[1.2px] bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
  );

  return (
    <div
      ref={outsideClickRef}
      className={cn(
        // `flex-nowrap` no es decoración: es lo que impide que el control se
        // parta en dos filas dentro de la cabecera. Aunque mañana alguien
        // cambie el tamaño de las pestañas, el fallo no puede volver por ahí.
        //
        // El `gap-2` tampoco: una pestaña se dibuja a 36px y se pulsa a 44px
        // (ticket 10), así que su área se sale 4px por cada lado. Ocho de hueco
        // es exactamente lo que hace falta para que dos pestañas contiguas se
        // toquen sin solaparse; con menos, un pulgar en el borde pulsaría la de
        // al lado. En la barra van además con separador de por medio, pero eso
        // lo decide quien pone las pestañas y aquí no se puede dar por hecho.
        'flex flex-nowrap items-center gap-2 rounded-2xl border bg-[var(--background)] p-1 shadow-sm',
        className
      )}
    >
      {tabs.map((tab, index) => {
        if (tab.type === 'separator') {
          return <Separator key={`separator-${index}`} />;
        }

        const Icon = tab.icon;
        return (
          <motion.button
            key={tab.title}
            variants={buttonVariants}
            initial={false}
            animate="animate"
            custom={showLabels && selected === index}
            onClick={() => handleSelect(index)}
            transition={transition}
            // El nombre va siempre, se vea la etiqueta o no: sin él, en una
            // pantalla táctil la pestaña no es más que un dibujo sin nombre
            // para quien no puede verlo.
            aria-label={tab.title}
            className={cn(
              'relative flex shrink-0 items-center rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-300',
              // Una pestaña se dibuja a 36×36 y se pulsa a 44×44. El resaltado
              // es el que era —crecerlo cambiaría el dibujo de la cabecera—; lo
              // que crece es el área. Es el control que más se toca de la app.
              TOUCH_TARGET,
              selected === index
                ? cn('bg-gray-100 dark:bg-gray-800', activeColor)
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
            )}
          >
            <Icon size={20} />
            <AnimatePresence initial={false}>
              {showLabels && selected === index && (
                <motion.span
                  variants={spanVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {tab.title}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
