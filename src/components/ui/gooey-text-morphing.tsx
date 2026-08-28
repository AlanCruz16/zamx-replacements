'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/decorative-motion';

interface GooeyTextProps {
  texts: string[];
  morphTime?: number;
  cooldownTime?: number;
  className?: string;
  textClassName?: string;
}

export function GooeyText({
  texts,
  morphTime = 1,
  cooldownTime = 0.25,
  className,
  textClassName,
}: GooeyTextProps) {
  const reducedMotion = usePrefersReducedMotion();
  const text1Ref = React.useRef<HTMLSpanElement>(null);
  const text2Ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (reducedMotion) return;

    let textIndex = texts.length - 1;
    let time = new Date();
    let morph = 0;
    let cooldown = cooldownTime;

    const setMorph = (fraction: number) => {
      if (text1Ref.current && text2Ref.current) {
        text2Ref.current.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
        text2Ref.current.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;

        fraction = 1 - fraction;
        text1Ref.current.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
        text1Ref.current.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;
      }
    };

    const doCooldown = () => {
      morph = 0;
      if (text1Ref.current && text2Ref.current) {
        text2Ref.current.style.filter = '';
        text2Ref.current.style.opacity = '100%';
        text1Ref.current.style.filter = '';
        text1Ref.current.style.opacity = '0%';
      }
    };

    const doMorph = () => {
      morph -= cooldown;
      cooldown = 0;
      let fraction = morph / morphTime;

      if (fraction > 1) {
        cooldown = cooldownTime;
        fraction = 1;
      }

      setMorph(fraction);
    };

    let animationFrameId: number;

    function animate() {
      animationFrameId = requestAnimationFrame(animate);
      const newTime = new Date();
      const shouldIncrementIndex = cooldown > 0;
      let dt = (newTime.getTime() - time.getTime()) / 1000;
      time = newTime;

      // Cap dt to prevent erratic behavior when switching tabs
      if (dt > 0.1) dt = 0.016;

      cooldown -= dt;

      if (cooldown <= 0) {
        if (shouldIncrementIndex) {
          textIndex = (textIndex + 1) % texts.length;
          if (text1Ref.current && text2Ref.current) {
            text1Ref.current.textContent = texts[textIndex % texts.length];
            text2Ref.current.textContent = texts[(textIndex + 1) % texts.length];
          }
        }
        doMorph();
      } else {
        doCooldown();
      }
    }

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [texts, morphTime, cooldownTime, reducedMotion]);

  /*
    Quieto no es «lo mismo sin animar» (ticket 11 de «usable-on-a-phone»).

    Lo que se ve aquí lo escribe la propia animación: los dos `span` nacen
    vacíos y es el bucle quien les pone texto, opacidad y desenfoque. Cortar el
    bucle y dejar este JSX no dejaría una palabra quieta, dejaría dos palabras
    vacías. Y el filtro `threshold` sólo es legible sobre el desenfoque para el
    que está calculado: aplicado a un texto nítido lo recorta.

    Así que la versión quieta es otra: una palabra —la primera de la lista, que
    es la que se lee de todas formas al llegar— en el flujo y sin filtro. Misma
    letra y mismo color; lo que falta es el camino entre una y la siguiente.
  */
  if (reducedMotion) {
    return (
      <div className={cn('relative', className)}>
        <div className="w-full h-full flex items-center justify-center">
          <span
            className={cn(
              'inline-block select-none text-center whitespace-nowrap text-6xl md:text-[60pt]',
              'text-[var(--foreground)]',
              textClassName
            )}
          >
            {texts[0]}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <svg className="absolute h-0 w-0" aria-hidden="true" focusable="false">
        <defs>
          <filter id="threshold" x="-20%" y="-20%" width="140%" height="140%">
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 255 -140"
            />
          </filter>
        </defs>
      </svg>

      <div
        className="w-full h-full flex items-center justify-center"
        style={{ filter: 'url(#threshold)' }}
      >
        <span
          ref={text1Ref}
          className={cn(
            'absolute inline-block select-none text-center whitespace-nowrap text-6xl md:text-[60pt]',
            'text-[var(--foreground)]',
            textClassName
          )}
        />
        <span
          ref={text2Ref}
          className={cn(
            'absolute inline-block select-none text-center whitespace-nowrap text-6xl md:text-[60pt]',
            'text-[var(--foreground)]',
            textClassName
          )}
        />
      </div>
    </div>
  );
}
