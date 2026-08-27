import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { montar } from '@/test/render-component';
import { LANGUAGES, messagesFor, type Language } from '@/lib/messages';
import { distinctivePhrases, otherLanguage } from '@/test/languages';
import { rememberLanguage } from '@/lib/language-preference';
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

const { useQuery, useConvexAuth, useChat, push } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useConvexAuth: vi.fn(),
  useChat: vi.fn(),
  push: vi.fn(),
}));

vi.mock('convex/react', () => ({ useQuery, useConvexAuth }));
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

/**
 * Lo que `useConvexAuth` contesta. Por defecto, el handshake ya terminado y con
 * sesión: es el estado en el que está la pantalla en cuanto arranca del todo, y
 * el que dan por sentado todas las pruebas que no dicen otra cosa.
 */
function authState(overrides: Partial<AuthState> = {}): AuthState {
  return { isLoading: false, isAuthenticated: true, ...overrides };
}

type AuthState = { isLoading: boolean; isAuthenticated: boolean };

type Screen = {
  user?: unknown;
  conversation?: unknown;
  auth?: AuthState;
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
async function renderScreen({
  user,
  conversation,
  auth = authState(),
  chat = chatState(),
}: Screen) {
  useConvexAuth.mockReturnValue(auth);
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

  /**
   * El instante que de verdad ocurre en un teléfono, y el que la corrección de
   * ticket 01 dejaba a medias. `ConvexProviderWithAuth` no llama a `setAuth`
   * hasta que Clerk termina, así que durante el handshake las dos consultas se
   * ejecutan *sin identidad* y contestan `null` —no `undefined`—. Con eso, el
   * `user === null` de «no ha iniciado sesión» se disparaba y el Customer veía
   * una página en blanco, sin barra y sin espera: la excepción se había
   * convertido en un vacío, no en la carga que se pretendía.
   *
   * Quien distingue «todavía no sabemos» de «no hay sesión» es
   * `useConvexAuth().isLoading`, no la respuesta de la consulta: contestar nada
   * es lo que hacen ambos estados.
   */
  test('mientras el handshake está en vuelo se pinta la espera, no una página en blanco', async () => {
    const container = await renderScreen({
      user: null,
      conversation: null,
      auth: authState({ isLoading: true, isAuthenticated: false }),
    });

    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  /**
   * El otro instante frío: Clerk ya dice quién es, pero la fila del Customer
   * todavía no aterrizó por el webhook. `users.current` contesta `null` y es
   * una espera, no una ausencia de sesión — así que se pinta igual.
   */
  test('con la sesión puesta y el Customer sin aterrizar se sigue esperando', async () => {
    const container = await renderScreen({ user: null, conversation: null });

    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  /**
   * Y lo que la rama en blanco protegía de verdad se conserva: sin sesión, con
   * el handshake ya terminado, la pantalla no pinta nada. El middleware ya lo
   * impide; esto es el cinturón.
   */
  test('sin sesión y con el handshake terminado no se pinta nada', async () => {
    const container = await renderScreen({
      user: null,
      conversation: null,
      auth: authState({ isAuthenticated: false }),
    });

    expect(container.querySelector('.animate-pulse')).toBeNull();
    expect(container.textContent).toBe('');
  });

  test('con la conversación resuelta en nada se monta el chat igual', async () => {
    // Es lo que devuelve la consulta en cuanto llegan las credenciales de un
    // Customer que todavía no ha hablado —y lo que devolvía antes de hablar era
    // lo mismo, así que la pantalla no distingue este caso del de siempre.
    const container = await renderScreen({ user: customer('es'), conversation: null });

    expect(container.textContent).toContain(messagesFor('es').chat.greeting);
  });
});

/**
 * El cinturón (ticket 02 de «usable-on-a-phone»).
 *
 * `ChatErrorBoundary` tiene su propia prueba; lo que se comprueba aquí es que
 * está puesto de verdad alrededor de esta pantalla, que es lo que decide si el
 * próximo fallo cuesta un mensaje o la pantalla entera.
 */
describe('la pantalla de chat cuando algo por debajo se cae', () => {
  test('una consulta que lanza deja el mensaje y su reintento, no una página muerta', async () => {
    // React escribe por consola cada error que recoge una frontera: aquí es lo
    // esperado.
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});

    useConvexAuth.mockReturnValue(authState());
    useQuery.mockImplementation(() => {
      throw new Error('la consulta de turno se cayó');
    });
    useChat.mockReturnValue(chatState());

    const { default: Dashboard } = await import('./page');
    const container = montar(<Dashboard />);

    const t = messagesFor('es').chat;
    expect(container.textContent).toContain(t.errorTitle);
    expect(container.textContent).toContain(t.errorRetry);

    consola.mockRestore();
  });

  /**
   * El fallo del arranque en frío ocurre en el primer render, antes de que
   * ninguna consulta haya contestado quién es el Customer: si el idioma saliera
   * de ahí, un Customer que eligió inglés leería el error en español. Sale de lo
   * último que se le conoció, que es lo único que hay a esa altura.
   */
  test('el mensaje va en el idioma que el Customer eligió la última vez', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    rememberLanguage('en');

    useConvexAuth.mockReturnValue(authState());
    useQuery.mockImplementation(() => {
      throw new Error('la consulta de turno se cayó');
    });
    useChat.mockReturnValue(chatState());

    const { default: Dashboard } = await import('./page');
    const container = montar(<Dashboard />);

    expect(container.textContent).toContain(messagesFor('en').chat.errorTitle);
    expect(container.textContent).not.toContain(messagesFor('es').chat.errorTitle);

    window.localStorage.clear();
    consola.mockRestore();
  });
});
