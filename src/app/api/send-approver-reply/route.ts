import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { authorizeInternalRequest } from '@/lib/internal-api';
import { QUOTE_SENDER } from '@/lib/addresses';
import { composeApproverReply, type ApproverReplyPayload } from '@/lib/approver-reply';
import { approverAddresses } from '../../../../convex/lib/approvers';
import { isApproverAddress } from '../../../../convex/lib/reply_verdict';

/**
 * Le contesta al Approver cuando el sistema no pudo actuar sobre su respuesta.
 *
 * Es correo interno sobre un hilo que el propio Approver empezó, no contacto
 * saliente con el Customer: no pide la confirmación por mensaje que sí exige el
 * camino del Customer. Lo que sí comprueba es el destinatario — la dirección
 * llega en el cuerpo, y sin la lista de Approvers de por medio esta ruta sería
 * un remitente de correo abierto para quien tuviera el secreto interno.
 *
 * Todo lo que se manda va en el cuerpo: quien decidió qué decir fue el
 * veredicto, aquí no se vuelve a juzgar la respuesta.
 */

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const denied = authorizeInternalRequest(req);
    if (denied) {
      return NextResponse.json({ success: false, error: denied.error }, { status: denied.status });
    }

    const { to, ...payload } = (await req.json()) as ApproverReplyPayload & { to?: string };

    if (!to || !payload.requestId || !payload.reason) {
      return NextResponse.json({ success: false, error: 'Faltan datos' }, { status: 400 });
    }

    if (!isApproverAddress(to, approverAddresses())) {
      // Se nombra la dirección: quien lea el registro tiene que poder ver a
      // dónde se intentó escribir.
      console.warn(`No se contesta a ${to}: no está en la lista de Approvers.`);
      return NextResponse.json(
        { success: false, error: 'El destinatario no está en la lista de Approvers' },
        { status: 403 }
      );
    }

    const { subject, text } = composeApproverReply(payload);

    // Una respuesta del Approver a este mensaje tiene que volver al buzón que
    // sondea el sistema, no a la dirección desde la que se manda. Si la variable
    // falta se dice en voz alta: el correo sale igual, pero la confirmación que
    // se le está pidiendo no volvería a entrar por el sondeo.
    const mailbox = process.env.IMAP_USER;
    if (!mailbox) {
      console.warn(
        'IMAP_USER no está configurado: la respuesta del Approver no volverá al buzón que sondea el sistema.'
      );
    }

    const { data, error } = await resend.emails.send({
      from: QUOTE_SENDER,
      to: [to],
      ...(mailbox ? { replyTo: mailbox } : {}),
      subject,
      text,
    });

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    return NextResponse.json({ success: true, resendData: data });
  } catch (error) {
    console.error('Error contestando al Approver:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
