/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import * as chat from './chat';
import { findSubmission } from './lib/chat';

/**
 * Seam 1 — la frontera de las funciones de Convex del chat (ticket 21).
 *
 * Las conversaciones son de un Customer y de nadie más, así que lo que se
 * afirma es lo que un llamador puede observar: qué le devuelve la consulta con
 * su identidad de Clerk puesta, qué le devuelve con la de otro, y qué pasa
 * cuando la conversación ya produjo una Replacement Request.
 */
const modules = import.meta.glob('./**/*.ts');

const INTERNAL_SECRET = 'secreto-de-prueba';

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', INTERNAL_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type TestConvex = ReturnType<typeof convexTest>;

/** Siembra un Customer y devuelve su clerkId. */
async function seedCustomer(t: TestConvex, clerkId: string, fullName = 'Ana') {
  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      clerkId,
      fullName,
      companyName: 'ACME',
      email: `${clerkId}@example.com`,
      preferredLanguage: 'es',
    });
  });
  return clerkId;
}

function textTurn(messageId: string, role: 'user' | 'assistant', text: string) {
  return { messageId, role, parts: [{ type: 'text', text }] };
}

/**
 * Lo mismo, pero como lo devuelve `currentConversation`: el identificador va en
 * `id`, que es donde lo lee `useChat`.
 */
function asUiMessage({
  messageId,
  ...rest
}: {
  messageId: string;
  role: string;
  parts: unknown[];
}) {
  return { id: messageId, ...rest };
}

/** El turno en que la herramienta ya devolvió una Replacement Request. */
function submittedTurn(messageId: string, quoteId: string, requestId = 'REQ-ABC123') {
  return {
    messageId,
    role: 'assistant' as const,
    parts: [
      { type: 'step-start' },
      {
        type: 'tool-submit_quote_request',
        toolCallId: 'call_1',
        state: 'output-available',
        input: { products: [{ partNumber: '162562' }] },
        output: { success: true, quoteId, requestId },
      },
      { type: 'text', text: 'Gracias, quedo al pendiente.' },
    ],
  };
}

/** Crea una Replacement Request de este Customer y devuelve su `_id`. */
async function seedQuote(t: TestConvex, clerkId: string) {
  return await t.run(async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const user = users.find((u) => u.clerkId === clerkId)!;

    return await ctx.db.insert('quotes', {
      userId: user._id,
      requestId: 'REQ-ABC123',
      products: [],
      expiresAt: Date.now() + 1000,
    });
  });
}

describe('un Customer reanuda su propia conversación', () => {
  test('sin conversación previa no hay nada que reanudar', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    expect(
      await t.withIdentity({ subject: ana }).query(api.chat.currentConversation, {})
    ).toBeNull();
  });

  /**
   * El punto del ticket: las `parts[]` vuelven enteras. Si alguien las aplanara
   * a un `content`, la tool part —que es como se le vuelve a pintar el folio al
   * Customer— desaparecería aquí.
   */
  test('lee de vuelta sus mensajes con la estructura de parts intacta', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    const enviados = [
      textTurn('msg_1', 'user', 'Quiero cotizar el 162562'),
      {
        messageId: 'msg_2',
        role: 'assistant' as const,
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-show_dataplate_guide',
            toolCallId: 'call_0',
            state: 'output-available',
            input: {},
            output: { success: true, message: 'Guía mostrada.' },
          },
          { type: 'text', text: '¿Qué modelo trae la placa?' },
        ],
      },
    ];

    await t.mutation(internal.chat.persistTurn, { clerkId: ana, messages: enviados });

    const conversacion = await t
      .withIdentity({ subject: ana })
      .query(api.chat.currentConversation, {});

    expect(conversacion!.messages).toEqual(enviados.map(asUiMessage));
  });

  test('los mensajes vuelven en el orden en que se dijeron', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'uno'), textTurn('msg_2', 'assistant', 'dos')],
    });
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [
        textTurn('msg_1', 'user', 'uno'),
        textTurn('msg_2', 'assistant', 'dos'),
        textTurn('msg_3', 'user', 'tres'),
      ],
    });

    const conversacion = await t
      .withIdentity({ subject: ana })
      .query(api.chat.currentConversation, {});

    expect(conversacion!.messages.map((m) => m.id)).toEqual(['msg_1', 'msg_2', 'msg_3']);
  });

  /**
   * Cada turno reenvía la conversación entera, así que sin reconciliación por
   * `id` la tabla crecería al cuadrado y el Customer vería cada mensaje
   * repetido tantas veces como turnos lleve.
   */
  test('reenviar el mismo turno no duplica los mensajes ya guardados', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    const primeros = [textTurn('msg_1', 'user', 'hola'), textTurn('msg_2', 'assistant', 'buenas')];
    await t.mutation(internal.chat.persistTurn, { clerkId: ana, messages: primeros });
    await t.mutation(internal.chat.persistTurn, { clerkId: ana, messages: primeros });

    const filas = await t.run(async (ctx) => ctx.db.query('chat_messages').collect());
    expect(filas).toHaveLength(2);
  });

  test('un mensaje que cambió se reescribe en su sitio', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'assistant', 'Enviand')],
    });
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'assistant', 'Enviando tu solicitud')],
    });

    const conversacion = await t
      .withIdentity({ subject: ana })
      .query(api.chat.currentConversation, {});

    expect(conversacion!.messages).toEqual([
      asUiMessage(textTurn('msg_1', 'assistant', 'Enviando tu solicitud')),
    ]);
  });

  /**
   * Antes esta lectura lanzaba `No autenticado`, y la afirmación era que
   * lanzara. Cambia a propósito, y lo que la protegía se conserva entero: quien
   * no se ha identificado sigue sin ver una sola conversación. Devolver nada no
   * revela nada que lanzar ocultara —no hay conversación en la respuesta, ni
   * pista de si existía—, así que la regla de acceso es la misma; lo único que
   * cambia es cómo se dice.
   *
   * Y cómo se decía era el defecto. La pantalla monta esta consulta mientras el
   * handshake de Clerk está en vuelo, es decir con credenciales todavía frías:
   * la excepción salía dentro de un render de React, que no la trata como una
   * negativa sino como una caída, y el Customer se quedaba en una página de
   * error de la que ya no volvía. Contestando nada, la consulta queda en el
   * mismo estado de espera que la pantalla ya sabe pintar —el mismo que usa su
   * vecina `users.current`, que nunca lanzó—, y el render sobrevive hasta que
   * llegan las credenciales.
   */
  test('sin identidad de Clerk no se lee ninguna conversación', async () => {
    const t = convexTest(schema, modules);
    await seedCustomer(t, 'user_ana');

    await expect(t.query(api.chat.currentConversation, {})).resolves.toBeNull();
  });

  /**
   * El otro instante frío del mismo handshake: Clerk ya dice quién es el
   * Customer, pero la fila que lo representa todavía no aterrizó por el webhook.
   * Es la misma caída en el mismo render, así que se contesta igual.
   */
  test('una identidad sin Customer todavía en la base no se lee como una caída', async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.withIdentity({ subject: 'user_fantasma' }).query(api.chat.currentConversation, {})
    ).resolves.toBeNull();
  });
});

describe('una conversación es de un solo Customer', () => {
  test('un Customer no lee la conversación de otro', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana', 'Ana');
    const beto = await seedCustomer(t, 'user_beto', 'Beto');

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_ana', 'user', 'el 162562 de Ana')],
    });
    await t.mutation(internal.chat.persistTurn, {
      clerkId: beto,
      messages: [textTurn('msg_beto', 'user', 'el 998877 de Beto')],
    });

    const deAna = await t.withIdentity({ subject: ana }).query(api.chat.currentConversation, {});
    const deBeto = await t.withIdentity({ subject: beto }).query(api.chat.currentConversation, {});

    expect(deAna!.messages.map((m) => m.id)).toEqual(['msg_ana']);
    expect(deBeto!.messages.map((m) => m.id)).toEqual(['msg_beto']);
  });

  test('escribir por una identidad desconocida no escribe nada', async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.chat.persistTurn, {
        clerkId: 'user_fantasma',
        messages: [textTurn('msg_1', 'user', 'hola')],
      })
    ).rejects.toThrow('Usuario no encontrado');

    const filas = await t.run(async (ctx) => ctx.db.query('chat_messages').collect());
    expect(filas).toHaveLength(0);
  });
});

describe('una conversación que ya envió su Replacement Request queda de solo lectura', () => {
  test('se cierra con el identificador de la Replacement Request que produjo', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');
    const quoteId = await seedQuote(t, ana);

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'confirmo'), submittedTurn('msg_2', quoteId)],
    });

    const sesiones = await t.run(async (ctx) => ctx.db.query('chat_sessions').collect());
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0].submittedQuoteId).toBe(quoteId);
  });

  /**
   * De solo lectura, no invisible: dentro va la tool part con la que se le
   * confirmó el folio al Customer, y esconderla le costaría en el primer
   * refresco justo la confirmación que este ticket existe para que no se
   * pierda.
   */
  test('se sigue leyendo entera, con la confirmación dentro', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');
    const quoteId = await seedQuote(t, ana);
    const enviada = [textTurn('msg_1', 'user', 'confirmo'), submittedTurn('msg_2', quoteId)];

    await t.mutation(internal.chat.persistTurn, { clerkId: ana, messages: enviada });

    const conversacion = await t
      .withIdentity({ subject: ana })
      .query(api.chat.currentConversation, {});

    expect(conversacion!.messages).toEqual(enviada.map(asUiMessage));
  });

  /**
   * Ticket 21: reanudar una conversación que ya disparó `submit_quote_request`
   * no puede dejar que se dispare otra vez por las mismas piezas. Reenviarla no
   * la continúa ni abre otra con las mismas piezas: se rechaza.
   */
  test('reenviarla se rechaza en vez de abrir otra conversación con las mismas piezas', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');
    const quoteId = await seedQuote(t, ana);
    const enviada = [textTurn('msg_1', 'user', 'confirmo'), submittedTurn('msg_2', quoteId)];

    await t.mutation(internal.chat.persistTurn, { clerkId: ana, messages: enviada });

    await expect(
      t.mutation(internal.chat.persistTurn, {
        clerkId: ana,
        messages: [...enviada, textTurn('msg_3', 'user', 'y otra pieza más')],
      })
    ).rejects.toThrow('ya envió su Replacement Request');

    const sesiones = await t.run(async (ctx) => ctx.db.query('chat_sessions').collect());
    expect(sesiones).toHaveLength(1);
  });

  test('el turno siguiente empieza una conversación nueva y en blanco', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');
    const quoteId = await seedQuote(t, ana);

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'confirmo'), submittedTurn('msg_2', quoteId)],
    });
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_3', 'user', 'ahora otra pieza')],
    });

    const conversacion = await t
      .withIdentity({ subject: ana })
      .query(api.chat.currentConversation, {});

    expect(conversacion!.messages.map((m) => m.id)).toEqual(['msg_3']);

    const sesiones = await t.run(async (ctx) => ctx.db.query('chat_sessions').collect());
    expect(sesiones).toHaveLength(2);
  });

  /**
   * El envío nuevo no se confunde con el reenvío del anterior. Un Customer que
   * ya envió una Replacement Request y arranca otra puede dar todos sus datos
   * de golpe: entonces el primer turno de la conversación nueva ya trae un
   * envío, con la última conversación cerrada detrás — que es exactamente la
   * forma que tiene un reenvío.
   */
  test('un envío nuevo en el primer turno de la conversación siguiente sí se guarda', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');
    const primera = await seedQuote(t, ana);
    const segunda = await seedQuote(t, ana);

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'confirmo'), submittedTurn('msg_2', primera)],
    });
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [
        textTurn('msg_3', 'user', 'otra pieza, y confirmo'),
        submittedTurn('msg_4', segunda),
      ],
    });

    const sesiones = await t.run(async (ctx) => ctx.db.query('chat_sessions').collect());
    expect(sesiones.map((s) => s.submittedQuoteId)).toEqual([primera, segunda]);
  });

  /**
   * La conversación cerrada sigue guardada tal cual: el Customer la envió y el
   * Approver la va a contestar. Lo que deja de poder es crecer.
   */
  test('los mensajes de la conversación cerrada no se tocan al empezar otra', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');
    const quoteId = await seedQuote(t, ana);

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'confirmo'), submittedTurn('msg_2', quoteId)],
    });
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_3', 'user', 'ahora otra pieza')],
    });

    const cerrada = await t.run(async (ctx) => {
      const sesion = (await ctx.db.query('chat_sessions').collect()).find(
        (s) => s.submittedAt !== undefined
      )!;
      return await ctx.db
        .query('chat_messages')
        .withIndex('by_session_id', (q) => q.eq('sessionId', sesion._id))
        .collect();
    });

    expect(cerrada.map((m) => m.messageId)).toEqual(['msg_1', 'msg_2']);
  });

  /**
   * Un envío que Convex rechazó no produjo ninguna Replacement Request, así que
   * cerrar la conversación ahí le quitaría al Customer la única forma de
   * reintentar lo que nunca llegó a registrarse.
   */
  test('un envío fallido no cierra nada', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    const fallido = {
      messageId: 'msg_2',
      role: 'assistant' as const,
      parts: [
        {
          type: 'tool-submit_quote_request',
          toolCallId: 'call_1',
          state: 'output-available',
          input: {},
          output: { success: false, message: 'Hubo un error al procesar tu solicitud.' },
        },
      ],
    };

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'confirmo'), fallido],
    });

    const conversacion = await t
      .withIdentity({ subject: ana })
      .query(api.chat.currentConversation, {});
    expect(conversacion!.messages.map((m) => m.id)).toEqual(['msg_1', 'msg_2']);
  });

  /**
   * El `quoteId` llega dentro de una salida de herramienta, es decir de texto
   * que viajó por la red. Si no nombra una Replacement Request de este
   * Customer, la conversación se cierra igual —el envío ocurrió— pero sin
   * apuntar a un registro que no es suyo.
   */
  test('un identificador que no es del Customer cierra la conversación sin quedar apuntado', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana', 'Ana');
    const beto = await seedCustomer(t, 'user_beto', 'Beto');
    const deBeto = await seedQuote(t, beto);

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [submittedTurn('msg_1', deBeto)],
    });

    const sesion = await t.run(async (ctx) => (await ctx.db.query('chat_sessions').collect())[0]);
    expect(sesion.submittedQuoteId).toBeUndefined();
    // Cerrada de todas formas: el envío ocurrió, aunque no sepamos apuntar a él.
    expect(sesion.submittedAt).toEqual(expect.any(Number));
  });
});

/**
 * Ticket 02 — lo que cierra una conversación es lo que está guardado, no la
 * copia que trae el navegador.
 *
 * Mirar sólo el transcript que llega deja pasar tres casos: una pestaña que se
 * quedó abierta desde antes del envío, un cuerpo editado al que le quitaron la
 * respuesta que envió, y una recarga que llegó antes de que el turno que envía
 * terminara de guardarse. En los tres, el transcript trae mensajes que ya están
 * guardados en una conversación enviada, y eso es lo que se comprueba.
 */
describe('un transcript que continúa una conversación enviada se rechaza', () => {
  /** Ana envía una conversación con `msg_1` y `msg_2`. */
  async function anaYaEnvio(t: TestConvex) {
    const ana = await seedCustomer(t, 'user_ana', 'Ana');
    const quoteId = await seedQuote(t, ana);
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'confirmo'), submittedTurn('msg_2', quoteId)],
    });
    return ana;
  }

  function continuesSubmitted(t: TestConvex, clerkId: string, messageIds: string[]) {
    return t.query(internal.chat.continuesSubmittedConversation, { clerkId, messageIds });
  }

  test('una pestaña que no vio el envío: sus mensajes están en una conversación enviada', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaYaEnvio(t);

    expect(await continuesSubmitted(t, ana, ['msg_1', 'msg_3'])).toBe(true);
  });

  test('un cuerpo editado sin la respuesta que envió se rechaza al guardarse', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaYaEnvio(t);

    await expect(
      t.mutation(internal.chat.persistTurn, {
        clerkId: ana,
        messages: [
          textTurn('msg_1', 'user', 'confirmo'),
          textTurn('msg_3', 'user', 'y también otro ventilador'),
        ],
      })
    ).rejects.toThrow('ya envió su Replacement Request');

    const mensajes = await t.run(async (ctx) => ctx.db.query('chat_messages').collect());
    expect(mensajes.map((m) => m.messageId)).toEqual(['msg_1', 'msg_2']);
  });

  /**
   * Cuenta cualquier conversación enviada, no sólo la última: con otra ya
   * abierta, la pestaña vieja sigue siendo la continuación de la enviada. Y
   * guardar su turno no puede meter sus mensajes en la conversación nueva, que
   * es donde caería por ser la abierta.
   */
  test('con una conversación nueva ya abierta, la pestaña vieja sigue rechazada', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaYaEnvio(t);
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_10', 'user', 'otra pieza')],
    });

    expect(await continuesSubmitted(t, ana, ['msg_1', 'msg_3'])).toBe(true);
    await expect(
      t.mutation(internal.chat.persistTurn, {
        clerkId: ana,
        messages: [textTurn('msg_1', 'user', 'confirmo'), textTurn('msg_3', 'user', 'y otro')],
      })
    ).rejects.toThrow('ya envió su Replacement Request');

    const conversacion = await t
      .withIdentity({ subject: ana })
      .query(api.chat.currentConversation, {});
    expect(conversacion!.messages.map((m) => m.id)).toEqual(['msg_10']);
  });

  test('un transcript sin mensajes guardados pasa: es una conversación nueva', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaYaEnvio(t);

    expect(await continuesSubmitted(t, ana, ['msg_nuevo'])).toBe(false);
    expect(await continuesSubmitted(t, ana, [])).toBe(false);
  });

  test('la conversación abierta sigue admitiendo su turno siguiente', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'Quiero cotizar el 162562')],
    });

    expect(await continuesSubmitted(t, ana, ['msg_1', 'msg_2'])).toBe(false);
  });

  test('una conversación abandonada no cuenta como enviada', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'Quiero cotizar el 162562')],
    });
    await t.withIdentity({ subject: ana }).mutation(api.chat.abandonCurrentConversation, {});

    expect(await continuesSubmitted(t, ana, ['msg_1'])).toBe(false);
  });

  /**
   * Los ids de otro Customer no le dicen nada a éste: ni un rechazo, ni nada
   * que distinga un id de otro que existe de uno que no existe.
   */
  test('los mensajes de otro Customer nunca rechazan a éste', async () => {
    const t = convexTest(schema, modules);
    await anaYaEnvio(t);
    const beto = await seedCustomer(t, 'user_beto', 'Beto');

    expect(await continuesSubmitted(t, beto, ['msg_1', 'msg_2'])).toBe(false);
    await t.mutation(internal.chat.persistTurn, {
      clerkId: beto,
      messages: [textTurn('msg_1', 'user', 'hola')],
    });
  });

  test('una identidad sin Customer no continúa nada', async () => {
    const t = convexTest(schema, modules);
    await anaYaEnvio(t);

    expect(await continuesSubmitted(t, 'user_nadie', ['msg_1'])).toBe(false);
  });

  test('la comprobación es interna', () => {
    expect(chat.continuesSubmittedConversation.isInternal).toBe(true);
  });
});

/**
 * Ticket 03 — crear la Replacement Request y cerrar su conversación son una
 * sola transacción.
 *
 * Antes la conversación sólo contaba como enviada cuando `persistTurn` guardaba
 * el turno entero, al acabar el stream. Un mensaje que llegaba en ese hueco
 * —una recarga temprana, una segunda pestaña, un doble envío— pasaba el 409 y
 * el modelo podía crear otra Replacement Request.
 */
describe('la Replacement Request cierra su conversación en el momento en que se crea', () => {
  const PRODUCT = {
    partNumber: '162562',
    model: 'GR45C-4DK.4F.CR',
    quantity: 1,
    deliveryLocation: 'Monterrey',
  };

  function createQuote(t: TestConvex, clerkId: string, messageIds: string[]) {
    return t.mutation(internal.quotes.create, { clerkId, products: [PRODUCT], messageIds });
  }

  function continuesSubmitted(t: TestConvex, clerkId: string, messageIds: string[]) {
    return t.query(internal.chat.continuesSubmittedConversation, { clerkId, messageIds });
  }

  async function sesiones(t: TestConvex) {
    return await t.run(async (ctx) => ctx.db.query('chat_sessions').collect());
  }

  /** Ana tiene una conversación abierta con `msg_1` guardado. */
  async function anaConversando(t: TestConvex) {
    const ana = await seedCustomer(t, 'user_ana', 'Ana');
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'Quiero cotizar el 162562')],
    });
    return ana;
  }

  test('recarga temprana: con la Request creada y el turno sin guardar, continuar ya se rechaza', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaConversando(t);

    const { quoteId } = await createQuote(t, ana, ['msg_1', 'msg_2']);

    const [sesion] = await sesiones(t);
    expect(sesion.submittedAt).toEqual(expect.any(Number));
    expect(sesion.submittedQuoteId).toBe(quoteId);
    expect(await continuesSubmitted(t, ana, ['msg_1', 'msg_9'])).toBe(true);
  });

  test('dos envíos a la vez desde la misma conversación crean una sola Request', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaConversando(t);

    const resultados = await Promise.allSettled([
      createQuote(t, ana, ['msg_1', 'msg_2']),
      createQuote(t, ana, ['msg_1', 'msg_3']),
    ]);

    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const quotes = await t.run(async (ctx) => ctx.db.query('quotes').collect());
    expect(quotes).toHaveLength(1);
    expect((await sesiones(t))[0].submittedQuoteId).toBe(quotes[0]._id);
  });

  test('el turno que envía se guarda entero en la conversación que cerró', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaConversando(t);
    const { quoteId } = await createQuote(t, ana, ['msg_1', 'msg_2']);

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [
        textTurn('msg_1', 'user', 'Quiero cotizar el 162562'),
        textTurn('msg_2', 'user', 'confirmo'),
        submittedTurn('msg_3', quoteId),
      ],
    });

    const todas = await sesiones(t);
    expect(todas).toHaveLength(1);
    expect(todas[0].submittedQuoteId).toBe(quoteId);

    const conversacion = await t
      .withIdentity({ subject: ana })
      .query(api.chat.currentConversation, {});
    expect(conversacion!.messages.map((m) => m.id)).toEqual(['msg_1', 'msg_2', 'msg_3']);
    expect(findSubmission(conversacion!.messages)).toEqual({ quoteId, messageId: 'msg_3' });
  });

  test('reenviarla después se sigue rechazando al guardarse', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaConversando(t);
    const { quoteId } = await createQuote(t, ana, ['msg_1', 'msg_2']);
    const enviada = [
      textTurn('msg_1', 'user', 'Quiero cotizar el 162562'),
      textTurn('msg_2', 'user', 'confirmo'),
      submittedTurn('msg_3', quoteId),
    ];
    await t.mutation(internal.chat.persistTurn, { clerkId: ana, messages: enviada });

    await expect(
      t.mutation(internal.chat.persistTurn, {
        clerkId: ana,
        messages: [...enviada, textTurn('msg_4', 'user', 'y otra pieza')],
      })
    ).rejects.toThrow('ya envió su Replacement Request');
    expect(await continuesSubmitted(t, ana, ['msg_1', 'msg_4'])).toBe(true);
  });

  /**
   * El que perdió la carrera: su herramienta devolvió `success: false`, así que
   * su transcript no trae el envío que cerró la conversación. Guardarlo
   * metería en ella un turno que no la cerró.
   */
  test('el turno del envío que perdió la carrera no se guarda', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaConversando(t);
    await createQuote(t, ana, ['msg_1', 'msg_2']);

    await expect(
      t.mutation(internal.chat.persistTurn, {
        clerkId: ana,
        messages: [
          textTurn('msg_1', 'user', 'Quiero cotizar el 162562'),
          textTurn('msg_5', 'user', 'confirmo'),
          {
            messageId: 'msg_6',
            role: 'assistant' as const,
            parts: [
              {
                type: 'tool-submit_quote_request',
                toolCallId: 'call_2',
                state: 'output-available',
                input: {},
                output: { success: false, message: 'Hubo un error.' },
              },
            ],
          },
        ],
      })
    ).rejects.toThrow('ya envió su Replacement Request');
  });

  test('un envío que nombra otra Request no pasa por el que cerró la conversación', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaConversando(t);
    await createQuote(t, ana, ['msg_1', 'msg_2']);
    const otra = await seedQuote(t, ana);

    await expect(
      t.mutation(internal.chat.persistTurn, {
        clerkId: ana,
        messages: [
          textTurn('msg_1', 'user', 'Quiero cotizar el 162562'),
          submittedTurn('msg_7', otra),
        ],
      })
    ).rejects.toThrow('ya envió su Replacement Request');
  });

  test('crear la Request sobre una conversación ya enviada se rechaza sin crear nada', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaConversando(t);
    await createQuote(t, ana, ['msg_1', 'msg_2']);

    await expect(createQuote(t, ana, ['msg_1', 'msg_8'])).rejects.toThrow(
      'ya envió su Replacement Request'
    );
    const quotes = await t.run(async (ctx) => ctx.db.query('quotes').collect());
    expect(quotes).toHaveLength(1);
  });

  test('un envío en el primer turno, sin conversación guardada, la cierra al guardarse', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana', 'Ana');

    const { quoteId } = await createQuote(t, ana, ['msg_1']);
    expect(await sesiones(t)).toEqual([]);

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'todo de golpe'), submittedTurn('msg_2', quoteId)],
    });

    const todas = await sesiones(t);
    expect(todas).toHaveLength(1);
    expect(todas[0].submittedQuoteId).toBe(quoteId);
  });

  test('los ids de otro Customer ni cierran ni bloquean sus conversaciones', async () => {
    const t = convexTest(schema, modules);
    const ana = await anaConversando(t);
    const beto = await seedCustomer(t, 'user_beto', 'Beto');

    // Beto manda los ids de la conversación abierta de Ana: no la cierra.
    await createQuote(t, beto, ['msg_1']);
    expect((await sesiones(t))[0].submittedAt).toBeUndefined();

    // Ana envía; los mismos ids no le impiden a Beto crear la suya.
    await createQuote(t, ana, ['msg_1']);
    await expect(createQuote(t, beto, ['msg_1'])).resolves.toMatchObject({
      requestId: expect.any(String),
    });
  });
});

/**
 * El Customer se sale de una conversación que no piensa terminar.
 *
 * Hasta aquí la única salida era enviar la Replacement Request: la pantalla
 * resiembra siempre la última conversación, así que quien abría una y se
 * arrepentía se quedaba dentro para siempre —tocar «Inicio» recargaba la misma
 * pantalla y la misma conversación—. Abandonarla la deja de ser la actual sin
 * borrarla.
 */
describe('un Customer abandona la conversación que tiene abierta', () => {
  test('después de abandonarla no le queda ninguna conversación que reanudar', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'Quiero cotizar el 162562')],
    });
    await t.withIdentity({ subject: ana }).mutation(api.chat.abandonCurrentConversation, {});

    expect(
      await t.withIdentity({ subject: ana }).query(api.chat.currentConversation, {})
    ).toBeNull();
  });

  /** Deja de ser la actual, no deja de existir: lo dicho ahí sigue guardado. */
  test('lo que se dijo en ella no se borra', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'Quiero cotizar el 162562')],
    });
    await t.withIdentity({ subject: ana }).mutation(api.chat.abandonCurrentConversation, {});

    expect(await t.run(async (ctx) => ctx.db.query('chat_messages').collect())).toHaveLength(1);
  });

  /**
   * Lo que hace que la salida sea de verdad una salida: el turno siguiente no
   * cae dentro de la que acaba de dejar.
   */
  test('el siguiente mensaje abre una conversación nueva y limpia', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'Quiero cotizar el 162562')],
    });
    await t.withIdentity({ subject: ana }).mutation(api.chat.abandonCurrentConversation, {});
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_2', 'user', 'Mejor el 162563')],
    });

    const conversacion = await t
      .withIdentity({ subject: ana })
      .query(api.chat.currentConversation, {});

    expect(conversacion?.messages).toEqual([
      asUiMessage(textTurn('msg_2', 'user', 'Mejor el 162563')),
    ]);
  });

  /**
   * El turno que se quedó en vuelo. El Customer toca «Inicio» mientras el modelo
   * aún contesta, así que el transcript entero llega a guardarse cuando ya no
   * hay ninguna conversación abierta donde ponerlo.
   *
   * Antes abría una nueva y le copiaba dentro lo dicho en la abandonada, que
   * pasaba a ser la actual: la carga siguiente devolvía al Customer justo a la
   * conversación de la que acababa de salirse.
   */
  test('el turno que termina después de salirse no le devuelve la conversación', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'Quiero cotizar el 162562')],
    });
    await t.withIdentity({ subject: ana }).mutation(api.chat.abandonCurrentConversation, {});

    // Lo que el servidor entrega al acabar el stream: el transcript entero,
    // con el mensaje que ya estaba guardado y la respuesta que alcanzó a dar.
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [
        textTurn('msg_1', 'user', 'Quiero cotizar el 162562'),
        textTurn('msg_2', 'assistant', '¿De qué Modelo es?'),
      ],
    });

    expect(
      await t.withIdentity({ subject: ana }).query(api.chat.currentConversation, {})
    ).toBeNull();
  });

  /** Va a la conversación de la que salió: ni se pierde ni se duplica. */
  test('ese turno se guarda en la conversación que lo originó', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'Quiero cotizar el 162562')],
    });
    await t.withIdentity({ subject: ana }).mutation(api.chat.abandonCurrentConversation, {});
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [
        textTurn('msg_1', 'user', 'Quiero cotizar el 162562'),
        textTurn('msg_2', 'assistant', '¿De qué Modelo es?'),
      ],
    });

    const { sesiones, mensajes } = await t.run(async (ctx) => ({
      sesiones: await ctx.db.query('chat_sessions').collect(),
      mensajes: await ctx.db.query('chat_messages').collect(),
    }));

    expect(sesiones).toHaveLength(1);
    expect(mensajes.map((m) => m.messageId)).toEqual(['msg_1', 'msg_2']);
    expect(mensajes.every((m) => m.sessionId === sesiones[0]._id)).toBe(true);
  });

  /**
   * Y no por eso deja de haber salida: lo que el Customer escriba después es una
   * conversación nueva, porque no continúa ninguno de los mensajes guardados.
   */
  test('después de ese turno el mensaje siguiente sigue abriendo otra', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'Quiero cotizar el 162562')],
    });
    await t.withIdentity({ subject: ana }).mutation(api.chat.abandonCurrentConversation, {});
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [
        textTurn('msg_1', 'user', 'Quiero cotizar el 162562'),
        textTurn('msg_2', 'assistant', '¿De qué Modelo es?'),
      ],
    });
    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_3', 'user', 'Mejor el 162563')],
    });

    const conversacion = await t
      .withIdentity({ subject: ana })
      .query(api.chat.currentConversation, {});

    expect(conversacion?.messages).toEqual([
      asUiMessage(textTurn('msg_3', 'user', 'Mejor el 162563')),
    ]);
  });

  test('sin conversación abierta no pasa nada', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    await expect(
      t.withIdentity({ subject: ana }).mutation(api.chat.abandonCurrentConversation, {})
    ).resolves.toBeNull();
  });

  /**
   * Una conversación cerrada por envío ya no es la actual para nadie, pero su
   * folio se le sigue pintando al Customer mientras no diga otra cosa. Abandonar
   * no la reescribe.
   */
  test('una conversación que ya envió su Replacement Request no se toca', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');
    const quoteId = await seedQuote(t, ana);

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [
        textTurn('msg_1', 'user', 'Quiero cotizar el 162562'),
        submittedTurn('msg_2', quoteId),
      ],
    });
    await t.withIdentity({ subject: ana }).mutation(api.chat.abandonCurrentConversation, {});

    const sesion = await t.run(async (ctx) => (await ctx.db.query('chat_sessions').collect())[0]);
    expect(sesion.submittedAt).toEqual(expect.any(Number));
    expect(sesion.abandonedAt).toBeUndefined();
  });

  /** Escribir sigue exigiendo identidad, como todo lo demás que escribe aquí. */
  test('sin identidad no se abandona nada', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'Quiero cotizar el 162562')],
    });

    await expect(t.mutation(api.chat.abandonCurrentConversation, {})).rejects.toThrow();
    expect(
      await t.withIdentity({ subject: ana }).query(api.chat.currentConversation, {})
    ).not.toBeNull();
  });

  /** Y sólo la propia: la de Ana no se abandona desde la identidad de Beto. */
  test('la conversación de otro Customer no se abandona', async () => {
    const t = convexTest(schema, modules);
    const ana = await seedCustomer(t, 'user_ana');
    const beto = await seedCustomer(t, 'user_beto', 'Beto');

    await t.mutation(internal.chat.persistTurn, {
      clerkId: ana,
      messages: [textTurn('msg_1', 'user', 'Quiero cotizar el 162562')],
    });
    await t.withIdentity({ subject: beto }).mutation(api.chat.abandonCurrentConversation, {});

    expect(
      await t.withIdentity({ subject: ana }).query(api.chat.currentConversation, {})
    ).not.toBeNull();
  });
});

/**
 * Ticket 06 — la autorización se reduce a dos reglas. La conversación es una
 * superficie del Customer, así que se lee con la identidad de Clerk; se escribe
 * por el camino máquina a máquina, porque quien sabe de verdad lo que dijo el
 * modelo y si la herramienta disparó es el servidor, no el navegador.
 */
describe('la escritura del turno no es alcanzable desde un navegador', () => {
  test('`persistTurn` está registrada como interna', () => {
    expect(chat.persistTurn.isInternal).toBe(true);
  });

  test('la única función pública es la lectura del propio Customer', () => {
    const publicas = Object.entries(chat)
      .filter(([, fn]) => (fn as { isPublic?: boolean }).isPublic)
      .map(([name]) => name);

    expect(publicas).toEqual(['currentConversation', 'abandonCurrentConversation']);
  });
});

describe('la frontera HTTP interna del chat', () => {
  const body = JSON.stringify({
    clerkId: 'user_ana',
    messages: [{ messageId: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'hola' }] }],
  });

  test('sin la cabecera del secreto responde 401 y no escribe nada', async () => {
    const t = convexTest(schema, modules);
    await seedCustomer(t, 'user_ana');

    const res = await t.fetch('/internal/chat/persist-turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(res.status).toBe(401);
    expect(await t.run(async (ctx) => ctx.db.query('chat_messages').collect())).toHaveLength(0);
  });

  test('con el secreto correcto guarda el turno', async () => {
    const t = convexTest(schema, modules);
    await seedCustomer(t, 'user_ana');

    const res = await t.fetch('/internal/chat/persist-turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body,
    });

    expect(res.status).toBe(200);
    expect(await t.run(async (ctx) => ctx.db.query('chat_messages').collect())).toHaveLength(1);
  });

  test('la comprobación de conversación enviada exige el secreto', async () => {
    const t = convexTest(schema, modules);
    await seedCustomer(t, 'user_ana');
    const consulta = JSON.stringify({ clerkId: 'user_ana', messageIds: ['msg_1'] });

    const sinSecreto = await t.fetch('/internal/chat/continues-submitted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: consulta,
    });
    const conSecreto = await t.fetch('/internal/chat/continues-submitted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: consulta,
    });

    expect(sinSecreto.status).toBe(401);
    expect(conSecreto.status).toBe(200);
    expect(await conSecreto.json()).toEqual({ result: false });
  });
});
