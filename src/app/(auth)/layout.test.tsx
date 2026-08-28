import { describe, expect, test, vi } from 'vitest';
import { montar } from '@/test/render-component';

/**
 * El armazón que comparten el alta y el inicio de sesión.
 *
 * El wordmark estaba `absolute` sobre una tarjeta centrada verticalmente: en
 * cuanto el viewport bajaba de unos 700px de alto los dos se pisaban —113px de
 * solape en 360×640— y el contenedor recortaba lo que sobraba en vez de dejar
 * desplazarse a ello.
 *
 * jsdom no tiene motor de maquetación, así que esto no es una prueba de
 * maquetación —`docs/mobile-viewports.md` explica por qué no la hay— y no
 * afirma nada sobre píxeles. Fija dos cosas estructurales, que son la razón por
 * la que el solape era posible: que el wordmark esté fuera del flujo, y que la
 * raíz recorte lo que no cabe. El solape en sí está medido en el mensaje del
 * commit y se vuelve a comprobar a mano con los viewports de ese documento.
 */

vi.mock('@/components/ui/web-gl-shader', () => ({
  // El shader monta WebGL, que en jsdom no existe. No es lo que se mide aquí.
  WebGLShader: () => null,
}));

async function pintar() {
  const { default: AuthLayout } = await import('./layout');
  return montar(
    <AuthLayout>
      <div data-testid="tarjeta">tarjeta</div>
    </AuthLayout>
  );
}

function elWordmark(contenedor: HTMLElement): HTMLImageElement {
  const img = contenedor.querySelector('img');
  if (!img) throw new Error('el wordmark no está en la pantalla');
  return img;
}

/** La cadena de elementos entre `desde` y `hasta`, ambos incluidos. */
function ascendientes(desde: Element, hasta: Element): Element[] {
  const cadena: Element[] = [];
  let actual: Element | null = desde;
  while (actual && actual !== hasta.parentElement) {
    cadena.push(actual);
    actual = actual.parentElement;
  }
  return cadena;
}

describe('el armazón de alta e inicio de sesión', () => {
  test('el wordmark comparte el flujo con la tarjeta, no flota sobre ella', async () => {
    const contenedor = await pintar();
    const tarjeta = contenedor.querySelector('[data-testid="tarjeta"]')!;

    // El mismo contenedor de flujo: nada puede colocar uno encima del otro.
    const columna = elWordmark(contenedor).parentElement;
    expect(columna).not.toBeNull();
    expect(columna!.contains(tarjeta)).toBe(true);
  });

  test('nada entre el wordmark y la raíz lo saca del flujo', async () => {
    const contenedor = await pintar();

    for (const elemento of ascendientes(elWordmark(contenedor), contenedor.firstElementChild!)) {
      expect(elemento.className).not.toMatch(/(^|[\s:])(absolute|fixed)(\s|$)/);
    }
  });

  test('el fondo oscuro lo pinta la pantalla, no el shader', async () => {
    // Todo lo que va encima está dibujado para leerse sobre oscuro —el wordmark
    // en blanco, la tarjeta de Clerk con la letra blanca—, y el shader ya no se
    // monta en un teléfono (ticket 11). Si el fondo se fuera con él, el alta se
    // serviría en blanco sobre blanco.
    const contenedor = await pintar();

    expect(contenedor.firstElementChild!.className).toMatch(/(^|\s)bg-black(\s|$)/);
  });

  test('la raíz no recorta lo que no cabe', async () => {
    const contenedor = await pintar();

    // Leer la clase es lo único que hay: jsdom no aplica la hoja de estilos. Lo
    // que se persigue es la regla concreta que dejaba inalcanzable la tarjeta en
    // horizontal, no la ortografía de ninguna utilidad de Tailwind.
    expect(contenedor.firstElementChild!.className).not.toMatch(
      /(^|\s)overflow-(hidden|y-hidden|y-clip|clip)(\s|$)/
    );
  });
});
