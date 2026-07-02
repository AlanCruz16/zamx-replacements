import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { Webhook } from 'svix';

const http = httpRouter();

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
