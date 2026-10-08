import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { renderToStream } from '@react-pdf/renderer';
import { QuoteDocument } from '@/components/pdf/QuoteDocument';
import { quoteDocumentProps } from '@/lib/quote-document-props';
import { fetchQuoteDetails } from '@/lib/internal-api';
import { messagesFor, resolveLanguage, DEFAULT_LANGUAGE } from '@/lib/messages';
import { isSupervisorPerConvex } from '@/lib/supervisor-access';
import React from 'react';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const quoteId = searchParams.get('quoteId');

    if (!quoteId) {
      return new NextResponse('Falta quoteId', { status: 400 });
    }

    const { userId, getToken } = await auth();
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

    // El idioma es siempre el del Customer, también cuando descarga un
    // Supervisor: el PDF tiene que ser el documento que el Customer recibió.
    const { user } = data;
    const language = resolveLanguage(user.preferredLanguage);

    // Dos caminos, y sólo dos. El del Customer: la identidad de Clerk es dueña
    // de la Replacement Request. El del Supervisor: Convex lo confirma con el
    // token de quien llama, así que `SUPERVISOR_EMAILS` no se vuelve a leer
    // aquí. La lectura de arriba es interna precisamente para que esta
    // comprobación sea la única puerta.
    const isOwner = user.clerkId === userId;
    if (!isOwner && !(await supervisorOrNot(getToken))) {
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

/**
 * Si Convex no contesta, quien no es dueño recibe la negativa de siempre: un
 * 401, no un 500 con el texto del error dentro.
 */
async function supervisorOrNot(
  getToken: Parameters<typeof isSupervisorPerConvex>[0]
): Promise<boolean> {
  try {
    return await isSupervisorPerConvex(getToken);
  } catch (error) {
    console.error('No se pudo preguntar a Convex si es Supervisor:', error);
    return false;
  }
}
