'use node';

import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { interpretApproverReply } from '../src/lib/gemini-parser';
import { isPricedOutcome } from './lib/outcome';
import { screenInboundMessage, verdictForReply, type InboundMessage } from './lib/reply_verdict';
import { approverAddresses } from './lib/approvers';
import { requireInternalSecret } from '../src/lib/internal-secret';

/** Un mensaje del buzón que ya pasó la criba, con lo que hace falta para juzgarlo. */
type InboundReply = InboundMessage & { uid: number; requestId: string };

/**
 * De quién viene el mensaje, para la lista de Approvers.
 *
 * Se prefiere `Return-Path`, que es donde el servidor receptor deja el remitente
 * real del sobre (el `MAIL FROM` de SMTP), sobre el `From:`, que lo escribe quien
 * manda y por tanto se puede poner a gusto. Ninguno de los dos es prueba por sí
 * solo: quien de verdad rechaza un remitente falsificado es el SPF/DKIM del
 * proveedor del buzón, antes de que este sondeo vea nada.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function senderOf(parsed: any, headerFrom: string | undefined): string {
  const returnPath = [parsed?.headers?.get('return-path')].flat()[0];
  const envelopeFrom =
    typeof returnPath === 'string' ? returnPath : returnPath?.value?.[0]?.address;

  return envelopeFrom || headerFrom || '';
}

/**
 * La cáscara de E/S: conecta al buzón, descarga, llama al intérprete y aplica lo
 * que el veredicto decidió. Ninguna regla vive aquí — están en
 * `lib/reply_verdict.ts`, fuera del alcance de IMAP, donde sí hay pruebas.
 */
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

    const approvers = approverAddresses();
    if (approvers.length === 0) {
      console.warn(
        'Sin APPROVER_EMAILS (ni ADMIN_EMAIL) configurado no hay lista de Approvers: ninguna respuesta se aplicará y los mensajes se quedarán sin leer.'
      );
    }

    const messagesToProcess: InboundReply[] = [];

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const messages = client.fetch({ seen: false }, { source: true, envelope: true, uid: true });
        for await (const message of messages) {
          if (!message.uid || !message.source) continue;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const parsed: any = await simpleParser(message.source as any);
          const inbound: InboundMessage = {
            envelopeSender: senderOf(parsed, message.envelope?.from?.[0]?.address),
            subject: message.envelope?.subject || '',
            textBody: parsed.text || '',
          };

          // Ni un mensaje ignorado ni uno rechazado entra en `successfulUids`:
          // los dos se quedan sin leer, que es lo que hace recuperable a un
          // Approver legítimo que falte en la lista.
          const screening = screenInboundMessage(inbound, approvers);
          if (screening.kind === 'ignored') continue;
          if (screening.kind === 'refused') {
            console.warn(
              `Respuesta a ${screening.requestId} descartada: ${screening.sender} no está en la lista de Approvers. Se deja sin leer.`
            );
            continue;
          }

          messagesToProcess.push({ ...inbound, uid: message.uid, requestId: screening.requestId });
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

    // Gana la primera respuesta, y también dentro de un mismo sondeo: de varias
    // respuestas al mismo folio se procesa la del uid más bajo — el uid de IMAP
    // crece con la llegada — y las demás se marcan leídas sin aplicarse. Quedarse
    // con la última era la misma revisión de una decisión ya tomada que la
    // mutación transaccional cierra entre sondeos.
    const firstReplyPerRequest = new Map<string, InboundReply>();

    for (const msg of messagesToProcess) {
      const kept = firstReplyPerRequest.get(msg.requestId);
      if (kept === undefined) {
        firstReplyPerRequest.set(msg.requestId, msg);
        continue;
      }

      const [first, later] = kept.uid <= msg.uid ? [kept, msg] : [msg, kept];
      firstReplyPerRequest.set(msg.requestId, first);
      successfulUids.push(later.uid);
    }

    for (const msg of firstReplyPerRequest.values()) {
      console.log(`Procesando email recibido para ${msg.requestId}`);
      try {
        const quote = await ctx.runQuery(internal.quotes.getByRequestId, {
          requestId: msg.requestId,
        });
        if (quote) {
          // El cuerpo entra al modelo como mensaje de usuario, nunca como
          // instrucción, y lo que vuelve son datos crudos: quien decide es el
          // veredicto, que es puro y sí está probado.
          const interpretation = await interpretApproverReply(quote, msg.textBody);
          const verdict = verdictForReply({
            message: msg,
            request: quote,
            interpretation,
            approverAddresses: approvers,
          });

          // La única escritura, y también la única comprobación de si ya había
          // Outcome: las dos ocurren dentro de esa transacción, no aquí. Este
          // sondeo puede solaparse con otro, y entre leer y escribir hay una
          // llamada al modelo por la red — comprobarlo desde fuera era la
          // carrera. Lo que quede por hacer se decide sobre lo que reporta.
          const transition = await ctx.runMutation(internal.quotes.processEmployeeResponse, {
            requestId: msg.requestId,
            outcome: verdict.outcome,
            explanation: verdict.explanation,
            // Se mandan todos los precios extraídos, como hasta ahora. El
            // ticket 10 es el que deja de aplicar los que el veredicto marcó
            // fuera de banda y le contesta al Approver.
            newPricesUSD: verdict.prices.map((p) => ({
              partNumber: p.partNumber,
              price: p.priceUSD,
            })),
            newDeliveryWeeks: verdict.deliveryWeeks,
          });

          successfulUids.push(msg.uid);

          // Gana la primera respuesta. Un correo posterior del mismo hilo no
          // revisa una decisión ya tomada, así que aquí no queda nada que
          // notificarle al Customer: lo que falta es decírselo al Approver, que
          // es el caso 3 del ticket 10. Se marca leído — dejarlo sin leer haría
          // que cada sondeo gastara otra llamada al modelo en lo mismo.
          if (transition.kind === 'already_settled') {
            console.log(
              `Respuesta a ${msg.requestId} no aplicada: ya tenía Outcome (${transition.outcome}).`
            );
            continue;
          }

          const outcome = transition.kind === 'settled' ? transition.outcome : undefined;

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
                    explanation: verdict.explanation,
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
