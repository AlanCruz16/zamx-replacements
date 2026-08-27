import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { renderToStream } from '@react-pdf/renderer';
import { QuoteDocument } from '@/components/pdf/QuoteDocument';
import { quoteDocumentProps } from '@/lib/quote-document-props';
import { fetchQuoteDetails } from '@/lib/internal-api';
import { messagesFor, resolveLanguage, DEFAULT_LANGUAGE } from '@/lib/messages';
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
      // Sin registro no hay Customer del que leer el idioma: se contesta en el
      // de la casa, que es lo mismo que hace el alta.
      return new NextResponse(messagesFor(DEFAULT_LANGUAGE).quotes.downloadNotFound, {
        status: 404,
      });
    }

    const { user } = data;
    const language = resolveLanguage(user.preferredLanguage);

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
    const pdfProps = quoteDocumentProps(data);
    if (!pdfProps) {
      return new NextResponse(messagesFor(language).quotes.downloadNoQuoteDocument, {
        status: 409,
      });
    }

    // 3. Renderizar el PDF a un Node Stream
    const stream = await renderToStream(React.createElement(QuoteDocument, pdfProps));

    // 4. Devolver la respuesta con los headers correctos para un PDF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${messagesFor(language).quoteDocument.fileNamePrefix}_${pdfProps.requestId}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generando PDF al vuelo:', error);
    return new NextResponse(String(error), { status: 500 });
  }
}
