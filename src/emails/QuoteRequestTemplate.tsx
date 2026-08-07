import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
  Tailwind,
} from 'react-email';
import * as React from 'react';
import { usd } from '@/lib/money';
import { quoteWords, vocabularyFor } from '@/lib/reply-vocabulary';

interface Product {
  partNumber: string;
  model: string;
  quantity: number;
  deliveryLocation: string;
  /** Ausente => ningún Model Prefix coincidió: el Approver debe poner precio a mano. */
  suggestedPriceUSD?: number;
  suggestedDeliveryWeeksMin: number;
  suggestedDeliveryWeeksMax: number;
}

/**
 * Con quién hablar cuando la solicitud es ambigua. Va entero a propósito: sin
 * teléfono ni correo, un Approver ante una petición dudosa sólo puede adivinar o
 * pedirle al sistema que le pregunte al Customer, y ninguna de las dos cosas
 * resuelve una llamada de dos minutos.
 */
interface Customer {
  fullName: string;
  companyName: string;
  email: string;
  /** Ausente => el Customer no lo dio; se dice así en vez de dejar el hueco. */
  phone?: string;
}

interface QuoteRequestEmailProps {
  requestId: string;
  customer: Customer;
  products: Product[];
  subtotalUSD: number;
  taxUSD: number;
  totalUSD: number;
}

export const QuoteRequestTemplate = ({
  requestId = 'REQ-123456',
  // Valores de la vista previa de react-email. La ruta del chat siempre manda
  // los de verdad; están aquí para que la plantilla se pueda abrir sola.
  customer = {
    fullName: 'Ana Márquez',
    companyName: 'Refrigeración del Norte',
    email: 'ana@refrinorte.mx',
    phone: '+52 81 1234 5678',
  },
  products = [],
  subtotalUSD = 0,
  taxUSD = 0,
  totalUSD = 0,
}: QuoteRequestEmailProps) => {
  const unpriceable = products.filter((p) => p.suggestedPriceUSD === undefined);

  /**
   * El ejemplo de las instrucciones se toma de la primera pieza de esta misma
   * solicitud, precio incluido. Una cifra inventada era peor que ninguna: un
   * Approver que copia el ejemplo mandaría un precio sin relación con el
   * Suggested Price de su pieza, y la banda del ticket 10 lo rechazaría por
   * fuera de rango — el ejemplo del propio correo produciría el error que el
   * correo existe para evitar.
   */
  const first = products[0];
  const examplePriceLine = `${first?.partNumber ?? 'NÚMERO DE PARTE'}: ${
    first?.suggestedPriceUSD === undefined ? '$PRECIO USD' : usd(first.suggestedPriceUSD)
  }`;

  /**
   * Las palabras que se le enseñan salen de `reply-vocabulary.ts`, el mismo
   * sitio del que las lee el prompt del intérprete. Escritas aquí a mano se
   * separaron de lo que leía la respuesta, y un «Aprobado» dejó de clasificar
   * (ticket 28). Cambiar una palabra en la tabla la cambia en los dos lados o
   * rompe la prueba que los compara.
   */
  const approved = vocabularyFor('priced_as_suggested');
  const changed = vocabularyFor('priced_differently');
  const oem = vocabularyFor('oem_restricted');
  const discontinued = vocabularyFor('discontinued');
  const pendingInfo = vocabularyFor('blocked_pending_info');

  return (
    <Html>
      <Head />
      <Preview>Nueva solicitud de cotización: {requestId}</Preview>
      <Tailwind>
        <Body className="bg-gray-100 my-auto mx-auto font-sans px-2">
          <Container className="border border-solid border-gray-200 rounded my-[40px] mx-auto p-[20px] max-w-[600px] bg-white">
            <Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0">
              <strong>ZIEHL-ABEGG</strong>
            </Heading>
            <Text className="text-black text-[14px] leading-[24px]">Hola equipo de ventas,</Text>
            <Text className="text-black text-[14px] leading-[24px]">
              El cliente <strong>{customer.fullName}</strong> ha generado una nueva solicitud de
              cotización a través del portal de reemplazos.
            </Text>

            <Section className="bg-blue-50 p-4 rounded-md mb-4">
              <Text className="text-black text-[14px] leading-[24px] font-bold m-0">
                ID de Solicitud: {requestId}
              </Text>
            </Section>

            <Heading className="text-black text-[18px] font-normal mb-2">Datos del Cliente</Heading>

            <Hr className="border border-solid border-gray-200 my-[10px] mx-0" />

            <Section className="mb-4">
              <Text className="text-black text-[14px] leading-[20px] m-0">
                <strong>Nombre:</strong> {customer.fullName}
              </Text>
              <Text className="text-black text-[14px] leading-[20px] m-0">
                <strong>Empresa:</strong> {customer.companyName}
              </Text>
              <Text className="text-black text-[14px] leading-[20px] m-0">
                <strong>Email:</strong> {customer.email}
              </Text>
              <Text className="text-black text-[14px] leading-[20px] m-0">
                <strong>Teléfono:</strong> {customer.phone ?? 'no proporcionado'}
              </Text>
            </Section>

            <Heading className="text-black text-[18px] font-normal mb-2">
              Productos Solicitados
            </Heading>

            <Hr className="border border-solid border-gray-200 my-[10px] mx-0" />

            {products.map((product, index) => (
              <Section key={index} className="mb-4">
                <Text className="text-black text-[14px] leading-[20px] m-0">
                  <strong>Producto {index + 1} — Modelo:</strong> {product.model}
                </Text>
                <Text className="text-black text-[14px] leading-[20px] m-0">
                  <strong>Nº Parte:</strong> {product.partNumber}
                </Text>
                <Text className="text-black text-[14px] leading-[20px] m-0">
                  <strong>Cantidad:</strong> {product.quantity}
                </Text>
                <Text className="text-black text-[14px] leading-[20px] m-0">
                  <strong>Lugar de Entrega:</strong> {product.deliveryLocation}
                </Text>
                <Text className="text-gray-600 text-[13px] leading-[20px] m-0 italic">
                  {`* Precio sugerido: ${
                    product.suggestedPriceUSD === undefined
                      ? 'ninguno'
                      : `${usd(product.suggestedPriceUSD)} por unidad`
                  } | Entrega est.: ${product.suggestedDeliveryWeeksMin}–${
                    product.suggestedDeliveryWeeksMax
                  } semanas`}
                </Text>
                {product.suggestedPriceUSD === undefined && (
                  <Text className="text-amber-600 text-[13px] leading-[20px] m-0 font-semibold mt-1">
                    ⚠️ Sin precio sugerido: el modelo no coincide con ningún rango de precios
                    configurado. Responde con un precio para esta pieza.
                  </Text>
                )}
                <Hr className="border border-solid border-gray-100 my-[10px] mx-0" />
              </Section>
            ))}

            <Section className="bg-gray-50 p-4 rounded-md mt-4 text-right">
              <Text className="text-black text-[14px] leading-[20px] m-0">
                {`Subtotal estimado: ${usd(subtotalUSD)}`}
              </Text>
              <Text className="text-black text-[14px] leading-[20px] m-0">
                {`IVA (16%): ${usd(taxUSD)}`}
              </Text>
              <Text className="text-black text-[16px] leading-[24px] font-bold mt-2 mb-0">
                {`Total estimado: ${usd(totalUSD)}`}
              </Text>
              {unpriceable.length > 0 && (
                <Text className="text-amber-600 text-[13px] leading-[20px] mt-2 mb-0">
                  Estos totales excluyen las piezas sin precio sugerido.
                </Text>
              )}
            </Section>

            {/*
              Las instrucciones para responder. El intérprete del correo entrante
              es el eslabón menos fiable de la cadena, y decirle al Approver cómo
              redactar sale mucho más barato que mejorar el análisis del texto.
              Hay una frase por cada Outcome del glosario, ni una más.
            */}
            <Heading className="text-black text-[18px] font-normal mt-6 mb-2">
              Cómo responder
            </Heading>

            <Hr className="border border-solid border-gray-200 my-[10px] mx-0" />

            <Section className="mb-2">
              <Text className="text-black text-[13px] leading-[20px] m-0">
                Responde a este mismo correo. Basta con texto normal — no hay formulario. Todas las
                cifras de arriba están en dólares estadounidenses (USD); responde en USD.
              </Text>
            </Section>

            <Section className="mb-4">
              <Text className="text-black text-[13px] leading-[20px] mt-3 mb-0">
                <strong>✅ Si apruebas todos los precios y tiempos sugeridos</strong>
              </Text>
              <Text className="text-gray-700 text-[13px] leading-[20px] m-0">
                {`Responde: ${quoteWords(approved.taught)}.`}
              </Text>

              <Text className="text-black text-[13px] leading-[20px] mt-3 mb-0">
                <strong>✏️ Si quieres otro precio</strong>
              </Text>
              <Text className="text-gray-700 text-[13px] leading-[20px] m-0">
                {`Una línea por pieza, con su número de parte y el precio en USD, así: «${examplePriceLine}» — esa es la cifra sugerida, cámbiala por la tuya. Sólo las piezas que menciones cambian.`}
              </Text>

              <Text className="text-black text-[13px] leading-[20px] mt-3 mb-0">
                <strong>📦 Si quieres otro tiempo de entrega</strong>
              </Text>
              <Text className="text-gray-700 text-[13px] leading-[20px] m-0">
                {/*
                  Un plazo, no uno por pieza, porque es lo que el registro puede
                  guardar: `processEmployeeResponse` aplica un único
                  `newDeliveryWeeks` a todos los productos. Prometer aquí un
                  plazo por pieza haría que un Approver que da dos viera cómo uno
                  de los dos se estampa sobre el otro sin decir nada.

                  Y sin la palabra «aprobado» a propósito: un plazo nuevo es un
                  cambio, y una respuesta que dice las dos cosas se queda en el
                  camino de la aprobación en bloque, donde el plazo se descarta.
                */}
                {`Dilo una vez para toda la solicitud: ${quoteWords(changed.taught)}. Es un plazo para todas las piezas; el sistema no guarda uno distinto por pieza.`}
              </Text>

              {/*
                Estas tres salidas son de la Replacement Request entera, no de una
                pieza: el Outcome es un solo campo del registro. Se dice aquí
                porque una solicitud de varias piezas invita a leerlo al revés.
              */}
              <Text className="text-black text-[13px] leading-[20px] mt-3 mb-0">
                <strong>❌ Si es exclusiva del fabricante</strong>
              </Text>
              <Text className="text-gray-700 text-[13px] leading-[20px] m-0">
                {`Responde: ${quoteWords(oem.taught)}. Cierra la solicitud entera, sin cotización.`}
              </Text>

              <Text className="text-black text-[13px] leading-[20px] mt-3 mb-0">
                <strong>🚫 Si está descontinuada u obsoleta</strong>
              </Text>
              <Text className="text-gray-700 text-[13px] leading-[20px] m-0">
                {`Responde: ${quoteWords(discontinued.taught)}. Cierra la solicitud entera, sin cotización.`}
              </Text>

              <Text className="text-black text-[13px] leading-[20px] mt-3 mb-0">
                <strong>❓ Si falta información del cliente</strong>
              </Text>
              <Text className="text-gray-700 text-[13px] leading-[20px] m-0">
                {`Responde: ${quoteWords(pendingInfo.taught)} y a continuación qué necesitas saber.`}
              </Text>
            </Section>

            {unpriceable.length > 0 && (
              <Section className="bg-amber-50 p-4 rounded-md mb-4">
                <Text className="text-amber-700 text-[13px] leading-[20px] m-0 font-semibold">
                  {`⚠️ El sistema no pudo cotizar ${
                    unpriceable.length === 1 ? 'esta pieza' : 'estas piezas'
                  }: ${unpriceable.map((p) => `${p.partNumber} (${p.model})`).join(', ')}.`}
                </Text>
                {/*
                  Sin decirle que «marque la pieza» como OEM o descontinuada: el
                  Outcome es de la Replacement Request entera, así que esa
                  respuesta dejaría también sin cotizar las piezas que sí tienen
                  precio. Lo que se le pide es lo único que hay: un precio, o
                  esas salidas sabiendo que se llevan la solicitud completa.
                */}
                <Text className="text-amber-700 text-[13px] leading-[20px] m-0 mt-1">
                  {`Sin un precio tuyo en USD para ${
                    unpriceable.length === 1 ? 'ella' : 'ellas'
                  } la solicitud no puede cotizarse. Si la pieza no se puede vender, responde ${quoteWords(
                    [...oem.taught, ...discontinued.taught]
                  )} — eso cierra la solicitud completa, incluidas las demás piezas.`}
                </Text>
              </Section>
            )}

            <Text className="text-gray-600 text-[12px] leading-[20px] mt-4">
              Tu respuesta a este correo es lo que fija la decisión: la primera que llegue es la que
              cuenta. Si algo no se pudo aplicar, el sistema te lo contestará.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default QuoteRequestTemplate;
