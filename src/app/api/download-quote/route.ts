import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { renderToStream } from '@react-pdf/renderer';
import { QuoteDocument } from '@/components/pdf/QuoteDocument';
import { quoteDocumentLines } from '@/lib/quote-document';
import { fetchQuoteDetails } from '@/lib/internal-api';
import React from 'react';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const quoteId = searchParams.get('quoteId');

    if (!quoteId) {
      return new NextResponse('Falta quoteId', { status: 400 });
    }

    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 1. Obtener la cotización y el usuario de Convex
    const data = await fetchQuoteDetails(quoteId);

    if (!data) {
      return new NextResponse('Cotización o usuario no encontrados', { status: 404 });
    }

    const { quote, user } = data;

    // Camino del Customer: la identidad de Clerk tiene que ser dueña de la
    // Replacement Request. La lectura de arriba es interna precisamente para que
    // esta comprobación sea la única puerta.
    if (user.clerkId !== userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 2. Preparar los datos para el PDF. Que exista un Quote Document es una
    // pregunta con dos mitades — el Outcome y los Confirmed Prices — y se hace
    // aquí, en el servidor, porque esta ruta se alcanza directa aunque el enlace
    // esté escondido.
    const lines = quoteDocumentLines(quote);
    if (!lines) {
      return new NextResponse('Esta Replacement Request no tiene Quote Document', {
        status: 409,
      });
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

    // 3. Renderizar el PDF a un Node Stream
    // @ts-expect-error Incompatibilidad de tipos entre react-pdf y React 19
    const stream = await renderToStream(React.createElement(QuoteDocument, pdfProps));

    // 4. Devolver la respuesta con los headers correctos para un PDF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Cotizacion_${pdfProps.quoteId}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generando PDF al vuelo:', error);
    return new NextResponse(String(error), { status: 500 });
  }
}
