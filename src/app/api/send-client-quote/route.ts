import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { Resend } from 'resend';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { QuoteDocument } from '@/components/pdf/QuoteDocument';
import { ClientQuoteEmail } from '@/emails/ClientQuoteEmail';
import { confirmedQuoteLines } from '@/lib/confirmed-prices';
import { render } from 'react-email';
import React from 'react';

const resend = new Resend(process.env.RESEND_API_KEY);
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    if (req.headers.get('x-internal-secret') !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { quoteId } = await req.json();

    if (!quoteId) {
      return NextResponse.json({ success: false, error: 'Falta quoteId' }, { status: 400 });
    }

    // 1. Obtener la cotización y el usuario de Convex
    const data = await convex.query(api.quotes.getFullQuoteDetails, {
      requestId: quoteId,
      secret: process.env.INTERNAL_API_SECRET!,
    });
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Cotización o usuario no encontrados' },
        { status: 404 }
      );
    }

    const { quote, user } = data;

    // 2. Preparar los datos para el PDF. Sin Confirmed Price en todas las piezas
    // no hay Quote Document: un precio ausente no es cero.
    const lines = confirmedQuoteLines(quote.products);
    if (!lines) {
      return NextResponse.json(
        {
          success: false,
          error: 'La solicitud no tiene un precio confirmado para todas sus piezas',
        },
        { status: 409 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const date = new Date(quote._creationTime).toLocaleDateString('es-MX');
    const validUntil = new Date(quote.expiresAt).toLocaleDateString('es-MX');

    const pdfProps = {
      quoteId: quote.requestId || quoteId,
      requestId: quote.requestId,
      date,
      validUntil,
      clientInfo: {
        companyName: user.companyName,
        fullName: user.fullName,
        deliveryLocation: quote.products[0]?.deliveryLocation || '',
      },
      products: lines.products,
      subtotal: lines.totals.subtotalUSD,
      iva: lines.totals.taxUSD,
      total: lines.totals.totalUSD,
      employeeName: 'Ventas ZAMX',
      employeeEmail: 'cotizaciones@ziehl-abegg.com.mx',
      baseUrl,
    };

    // 3. Renderizar el PDF a Buffer
    // @ts-expect-error Incompatibilidad de tipos entre react-pdf y React 19
    const pdfBuffer = await renderToBuffer(React.createElement(QuoteDocument, pdfProps));

    // 4. Renderizar el HTML del Email
    const emailHtml = await render(
      React.createElement(ClientQuoteEmail, { fullName: user.fullName, quoteId: pdfProps.quoteId })
    );

    // 5. Enviar el correo usando Resend con el PDF adjunto
    const { data: resendData, error } = await resend.emails.send({
      from: 'ZAMX Cotizaciones <cotizaciones@za.idcn.com.mx>', // Cambiar en prod a @ziehl-abegg.com.mx
      to: [user.email], // Se envía al correo registrado por el cliente
      subject: `Su cotización ZAMX-Q-${pdfProps.quoteId} de ZIEHL-ABEGG México`,
      html: emailHtml,
      attachments: [
        {
          filename: `Cotizacion_${pdfProps.quoteId}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    // 6. Marcar como enviada en Convex
    await convex.mutation(api.quotes.markAsSentToClient, { quoteId: quote._id });

    return NextResponse.json({ success: true, resendData });
  } catch (error) {
    console.error('Error enviando PDF:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
