import { describe, expect, test } from 'vitest';
import { montar } from '@/test/render-component';
import { AssistantMarkdown } from './AssistantMarkdown';

/**
 * Lo que Gemini escribe es Markdown, y el Customer lo lee en pantalla. Antes se
 * pintaba verbatim, así que leía los asteriscos: `**Modelo:** GR45C-ZID.GG.CR`.
 *
 * El texto del modelo es dato, nunca marcado con privilegios: el HTML crudo que
 * venga dentro no puede convertirse en elementos.
 */

describe('AssistantMarkdown', () => {
  test('el énfasis fuerte se pinta en negrita y no como asteriscos', () => {
    const container = montar(<AssistantMarkdown text="Hola **Alan**, ya casi." />);

    expect(container.querySelector('strong')?.textContent).toBe('Alan');
    expect(container.textContent).not.toContain('**');
    expect(container.textContent).toContain('Hola Alan, ya casi.');
  });

  test('el énfasis simple se pinta en cursiva', () => {
    const container = montar(<AssistantMarkdown text="Es _urgente_." />);

    expect(container.querySelector('em')?.textContent).toBe('urgente');
    expect(container.textContent).not.toContain('_');
  });

  test('una lista se pinta como lista', () => {
    const container = montar(
      <AssistantMarkdown text={'*   **Modelo:** GR45C\n*   **Parte:** 175168/A01'} />
    );

    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Modelo:');
    expect(container.textContent).not.toContain('*');
  });

  test('un encabezado se pinta como encabezado', () => {
    const container = montar(<AssistantMarkdown text="## Resumen" />);

    expect(container.querySelector('h2')?.textContent).toBe('Resumen');
    expect(container.textContent).not.toContain('#');
  });

  test('una tabla se pinta como tabla', () => {
    const container = montar(
      <AssistantMarkdown text={'| Parte | Modelo |\n| --- | --- |\n| 175168 | GR45C |'} />
    );

    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelectorAll('td')).toHaveLength(2);
  });

  // El salto de línea suelto es intención del modelo, no ruido: sin esto, dos
  // renglones de una dirección se juntan en uno.
  test('un salto de línea suelto se respeta', () => {
    const container = montar(<AssistantMarkdown text={'Primera línea\nSegunda línea'} />);

    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('br')).not.toBeNull();
  });

  // El modelo tiene que poder repetirle al Customer lo que él tecleó para que
  // lo verifique. Un número de parte o un Model al que el renderizador se coma
  // un carácter deja de ser el dato que se está confirmando.
  describe('los identificadores llegan enteros', () => {
    for (const identificador of [
      '162562',
      '162562/A01',
      '175168/A01',
      'FN050-VDK.4I.V7P1',
      'MK137-4DZ.07.U',
      'GR45C-ZID.GG.CR',
      'REQ-4B7K2Z',
    ]) {
      test(`${identificador} se lee igual`, () => {
        const container = montar(
          <AssistantMarkdown text={`Confirmo ${identificador}, ¿correcto?`} />
        );

        expect(container.textContent).toContain(identificador);
      });
    }

    test('en negritas también, sin los asteriscos', () => {
      const container = montar(<AssistantMarkdown text="**Modelo:** FN050-VDK.4I.V7P1" />);

      expect(container.textContent).toBe('Modelo: FN050-VDK.4I.V7P1');
    });
  });

  describe('el texto del modelo es dato, no marcado', () => {
    test('el HTML crudo no se convierte en elementos', () => {
      const container = montar(
        <AssistantMarkdown text={'<img src="x" onerror="alert(1)"> y <b>negritas</b>'} />
      );

      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('b')).toBeNull();
    });

    test('un <script> no llega al DOM', () => {
      const container = montar(<AssistantMarkdown text={'<script>alert(1)</script>'} />);

      expect(container.querySelector('script')).toBeNull();
    });

    test('un enlace `javascript:` no queda como enlace navegable', () => {
      const container = montar(<AssistantMarkdown text={'[pulsa](javascript:alert(1))'} />);

      const href = container.querySelector('a')?.getAttribute('href');
      expect(href ?? '').not.toMatch(/^javascript:/i);
    });
  });

  test('el texto vacío no revienta ni pinta nada', () => {
    const container = montar(<AssistantMarkdown text="" />);

    expect(container.textContent).toBe('');
  });
});
