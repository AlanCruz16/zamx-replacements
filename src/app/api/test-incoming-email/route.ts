import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { parseEmployeeResponse } from '@/lib/gemini-parser';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { requestId, employeeText } = await req.json();

    if (!requestId || !employeeText) {
      return NextResponse.json(
        { success: false, error: 'Falta requestId o employeeText' },
        { status: 400 }
      );
    }

    // 1. Get original quote context
    const quote = await convex.query(api.quotes.getByRequestId, { requestId });
    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Cotización no encontrada' },
        { status: 404 }
      );
    }

    // 2. Ask Gemini to interpret
    const interpretation = await parseEmployeeResponse(quote, employeeText);

    console.log('Gemini Interpretation:', interpretation);

    // 4. If confidence is too low, we mark it as pending_review instead of failing
    let finalClassification = interpretation.classification;
    if (interpretation.confidence < 0.7) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finalClassification = 'pending_review' as any;
    }

    // 5. Apply changes to Convex
    const result = await convex.mutation(api.quotes.processEmployeeResponse, {
      requestId,
      classification: finalClassification,
      explanation: interpretation.explanation,
      newPricesUSD: interpretation.newPricesUSD,
      newDeliveryWeeks: interpretation.newDeliveryWeeks,
    });

    return NextResponse.json({ success: true, interpretation, result });
  } catch (error) {
    console.error('Error processing email simulation:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requestId = searchParams.get('requestId');
    const employeeText = searchParams.get('employeeText');

    if (!requestId || !employeeText) {
      return NextResponse.json(
        { success: false, error: 'Usa query params: ?requestId=REQ-XXX&employeeText=mensaje' },
        { status: 400 }
      );
    }

    // Fake a Request object to reuse POST logic
    const fakeReq = new Request(req.url, {
      method: 'POST',
      body: JSON.stringify({ requestId, employeeText }),
    });

    return await POST(fakeReq);
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
