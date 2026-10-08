'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Una fila de tabla que entera abre `href`.
 *
 * No usa un enlace con `::after` absoluto que cubra la fila: Safari no hace de
 * un `<tr>` con `position: relative` su bloque contenedor, y el pseudoelemento
 * se escapaba a cubrir la página entera, tapando los controles de encima. El
 * enlace de la fila sigue ahí para el teclado y para abrir en otra pestaña; los
 * clics sobre él o sobre otro botón de la fila hacen lo suyo.
 */
export function LinkRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  return (
    <tr
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a, button')) return;
        // Seleccionar texto de la fila no es pedir que se abra.
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
      className="block md:table-row cursor-pointer rounded-lg border md:border-0 md:border-b border-gray-200 dark:border-gray-800 p-3 md:p-0 hover:bg-gray-50 dark:hover:bg-gray-900/50"
    >
      {children}
    </tr>
  );
}
