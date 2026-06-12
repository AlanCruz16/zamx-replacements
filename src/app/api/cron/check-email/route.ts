import { NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';
import { parseEmployeeResponse } from '@/lib/gemini-parser';

// Deshabilita el cache agresivo de Next.js para esta ruta (siempre debe ejecutar código fresco)
export const dynamic = 'force-dynamic';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET() {
  if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
    return NextResponse.json(
      { success: false, error: 'Credenciales IMAP no configuradas' },
      { status: 500 }
    );
  }

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
        const subject = message.envelope.subject || '';
        const reqMatch = subject.match(/(REQ-[A-Z0-9]+)/i);
        if (reqMatch && message.uid) {
          const parsed = await simpleParser(message.source);
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
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignorar si no se puede cerrar
    }
  }

  // 2. Procesar con Gemini sin mantener el socket IMAP abierto (evita Timeouts)
  const successfulUids: number[] = [];

  for (const msg of messagesToProcess) {
    console.log(`Procesando email recibido para ${msg.requestId}`);
    try {
      const quote = await convex.query(api.quotes.getByRequestId, { requestId: msg.requestId });
      if (quote) {
        const interpretation = await parseEmployeeResponse(quote, msg.textBody);
        let finalClassification = interpretation.classification;
        if (interpretation.confidence < 0.7) {
          finalClassification = 'pending_review';
        }

        await convex.mutation(api.quotes.processEmployeeResponse, {
          requestId: msg.requestId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          classification: finalClassification as any,
          explanation: interpretation.explanation,
          newPricesUSD: interpretation.newPricesUSD,
          newDeliveryWeeks: interpretation.newDeliveryWeeks,
        });

        results.push({ requestId: msg.requestId, status: finalClassification });
        successfulUids.push(msg.uid);

        // Generar y enviar PDF si el empleado autorizó o modificó
        if (finalClassification === 'approved' || finalClassification === 'modified') {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          await fetch(`${baseUrl}/api/send-client-quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quoteId: msg.requestId }),
          }).catch((e) => console.error('Error trigger PDF:', e));
        }
      } else {
        console.log(`Cotización ${msg.requestId} no encontrada.`);
      }
    } catch (e) {
      console.error(`Error procesando con Gemini el REQ ${msg.requestId}:`, e);
    }
  }

  // 3. Reconectar brevemente para marcar como leídos los que tuvieron éxito
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
      } catch (e) {}
    }
  }

  return NextResponse.json({ success: true, processed: results.length, results });
}
