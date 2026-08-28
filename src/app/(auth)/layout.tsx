import React from 'react';
import Image from 'next/image';
import { WebGLShader } from '@/components/ui/web-gl-shader';

/**
 * El armazón del alta y del inicio de sesión.
 *
 * El wordmark va en el mismo flujo vertical que la tarjeta —no `absolute` sobre
 * ella— porque así ninguna combinación de ancho y alto puede ponerlos uno
 * encima del otro. La columna se centra con `my-auto` en vez de con
 * `justify-center`: centrar así deja alcanzable lo que sobresale por arriba
 * cuando el contenido no cabe, que es el caso del horizontal.
 *
 * La raíz no recorta en ningún eje. El `overflow-hidden` que había existía por
 * el canvas del shader, que es `fixed` y nunca desborda; lo que sí desborda es
 * la tarjeta, y la de Clerk trae su propio ancho mínimo. Recortarla la dejaría
 * inalcanzable, que es peor que dejar desplazar de lado.
 *
 * El fondo negro es de la pantalla y no del shader (ticket 11 de
 * «usable-on-a-phone»). Antes lo pintaba el shader —opaco, negro, a pantalla
 * completa— y todo lo de encima da por hecho que ahí abajo hay oscuro: el
 * wordmark va en blanco (`brightness-0 invert`) y la tarjeta de Clerk lleva la
 * letra blanca. Desde que el shader no se monta en un teléfono, dejarle el
 * fondo a él era servir un alta en blanco sobre blanco a todo el que entre
 * desde uno. Lo pinta la pantalla, siempre, y el shader queda como lo que es:
 * adorno que se le pone encima a un fondo que ya está.
 *
 * De ahí que el canvas esté en `z-0` y no por detrás de todo: el fondo de la
 * raíz taparía un `-z-10`. Queda entre el fondo y el contenido, que va en
 * `z-10`.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[100dvh] w-full overflow-auto bg-black">
      <WebGLShader />

      <div className="relative z-10 flex min-h-full w-full flex-col pt-[calc(2rem+var(--safe-top))] pr-[calc(1rem+var(--safe-right))] pb-[calc(2rem+var(--safe-bottom))] pl-[calc(1rem+var(--safe-left))]">
        <div className="my-auto flex w-full flex-col items-center gap-6 sm:gap-8">
          <Image
            src="/logo_final.svg"
            alt="Ziehl-Abegg Mexico Logo"
            width={320}
            height={80}
            priority
            className="h-auto w-3/5 max-w-[320px] brightness-0 invert"
          />

          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
