import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { RejectedQuoteEmail } from '@/emails/RejectedQuoteEmail';
import { isNotifiableOutcome } from '../../../../convex/lib/outcome';
import {
  authorizeInternalRequest,
  fetchQuoteDetails,
  markRejectionExplained,
} from '@/lib/internal-api';
import { QUOTE_SENDER } from '@/lib/addresses';
import { messagesFor, resolveLanguage } from '@/lib/messages';
import { render } from 'react-email';
import React from 'react';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const denied = authorizeInternalRequest(req);
    if (denied) {
      return NextResponse.json({ success: false, error: denied.error }, { status: denied.status });
    }

    // `requestId` es el código `REQ-XXXXXX` de la Replacement Request, no el
    // `_id` del registro: son dos identificadores distintos.
    const { requestId, outcome, explanation } = await req.json();

    if (!requestId || !outcome) {
      return NextResponse.json({ success: false, error: 'Faltan datos' }, { status: 400 });
    }

    // Sólo tres Outcomes se le comunican al Customer sin Quote Document. Con
    // cualquier otro valor la plantilla caía en su rama por defecto y mandaba un
    // correo con encabezado genérico y cuerpo vacío: el Customer se enteraba de
    // que pasó algo, pero no de qué ni de qué hacer.
    if (!isNotifiableOutcome(outcome)) {
      return NextResponse.json(
        { success: false, error: `Outcome no notificable al Customer: ${outcome}` },
        { status: 400 }
      );
    }

    // 1. Obtener usuario asociado a la cotización
    const data = await fetchQuoteDetails(requestId);
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Cotización o usuario no encontrados' },
        { status: 404 }
      );
    }

    const { quote, user } = data;
    // Sin URL público configurado no hay `http://localhost:3000` que valga: ese
    // logo y ese enlace sólo resuelven en la máquina de quien los escribió.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || undefined;

    // 2. Renderizar el HTML del Email, en el idioma del Customer: un rechazo
    // que llega en un idioma que no eligió le cuesta más de leer justo cuando
    // más necesita entender qué hacer (ticket 20).
    const language = resolveLanguage(user.preferredLanguage);
    const t = messagesFor(language);
    const emailHtml = await render(
      React.createElement(RejectedQuoteEmail, {
        fullName: user.fullName,
        requestId: quote.requestId || requestId,
        outcome,
        explanation: explanation || quote.approverExplanation,
        baseUrl,
        language,
      })
    );

    // 3. Enviar el correo usando Resend (sin PDF)
    const { data: resendData, error } = await resend.emails.send({
      from: QUOTE_SENDER,
      to: [user.email], // Se envía al correo registrado por el cliente
      // Mismo identificador que el cuerpo y que el resto del recorrido: el
      // `REQ-XXXXXX` a secas, sin un segundo esquema concatenado delante.
      subject: t.rejectedQuoteEmail.subject(quote.requestId || requestId),
      html: emailHtml,
    });

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    // 4. Registrar en Convex que se le explicó al Customer — su propia mutación,
    // no la del Quote Document: son dos hechos distintos del recorrido.
    await markRejectionExplained(quote._id);

    return NextResponse.json({ success: true, resendData });
  } catch (error) {
    console.error('Error enviando correo de rechazo:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
