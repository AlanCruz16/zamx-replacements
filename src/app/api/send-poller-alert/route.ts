import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { authorizeInternalRequest } from '@/lib/internal-api';
import { SUPPORT_SENDER } from '@/lib/addresses';
import { composePollerAlert, type PollerAlertPayload } from '@/lib/poller-alert';

/**
 * Avisa a `ADMIN_EMAIL` de que el sondeo del buzón lleva un rato sin poder
 * leerlo.
 *
 * El canal importa: Resend es una credencial distinta de IMAP, así que el
 * camino del aviso sigue en pie exactamente en el caso que rompe el sondeo. Por
 * eso el correo sale por aquí y no por el buzón que acaba de rechazar la
 * conexión.
 *
 * Quién decide si hay que avisar es la mutación que lleva la cuenta; aquí no se
 * vuelve a juzgar nada, sólo se manda lo que ya se decidió mandar.
 */

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const denied = authorizeInternalRequest(req);
    if (denied) {
      return NextResponse.json({ success: false, error: denied.error }, { status: denied.status });
    }

    const payload = (await req.json()) as Partial<PollerAlertPayload>;

    if (payload.kind !== 'authentication' && payload.kind !== 'connection') {
      return NextResponse.json(
        { success: false, error: 'Falta la clase de fallo' },
        { status: 400 }
      );
    }

    // Un aviso que no tiene a dónde ir es la misma clase de silencio que este
    // ticket viene a quitar, así que se dice en voz alta y con el nombre de la
    // variable que falta.
    const admin = process.env.ADMIN_EMAIL;
    if (!admin) {
      console.error('ADMIN_EMAIL no está configurado: el aviso del sondeo no tiene destinatario.');
      return NextResponse.json(
        { success: false, error: 'ADMIN_EMAIL no está configurado' },
        { status: 500 }
      );
    }

    const { subject, text } = composePollerAlert({
      kind: payload.kind,
      detail: payload.detail ?? 'sin detalle',
      failures: payload.failures ?? 0,
      silentForMs: payload.silentForMs ?? 0,
      lastSuccessAt: payload.lastSuccessAt,
    });

    const { data, error } = await resend.emails.send({
      from: SUPPORT_SENDER,
      to: [admin],
      subject,
      text,
    });

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    return NextResponse.json({ success: true, resendData: data });
  } catch (error) {
    console.error('Error avisando del sondeo caído:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
