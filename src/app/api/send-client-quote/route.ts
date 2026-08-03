import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { Resend } from 'resend';
import { QuoteDocument } from '@/components/pdf/QuoteDocument';
import { ClientQuoteEmail } from '@/emails/ClientQuoteEmail';
import { confirmedQuoteLines } from '@/lib/confirmed-prices';
import {
  authorizeInternalRequest,
  fetchQuoteDetails,
  markQuoteDocumentSent,
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

    // El código `REQ-XXXXXX` nombra la Replacement Request; `_id` es otra cosa,
    // y llamar a ambos `quoteId` es lo que hacía confusas estas rutas.
    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json({ success: false, error: 'Falta requestId' }, { status: 400 });
    }

    // 1. Obtener la cotización y el usuario de Convex
    const data = await fetchQuoteDetails(requestId);
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
      quoteId: quote.requestId || requestId,
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

    // 6. Registrar en Convex que el Quote Document salió
    await markQuoteDocumentSent(quote._id);

    return NextResponse.json({ success: true, resendData });
  } catch (error) {
    console.error('Error enviando PDF:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
