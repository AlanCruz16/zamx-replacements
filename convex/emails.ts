'use node';

import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { parseEmployeeResponse } from '../src/lib/gemini-parser';
import { isPricedOutcome } from './lib/outcome';
import { requireInternalSecret } from '../src/lib/internal-secret';

export const checkInbox = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
      console.error('Credenciales IMAP no configuradas');
      return;
    }

    // Una variable ausente no es una denegación: se nombra, para que la causa se
    // lea en el propio error en vez de disfrazarse de fallo del paso siguiente.
    const internalSecret = requireInternalSecret();

    const client = new ImapFlow({
      host: process.env.IMAP_HOST,
      port: parseInt(process.env.IMAP_PORT || '993', 10),
      secure: true,
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASSWORD,
      },
      logger: false,
    });

    const messagesToProcess: { uid: number; requestId: string; textBody: string }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const messages = client.fetch({ seen: false }, { source: true, envelope: true, uid: true });
        for await (const message of messages) {
          const subject = message.envelope?.subject || '';
          const reqMatch = subject.match(/(REQ-[A-Z0-9]+)/i);
          if (reqMatch && message.uid && message.source) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parsed: any = await simpleParser(message.source as any);
            messagesToProcess.push({
              uid: message.uid,
              requestId: reqMatch[1].toUpperCase(),
              textBody: parsed.text || '',
            });
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error('Error fetching IMAP:', err);
      return;
    } finally {
      try {
        await client.logout();
      } catch {
        // Ignorar
      }
    }

    const successfulUids: number[] = [];
    const uniqueMessagesMap = new Map<
      string,
      { uid: number; requestId: string; textBody: string }
    >();

    for (const msg of messagesToProcess) {
      if (
        !uniqueMessagesMap.has(msg.requestId) ||
        uniqueMessagesMap.get(msg.requestId)!.uid < msg.uid
      ) {
        if (uniqueMessagesMap.has(msg.requestId)) {
          successfulUids.push(uniqueMessagesMap.get(msg.requestId)!.uid);
        }
        uniqueMessagesMap.set(msg.requestId, msg);
      } else {
        successfulUids.push(msg.uid);
      }
    }

    const uniqueMessagesToProcess = Array.from(uniqueMessagesMap.values());

    for (const msg of uniqueMessagesToProcess) {
      console.log(`Procesando email recibido para ${msg.requestId}`);
      try {
        const quote = await ctx.runQuery(internal.quotes.getByRequestId, {
          requestId: msg.requestId,
        });
        if (quote) {
          // Un Outcome presente significa que ya se decidió. Su ausencia — y sólo
          // su ausencia — significa que sigue en revisión.
          if (quote.outcome !== undefined) {
            console.log(
              `La cotización ${msg.requestId} ya fue procesada (outcome: ${quote.outcome}).`
            );
            successfulUids.push(msg.uid);
            continue;
          }

          const interpretation = await parseEmployeeResponse(quote, msg.textBody);
          let finalClassification: string = interpretation.classification;
          if (interpretation.confidence < 0.7) {
            finalClassification = 'pending_review';
          }

          const { outcome } = await ctx.runMutation(internal.quotes.processEmployeeResponse, {
            requestId: msg.requestId,
            classification: finalClassification,
            explanation: interpretation.explanation,
            newPricesUSD: interpretation.newPricesUSD,
            newDeliveryWeeks: interpretation.newDeliveryWeeks,
          });

          results.push({ requestId: msg.requestId, outcome });
          successfulUids.push(msg.uid);

          const baseUrl = process.env.APP_URL;
          if (baseUrl) {
            if (baseUrl.includes('localhost')) {
              console.log(
                `Omitiendo envío de PDF para ${msg.requestId} porque estamos en localhost (Convex nube no puede resolverlo).`
              );
            } else {
              // El Outcome decide a quién se le avisa. Sin Outcome (confianza
              // baja o clasificación desconocida) no se avisa a nadie: la
              // Replacement Request sigue en revisión.
              if (isPricedOutcome(outcome)) {
                await fetch(`${baseUrl}/api/send-client-quote`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-internal-secret': internalSecret,
                  },
                  body: JSON.stringify({ requestId: msg.requestId }),
                }).catch((e) => console.error('Error trigger PDF:', e));
              } else if (outcome !== undefined) {
                await fetch(`${baseUrl}/api/send-rejection-email`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-internal-secret': internalSecret,
                  },
                  body: JSON.stringify({
                    requestId: msg.requestId,
                    outcome,
                    explanation: interpretation.explanation,
                  }),
                }).catch((e) => console.error('Error trigger Rejection Email:', e));
              }
            }
          } else {
            console.warn('APP_URL no está configurada, no se activarán los webhooks de PDF.');
          }
        } else {
          console.log(`Cotización ${msg.requestId} no encontrada.`);
        }
      } catch (e) {
        console.error(`Error procesando con Gemini el REQ ${msg.requestId}:`, e);
      }
    }

    if (successfulUids.length > 0) {
      const markClient = new ImapFlow({
        host: process.env.IMAP_HOST,
        port: parseInt(process.env.IMAP_PORT || '993', 10),
        secure: true,
        auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
        logger: false,
      });
      try {
        await markClient.connect();
        const lock = await markClient.getMailboxLock('INBOX');
        try {
          await markClient.messageFlagsAdd(successfulUids, ['\\Seen'], { uid: true });
        } finally {
          lock.release();
        }
      } catch (e) {
        console.error('Error marcando como leído:', e);
      } finally {
        try {
          await markClient.logout();
        } catch {}
      }
    }
  },
});
