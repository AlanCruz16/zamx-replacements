import { NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { QuoteDocument } from '@/components/pdf/QuoteDocument';
import React from 'react';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const quoteId = searchParams.get('quoteId');

    if (!quoteId) {
      return new NextResponse('Falta quoteId', { status: 400 });
    }

    // 1. Obtener la cotización y el usuario de Convex
    const data = await convex.query(api.quotes.getFullQuoteDetails, { requestId: quoteId });
    if (!data) {
      return new NextResponse('Cotización o usuario no encontrados', { status: 404 });
    }

    const { quote, user } = data;

    // 2. Preparar los datos para el PDF
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const date = new Date(quote._creationTime).toLocaleDateString('es-MX');
    const validUntil = new Date(quote.expiresAt).toLocaleDateString('es-MX');

    const pdfProps = {
      quoteId: quote.quoteNumber || quoteId,
      requestId: quote.requestId,
      date,
      validUntil,
      clientInfo: {
        companyName: user.companyName,
        fullName: user.fullName,
        deliveryLocation: quote.products[0]?.deliveryLocation || '',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      products: quote.products.map((p: any) => ({
        partNumber: p.partNumber,
        model: p.model || '',
        quantity: p.quantity,
        priceUSD: p.pricePerUnitUSD || 0,
        subtotalUSD: (p.pricePerUnitUSD || 0) * p.quantity,
        deliveryWeeks: p.deliveryWeeks || 8,
      })),
      subtotal: quote.subtotalUSD,
      iva: quote.taxUSD || 0,
      total: quote.totalUSD || 0,
      employeeName: quote.confirmedByEmployee || 'Ventas ZAMX',
      employeeEmail: 'cotizaciones@ziehl-abegg.com.mx',
      baseUrl,
    };

    // 3. Renderizar el PDF a un Node Stream
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
