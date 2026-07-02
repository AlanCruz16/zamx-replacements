import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { RejectedQuoteEmail } from '@/emails/RejectedQuoteEmail';
import { render } from 'react-email';
import React from 'react';

const resend = new Resend(process.env.RESEND_API_KEY);
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { quoteId, status, explanation } = await req.json();

    if (!quoteId || !status) {
      return NextResponse.json({ success: false, error: 'Faltan datos' }, { status: 400 });
    }

    // 1. Obtener la cotización y el usuario de Convex
    const data = await convex.query(api.quotes.getFullQuoteDetails, { requestId: quoteId });
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
        quoteId: quote.requestId || quoteId,
        status: status,
        explanation: explanation || quote.employeeExplanation,
        baseUrl,
      })
    );

    // 3. Enviar el correo usando Resend (sin PDF)
    const { data: resendData, error } = await resend.emails.send({
      from: 'ZAMX Cotizaciones <cotizaciones@za.idcn.com.mx>', // Cambiar en prod a @ziehl-abegg.com.mx
      to: [user.email], // Se envía al correo registrado por el cliente
      subject: `Actualización sobre su solicitud ZAMX-Q-${quote.requestId || quoteId}`,
      html: emailHtml,
    });

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    // 4. Marcar como notificado en Convex (reutilizamos la mutación o creamos una para evitar sobreescribir pdfs)
    await convex.mutation(api.quotes.markAsSentToClient, { quoteId: quote._id });

    return NextResponse.json({ success: true, resendData });
  } catch (error) {
    console.error('Error enviando correo de rechazo:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
