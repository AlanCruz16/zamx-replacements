/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import * as chat from './chat';

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

    expect(publicas).toEqual(['currentConversation']);
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
});
