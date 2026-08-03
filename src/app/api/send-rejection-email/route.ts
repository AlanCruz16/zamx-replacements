import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { RejectedQuoteEmail } from '@/emails/RejectedQuoteEmail';
import {
  authorizeInternalRequest,
  fetchQuoteDetails,
  markRejectionExplained,
} from '@/lib/internal-api';
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

    // 1. Obtener usuario asociado a la cotización
    const data = await fetchQuoteDetails(requestId);
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Cotización o usuario no encontrados' },
        { status: 404 }
      );
    }

    const { quote, user } = data;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // 2. Renderizar el HTML del Email
    const emailHtml = await render(
      React.createElement(RejectedQuoteEmail, {
        fullName: user.fullName,
        quoteId: quote.requestId || requestId,
        outcome,
        explanation: explanation || quote.approverExplanation,
        baseUrl,
      })
    );

    // 3. Enviar el correo usando Resend (sin PDF)
    const { data: resendData, error } = await resend.emails.send({
      from: 'ZAMX Cotizaciones <cotizaciones@za.idcn.com.mx>', // Cambiar en prod a @ziehl-abegg.com.mx
      to: [user.email], // Se envía al correo registrado por el cliente
      subject: `Actualización sobre su solicitud ZAMX-Q-${quote.requestId || requestId}`,
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
