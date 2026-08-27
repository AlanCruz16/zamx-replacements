import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act } from 'react';
import { useState } from 'react';
import { montar } from '@/test/render-component';
import { LANGUAGES, messagesFor, type Language } from '@/lib/messages';
import { distinctivePhrases, otherLanguage } from '@/test/languages';
import { ChatErrorBoundary } from './ChatErrorBoundary';

/**
 * El cinturón de la pantalla de chat (ticket 02 de «usable-on-a-phone»).
 *
 * Lo que se afirma es lo que el Customer observa: que un fallo cuesta un
 * mensaje y no la pantalla, que el mensaje está en su idioma, que hay algo que
 * pulsar para reintentar, y que cuando la causa se despeja la pantalla vuelve
 * —la pulse él o no—. Nada de esto mira dentro del componente.
 */

/** El hijo que falla mientras `falla` esté puesto. Se apaga desde la prueba. */
let falla = true;

function Hijo() {
  if (falla) throw new Error('la consulta de turno se cayó');
  return <p>La pantalla de siempre</p>;
}

/** Lo que el Customer puede pulsar dentro del contenedor. */
function boton(container: HTMLElement, texto: string): HTMLButtonElement {
  const encontrado = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(texto)
  );
  if (!encontrado) throw new Error(`No hay ningún botón que diga «${texto}»`);
  return encontrado;
}

function pulsar(elemento: HTMLElement) {
  act(() => {
    elemento.click();
  });
}

beforeEach(() => {
  falla = true;
  // React escribe por consola cada error que una frontera recoge. Aquí es lo
  // esperado, así que no ensucia la salida de la suite.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('la frontera de error de la pantalla de chat', () => {
  test('deja pasar al hijo que no falla', () => {
    falla = false;
    const container = montar(
      <ChatErrorBoundary language="es">
        <Hijo />
      </ChatErrorBoundary>
    );

    expect(container.textContent).toContain('La pantalla de siempre');
    expect(container.textContent).not.toContain(messagesFor('es').chat.errorTitle);
  });

  test.each(LANGUAGES)(
    'un hijo que falla deja un mensaje en %s, no la pantalla en blanco',
    (language: Language) => {
      const t = messagesFor(language).chat;
      const container = montar(
        <ChatErrorBoundary language={language}>
          <Hijo />
        </ChatErrorBoundary>
      );

      expect(container.textContent).toContain(t.errorTitle);
      expect(container.textContent).toContain(t.errorBody);
      expect(boton(container, t.errorRetry)).toBeDefined();
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
    }
  );

  test.each(LANGUAGES)('el mensaje en %s no trae frases del otro idioma', (language: Language) => {
    const otro = otherLanguage(language);
    const container = montar(
      <ChatErrorBoundary language={language}>
        <Hijo />
      </ChatErrorBoundary>
    );

    for (const phrase of distinctivePhrases('chat', otro)) {
      expect(container.textContent).not.toContain(phrase);
    }
  });

  test('reintentar devuelve la pantalla cuando la causa ya se despejó', () => {
    const t = messagesFor('es').chat;
    const container = montar(
      <ChatErrorBoundary language="es">
        <Hijo />
      </ChatErrorBoundary>
    );

    falla = false;
    pulsar(boton(container, t.errorRetry));

    expect(container.textContent).toContain('La pantalla de siempre');
    expect(container.textContent).not.toContain(t.errorTitle);
  });

  test('reintentar con la causa todavía puesta vuelve a dejar el mensaje', () => {
    const t = messagesFor('es').chat;
    const container = montar(
      <ChatErrorBoundary language="es">
        <Hijo />
      </ChatErrorBoundary>
    );

    pulsar(boton(container, t.errorRetry));

    expect(container.textContent).toContain(t.errorTitle);
  });

  /**
   * Reintentar no puede ser repintar: si el hijo conservara su estado, un fallo
   * que dependa de él —una suscripción que no se rehace— volvería a darse
   * exactamente igual y el botón sería decorativo.
   */
  test('reintentar vuelve a montar al hijo desde cero', () => {
    const montajes: string[] = [];

    function HijoQueCuenta() {
      montajes.push('montado');
      if (falla) throw new Error('la consulta de turno se cayó');
      return <p>La pantalla de siempre</p>;
    }

    const container = montar(
      <ChatErrorBoundary language="es">
        <HijoQueCuenta />
      </ChatErrorBoundary>
    );

    const antes = montajes.length;
    falla = false;
    pulsar(boton(container, messagesFor('es').chat.errorRetry));

    expect(montajes.length).toBeGreaterThan(antes);
    expect(container.textContent).toContain('La pantalla de siempre');
  });

  /**
   * El caso del teléfono: el fallo ocurrió durante el handshake y las
   * credenciales llegan un instante después. El Customer no tiene por qué saber
   * que reintentar ayudaría, así que la pantalla vuelve sola en cuanto lo que
   * la frontera vigila cambia.
   */
  test('la pantalla vuelve sola cuando cambia lo que la frontera vigila', () => {
    function Pantalla() {
      const [autenticado, setAutenticado] = useState(false);
      return (
        <>
          <button
            onClick={() => {
              falla = false;
              setAutenticado(true);
            }}
          >
            llegan las credenciales
          </button>
          <ChatErrorBoundary language="es" resetKeys={[autenticado]}>
            <Hijo />
          </ChatErrorBoundary>
        </>
      );
    }

    const container = montar(<Pantalla />);
    expect(container.textContent).toContain(messagesFor('es').chat.errorTitle);

    pulsar(boton(container, 'llegan las credenciales'));

    expect(container.textContent).toContain('La pantalla de siempre');
    expect(container.textContent).not.toContain(messagesFor('es').chat.errorTitle);
  });
});
