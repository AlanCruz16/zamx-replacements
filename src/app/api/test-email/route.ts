import { Resend } from 'resend';
import { QuoteRequestTemplate } from '@/emails/QuoteRequestTemplate';
import { NextResponse } from 'next/server';
import * as React from 'react';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  try {
    const { data, error } = await resend.emails.send({
      from: 'ZIEHL-ABEGG Reemplazos <onboarding@resend.dev>',
      to: ['adagocd@gmail.com'], // Correo del administrador
      subject: `[TEST] Nueva solicitud de cotización`,
      react: QuoteRequestTemplate({
        requestId: "REQ-TEST123",
        userName: "Cliente de Prueba",
        products: [
          {
            partNumber: "162562",
            model: "MK137-4DZ.07.U",
            quantity: 2,
            deliveryLocation: "CDMX",
            pricePerUnitUSD: 1050,
            deliveryWeeks: 6,
          }
        ],
        subtotalUSD: 2100,
        taxUSD: 336,
        totalUSD: 2436,
      }) as React.ReactElement,
    });

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Email enviado con éxito", data });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
