import { cache } from 'react';
import { auth } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { notFound } from 'next/navigation';
import { api } from '../../convex/_generated/api';

/**
 * La puerta de cada pantalla del panel del Supervisor. La llaman el layout **y
 * cada página**, no sólo el layout: Next renderiza el layout y la página en
 * paralelo, así que un `notFound()` sólo en el layout devolvía el 404 con la
 * página ya renderizada dentro de la carga útil, y un Customer que adivinara la
 * ruta leía la copia del panel. `supervisor-access.test.ts` comprueba que
 * ninguna pantalla nueva se la salte.
 *
 * Quién es Supervisor lo contesta Convex, con el token de Clerk de quien llama:
 * la lista vive en un solo sitio (`SUPERVISOR_EMAILS`, en el despliegue de
 * Convex) y aquí no se vuelve a leer. Esto sólo decide qué pintar; cada
 * consulta del panel se guarda a sí misma en el servidor.
 *
 * Quien no lo es recibe el «no encontrado» de siempre, el mismo que cualquier
 * dirección inventada. Sin sesión ni siquiera se llega aquí: el middleware lo
 * manda a iniciar sesión, como en cualquier página protegida.
 *
 * `cache` hace que el layout y la página de una misma petición pregunten una
 * sola vez.
 */
export const requireSupervisorPage = cache(async (): Promise<void> => {
  const { userId, getToken, redirectToSignIn } = await auth();
  if (!userId) redirectToSignIn();

  // Sin token no hay identidad que Convex pueda comprobar: falla cerrado.
  const token = await getToken({ template: 'convex' });
  if (!token) notFound();

  const isSupervisor = await fetchQuery(api.supervisor.amISupervisor, {}, { token });
  if (!isSupervisor) notFound();
});
