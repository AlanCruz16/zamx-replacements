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
} from '@react-email/components';
import * as React from 'react';

interface Product {
  partNumber: string;
  model: string;
  quantity: number;
  deliveryLocation: string;
  pricePerUnitUSD: number;
  deliveryWeeks: number;
  isUnknownPrefix?: boolean;
}

interface QuoteRequestEmailProps {
  requestId: string;
  userName: string;
  products: Product[];
  subtotalUSD: number;
  taxUSD: number;
  totalUSD: number;
}

export const QuoteRequestTemplate = ({
  requestId = 'REQ-123456',
  userName = 'Cliente Frecuente',
  products = [],
  subtotalUSD = 0,
  taxUSD = 0,
  totalUSD = 0,
}: QuoteRequestEmailProps) => {
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
              El cliente <strong>{userName}</strong> ha generado una nueva solicitud de cotización a
              través del portal de reemplazos.
            </Text>

            <Section className="bg-blue-50 p-4 rounded-md mb-4">
              <Text className="text-black text-[14px] leading-[24px] font-bold m-0">
                ID de Solicitud: {requestId}
              </Text>
            </Section>

            <Heading className="text-black text-[18px] font-normal mb-2">
              Productos Solicitados
            </Heading>

            <Hr className="border border-solid border-gray-200 my-[10px] mx-0" />

            {products.map((product, index) => (
              <Section key={index} className="mb-4">
                <Text className="text-black text-[14px] leading-[20px] m-0">
                  <strong>Modelo:</strong> {product.model}
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
                  * Precio sugerido: ${product.pricePerUnitUSD} USD | Entrega est.:{' '}
                  {product.deliveryWeeks} semanas
                </Text>
                {product.isUnknownPrefix && (
                  <Text className="text-amber-600 text-[13px] leading-[20px] m-0 font-semibold mt-1">
                    ⚠️ Atención: El número de parte / modelo no está en la lógica estándar de
                    precios.
                  </Text>
                )}
                <Hr className="border border-solid border-gray-100 my-[10px] mx-0" />
              </Section>
            ))}

            <Section className="bg-gray-50 p-4 rounded-md mt-4 text-right">
              <Text className="text-black text-[14px] leading-[20px] m-0">
                Subtotal estimado: ${subtotalUSD.toFixed(2)} USD
              </Text>
              <Text className="text-black text-[14px] leading-[20px] m-0">
                IVA (16%): ${taxUSD.toFixed(2)} USD
              </Text>
              <Text className="text-black text-[16px] leading-[24px] font-bold mt-2 mb-0">
                Total estimado: ${totalUSD.toFixed(2)} USD
              </Text>
            </Section>

            <Text className="text-black text-[14px] leading-[24px] mt-6">
              Por favor, revisa esta solicitud en el sistema para enviar la cotización formal al
              cliente.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default QuoteRequestTemplate;
