import { httpRouter } from 'convex/server';
import { httpAction, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import { Webhook } from 'svix';
import type { Id } from './_generated/dataModel';
import { authorizeInternalRequest } from '../src/lib/internal-secret';

const http = httpRouter();

/**
 * Ruta máquina a máquina: la única frontera por la que un llamador de fuera de
 * Convex alcanza una función interna. El secreto viaja en una cabecera, nunca
 * como argumento de una función, y la regla que lo juzga es la misma que
 * aplican el middleware y los route handlers de Next — se importa de
 * `src/lib/internal-secret` en vez de reescribirla aquí.
 */
function internalRoute(
  // El cuerpo llega sin tipar desde la red; quien valida es el validador de
  // argumentos de la función interna a la que se delega.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (body: any, ctx: ActionCtx) => Promise<unknown>
) {
  return httpAction(async (ctx, req) => {
    const denied = authorizeInternalRequest(req);
    if (denied) {
      return Response.json({ error: denied.error }, { status: denied.status });
    }

    try {
      const body = await req.json();
      const result = await handler(body, ctx);
      return Response.json({ result: result ?? null });
    } catch (error) {
      console.error('Error en ruta interna:', error);
      return Response.json({ error: String(error) }, { status: 500 });
    }
  });
}

http.route({
  path: '/internal/quotes/create',
  method: 'POST',
  handler: internalRoute((body, ctx) =>
    ctx.runMutation(internal.quotes.create, {
      clerkId: body.clerkId,
      products: body.products,
    })
  ),
});

http.route({
  path: '/internal/quotes/details',
  method: 'POST',
  handler: internalRoute((body, ctx) =>
    ctx.runQuery(internal.quotes.getFullQuoteDetails, { requestId: body.requestId })
  ),
});

http.route({
  path: '/internal/quotes/quote-document-sent',
  method: 'POST',
  handler: internalRoute((body, ctx) =>
    ctx.runMutation(internal.quotes.markQuoteDocumentSent, {
      quoteId: body.quoteId as Id<'quotes'>,
    })
  ),
});

http.route({
  path: '/internal/quotes/rejection-explained',
  method: 'POST',
  handler: internalRoute((body, ctx) =>
    ctx.runMutation(internal.quotes.markRejectionExplained, {
      quoteId: body.quoteId as Id<'quotes'>,
    })
  ),
});

http.route({
  path: '/internal/rate-limit/consume',
  method: 'POST',
  handler: internalRoute((body, ctx) =>
    ctx.runMutation(internal.rate_limit.consumeChat, { clerkId: body.clerkId })
  ),
});

http.route({
  path: '/clerk',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const payloadString = await req.text();
    const headerPayload = req.headers;

    try {
      const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
      if (!webhookSecret) {
        throw new Error('Missing CLERK_WEBHOOK_SECRET. Cannot verify webhook.');
      }

      const wh = new Webhook(webhookSecret);
      const evt = wh.verify(payloadString, {
        'svix-id': headerPayload.get('svix-id')!,
        'svix-timestamp': headerPayload.get('svix-timestamp')!,
        'svix-signature': headerPayload.get('svix-signature')!,
      }) as Record<string, unknown>;

      if (evt.type === 'user.created' || evt.type === 'user.updated') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { id, first_name, last_name, email_addresses } = evt.data as any;
        const fullName = [first_name, last_name].filter(Boolean).join(' ');
        const email =
          email_addresses && email_addresses.length > 0 ? email_addresses[0].email_address : '';

        await ctx.runMutation(internal.users.upsertFromClerk, {
          clerkId: id,
          fullName: fullName || '',
          email: email,
        });
      }

      return new Response(null, {
        status: 200,
      });
    } catch (err) {
      console.error('Webhook Error:', err);
      return new Response('Webhook Error', {
        status: 400,
      });
    }
  }),
});

export default http;
