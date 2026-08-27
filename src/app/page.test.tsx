import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { montar } from '@/test/render-component';
import { LANGUAGES, messagesFor, type Language } from '@/lib/messages';
import { distinctivePhrases, otherLanguage } from '@/test/languages';
import { getFunctionName } from 'convex/server';

/**
 * La pantalla de chat, en los dos idiomas.
 *
 * Es la superficie que ya honraba el idioma —en las respuestas del modelo— y la
 * que peor lo dejaba en evidencia: el Customer recibía contestaciones en inglés
 * rodeadas de una bienvenida, unos atajos y un campo de texto en español.
 *
 * Lo que se sustituye es sólo lo que no se puede montar en jsdom o ya tiene su
 * propia prueba: la superficie de three.js del fondo, la barra de navegación
 * (`Navbar.test.tsx`) y el transporte del AI SDK. La copia de la pantalla se
 * pinta de verdad.
 */

const { useQuery, useChat, push } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useChat: vi.fn(),
  push: vi.fn(),
}));

vi.mock('convex/react', () => ({ useQuery }));
vi.mock('@ai-sdk/react', () => ({ useChat }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/layout/Navbar', () => ({ default: () => null }));
vi.mock('@/components/ui/dotted-surface', () => ({ DottedSurface: () => null }));
// `GooeyText` sólo pinta una palabra a la vez, y la primera la pone un
// temporizador. Sustituirlo por la lista entera deja ver lo único que decide la
// pantalla: qué palabras le entrega.
vi.mock('@/components/ui/gooey-text-morphing', () => ({
  GooeyText: ({ texts }: { texts: string[] }) => <div>{texts.join(' ')}</div>,
}));

// jsdom no implementa el desplazamiento; la pantalla lo pide en cada mensaje.
Element.prototype.scrollIntoView = () => {};

/** El estado de `useChat` que deja la pantalla en su pantalla de bienvenida. */
function chatState(overrides: Record<string, unknown> = {}) {
  return {
    messages: [],
    status: 'ready',
    error: undefined,
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
    ...overrides,
  };
}

/** El Customer que la pantalla da por sentado, en el idioma que se le pida. */
function customer(language: Language) {
  return {
    fullName: 'Ana Cliente',
    companyName: 'Refrigeración del Norte',
    clerkId: 'user_ana',
    preferredLanguage: language,
  };
}

type Screen = {
  user?: unknown;
  conversation?: unknown;
  chat?: ReturnType<typeof chatState>;
};

/**
 * La pantalla con sus dos consultas puestas a mano, para poder pararla en un
 * instante concreto del arranque y no sólo en el que ya lo tiene todo.
 *
 * Cada consulta se responde por *cuál* es y no por el orden en que se pidió: el
 * orden aguanta un render y se rompe en el siguiente —el efecto del onboarding
 * provoca uno—, y al romperse devolvería `undefined`, que la pantalla lee como
 * «todavía cargando». Una regresión de verdad se leería entonces como una
 * prueba en verde.
 *
 * Se reconoce por el nombre y no por la referencia porque `api` es un proxy que
 * fabrica un objeto nuevo en cada acceso: `api.users.current` nunca es igual a
 * sí mismo. El nombre —`users:current`— sí es estable.
 */
async function renderScreen({ user, conversation, chat = chatState() }: Screen) {
  useQuery.mockImplementation((reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name === 'users:current') return user;
    if (name === 'chat:currentConversation') return conversation;
    throw new Error(`La pantalla pidió \`${name}\`, que esta prueba no conoce.`);
  });
  useChat.mockReturnValue(chat);

  const { default: Dashboard } = await import('./page');
  return montar(<Dashboard />);
}

/** La pantalla ya arrancada del todo: el Customer puesto y sin nada guardado. */
async function render(language: Language, chat = chatState()) {
  return renderScreen({ user: customer(language), conversation: null, chat });
}

/**
 * Lo que el Customer llega a leer: el texto visible más los atributos que se
 * leen igual —el marcador del campo, los textos alternativos—. Sobre el HTML en
 * crudo no se puede afirmar: los nombres de clase traen palabras en inglés que
 * no son copia de nadie.
 */
function readableText(container: HTMLElement): string {
  const attributes = [...container.querySelectorAll('[placeholder], [alt], [title]')].flatMap(
    (element) =>
      ['placeholder', 'alt', 'title']
        .map((name) => element.getAttribute(name))
        .filter((value): value is string => value !== null)
  );

  return [container.textContent ?? '', ...attributes].join(' ');
}

/** Sólo las frases que la pantalla de bienvenida llega a pintar. */
function welcomePhrases(language: Language): string[] {
  const m = messagesFor(language).chat;
  return [
    m.greeting,
    m.quoteHere,
    ...m.morphingWords,
    m.quoteReplacementTitle,
    m.quoteReplacementBody,
    m.dataplateHelpTitle,
    m.dataplateHelpBody,
    m.inputPlaceholder,
    m.copyright,
  ];
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('la pantalla de chat', () => {
  test.each(LANGUAGES)('la bienvenida en %s lleva sus propias frases', async (language) => {
    const text = readableText(await render(language));

    for (const phrase of welcomePhrases(language)) {
      expect(text).toContain(phrase);
    }
  });

  test.each(LANGUAGES)('en %s no sobrevive ninguna frase del otro idioma', async (language) => {
    const otro = otherLanguage(language);
    const text = readableText(await render(language));

    for (const phrase of distinctivePhrases('chat', otro)) {
      expect(text).not.toContain(phrase);
    }
  });

  test.each(LANGUAGES)('los atajos mandan el mensaje redactado en %s', async (language) => {
    // El atajo escribe *por* el Customer, así que el texto que envía también es
    // suyo: mandarlo en español desde una interfaz en inglés le pondría en boca
    // algo que él no habría escrito.
    const chat = chatState();
    const container = await render(language, chat);
    const t = messagesFor(language).chat;

    const buttons = [...container.querySelectorAll('button')];
    const shortcut = buttons.find((b) => b.textContent?.includes(t.quoteReplacementTitle));
    shortcut?.click();

    expect(chat.sendMessage).toHaveBeenCalledWith({ text: t.quoteReplacementPrompt });
  });

  test.each(LANGUAGES)('el fallo sin explicación del servidor se dice en %s', async (language) => {
    const otro = otherLanguage(language);
    // Un error sin cuerpo: el servidor no dijo nada que se pueda repetir, así
    // que la pantalla pone la suya. Cuando sí lo dice —el techo de peticiones—
    // ese texto ya viene traducido desde `api/chat/route.ts`.
    const container = await render(language, chatState({ error: new Error('') }));

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(messagesFor(language).chat.genericError);
    expect(alert?.textContent).not.toContain(messagesFor(otro).chat.genericError);
  });

  test.each(LANGUAGES)('la conversación ya enviada ofrece empezar otra en %s', async (language) => {
    const otro = otherLanguage(language);
    const enviada = {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-submit_quote_request',
          state: 'output-available',
          output: { success: true, requestId: 'REQ-V59X9B' },
        },
      ],
    };

    const container = await render(language, chatState({ messages: [enviada] }));

    expect(container.textContent).toContain(messagesFor(language).chat.startNewConversation);
    expect(container.textContent).not.toContain(messagesFor(otro).chat.startNewConversation);
    // Y la tarjeta del envío, que es una pieza aparte, va en el mismo idioma.
    expect(container.textContent).toContain(messagesFor(language).chat.submittedTitle);
  });
});

/**
 * El arranque en frío (ticket 01 de «usable-on-a-phone»).
 *
 * En un teléfono el handshake de Clerk tarda lo suficiente como para que la
 * pantalla se monte antes de tener credenciales. Ahí `currentConversation`
 * lanzaba, y la excepción salía dentro del render: el Customer se quedaba en
 * una página de error en vez de en la pantalla. Ahora contesta nada, igual que
 * su vecina, y lo que se pinta mientras tanto es la espera que la pantalla ya
 * tenía.
 */
describe('la pantalla de chat con credenciales frías', () => {
  test('mientras las consultas están en vuelo se pinta la espera', async () => {
    const container = await renderScreen({ user: undefined, conversation: undefined });

    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(container.textContent).not.toContain(messagesFor('es').chat.greeting);
  });

  test('con la conversación resuelta en nada se monta el chat igual', async () => {
    // Es lo que devuelve la consulta en cuanto llegan las credenciales de un
    // Customer que todavía no ha hablado —y lo que devolvía antes de hablar era
    // lo mismo, así que la pantalla no distingue este caso del de siempre.
    const container = await renderScreen({ user: customer('es'), conversation: null });

    expect(container.textContent).toContain(messagesFor('es').chat.greeting);
  });
});
