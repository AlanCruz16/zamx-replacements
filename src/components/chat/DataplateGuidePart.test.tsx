import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { montar } from '@/test/render-component';
import { DataplateGuidePart, GUIDE_HEIGHT, GUIDE_SRC, GUIDE_WIDTH } from './DataplateGuidePart';

/**
 * El hueco de la guía existe antes que la guía (ticket 08 de «usable-on-a-phone»).
 *
 * jsdom no maqueta, así que aquí no se puede afirmar que la conversación deja
 * de pegar un salto. Lo que sí se puede es cerrar el círculo del que depende:
 * la imagen sale declarando una proporción, y esa proporción es de verdad la
 * suya. Quien manda es el fichero de `public/`; la pantalla lleva una copia
 * porque el navegador tiene que reservar el hueco sin descargarlo, y esto es lo
 * que impide que la copia se desafine en silencio.
 */

/** El alto y el ancho que el propio JPEG declara, leídos de su marcador SOF. */
function medidasDelJpeg(bytes: Buffer): { width: number; height: number } {
  // Tras el SOI vienen segmentos «0xFF marcador longitud»; el que trae las
  // medidas es cualquier SOFn, y son todos los 0xFFC0..0xFFCF menos los tres
  // que significan otra cosa (tablas Huffman, JPEG-LS y aritmético).
  for (let i = 2; i + 9 < bytes.length; ) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }

    const marcador = bytes[i + 1];
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }

    i += 2 + bytes.readUInt16BE(i + 2);
  }

  throw new Error('El JPEG no declara medidas: no se encontró su marcador SOF.');
}

describe('DataplateGuidePart', () => {
  test('las medidas que declara son las del fichero que pinta', () => {
    const fichero = readFileSync(join(process.cwd(), 'public', GUIDE_SRC));

    expect(medidasDelJpeg(fichero)).toEqual({ width: GUIDE_WIDTH, height: GUIDE_HEIGHT });
  });

  test('la imagen sale con esas medidas, que es de lo que se reserva el hueco', () => {
    const container = montar(<DataplateGuidePart language="es" />);
    const img = container.querySelector('img');

    expect(img?.getAttribute('src')).toBe(GUIDE_SRC);
    expect(img?.getAttribute('width')).toBe(String(GUIDE_WIDTH));
    expect(img?.getAttribute('height')).toBe(String(GUIDE_HEIGHT));
  });
});
