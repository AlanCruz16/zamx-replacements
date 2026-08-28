/**
 * El fondo de las pantallas de acceso (ticket 11 de «usable-on-a-phone»).
 *
 * Lo que se prueba es lo que costaba batería: que en un teléfono no llegue a
 * montarse nada, y que donde sí se monta la densidad no salga del aparato sin
 * pasar por el tope. `three` va simulado porque jsdom no tiene WebGL —montar el
 * de verdad aquí sólo probaría que jsdom no tiene WebGL—, y lo que se le
 * pregunta al simulacro es exactamente lo que el aparato pagaría: si se creó un
 * renderer, y a qué densidad.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { aparato } from '@/test/aparato';
import { montar } from '@/test/render-component';
import { MAX_PIXEL_RATIO, MOBILE_BREAKPOINT_PX } from '@/lib/decorative-motion';

const renderers: { pixelRatio: number | null }[] = [];

vi.mock('three', () => {
  class WebGLRenderer {
    private readonly registro: { pixelRatio: number | null };
    constructor() {
      this.registro = { pixelRatio: null };
      renderers.push(this.registro);
    }
    setPixelRatio(ratio: number) {
      this.registro.pixelRatio = ratio;
    }
    setClearColor() {}
    setSize() {}
    render() {}
    dispose() {}
  }
  class Scene {
    add() {}
    remove() {}
  }
  class BufferGeometry {
    setAttribute() {}
    dispose() {}
  }
  return {
    Scene,
    WebGLRenderer,
    BufferGeometry,
    OrthographicCamera: class {},
    BufferAttribute: class {},
    RawShaderMaterial: class {},
    Mesh: class {
      geometry = { dispose() {} };
      material = {};
    },
    Material: class {},
    Color: class {},
    DoubleSide: 2,
  };
});

beforeEach(() => {
  renderers.length = 0;
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function pintar() {
  const { WebGLShader } = await import('./web-gl-shader');
  return montar(<WebGLShader />);
}

describe('el shader de las pantallas de acceso', () => {
  test('en un teléfono no monta nada, ni lienzo ni renderer', async () => {
    aparato({ ancho: MOBILE_BREAKPOINT_PX - 1, densidad: 3 });

    const contenedor = await pintar();

    expect(contenedor.querySelector('canvas')).toBeNull();
    expect(renderers).toHaveLength(0);
  });

  test('quien ha pedido menos movimiento tampoco lo paga', async () => {
    aparato({ ancho: 1440, quieto: true });

    expect((await pintar()).querySelector('canvas')).toBeNull();
    expect(renderers).toHaveLength(0);
  });

  test('en un escritorio se monta', async () => {
    aparato({ ancho: 1440 });

    expect((await pintar()).querySelector('canvas')).not.toBeNull();
    expect(renderers).toHaveLength(1);
  });

  test('donde corre, la densidad va con tope y no la del aparato', async () => {
    aparato({ ancho: 1440, densidad: 3 });

    await pintar();

    expect(renderers[0].pixelRatio).toBe(MAX_PIXEL_RATIO);
  });
});
