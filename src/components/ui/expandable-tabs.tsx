'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOnClickOutside } from 'usehooks-ts';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

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
const transition: any = { delay: 0.1, type: 'spring', bounce: 0, duration: 0.6 };

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
        'flex flex-wrap items-center gap-2 rounded-2xl border bg-[var(--background)] p-1 shadow-sm',
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
            custom={selected === index}
            onClick={() => handleSelect(index)}
            transition={transition}
            className={cn(
              'relative flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-300',
              selected === index
                ? cn('bg-gray-100 dark:bg-gray-800', activeColor)
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
            )}
          >
            <Icon size={20} />
            <AnimatePresence initial={false}>
              {selected === index && (
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
