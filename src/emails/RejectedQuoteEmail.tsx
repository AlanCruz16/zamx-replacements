import React from 'react';
import {
  Html,
  Body,
  Head,
  Heading,
  Container,
  Text,
  Section,
  Img,
  Tailwind,
  Hr,
  Link,
} from 'react-email';

/** Los Outcomes que se le comunican al Customer sin Quote Document. */
export type NotifiableOutcome = 'oem_restricted' | 'discontinued' | 'blocked_pending_info';

interface RejectedQuoteEmailProps {
  fullName: string;
  quoteId: string;
  outcome: NotifiableOutcome;
  explanation?: string;
  baseUrl?: string;
}

export const RejectedQuoteEmail = ({
  fullName = 'Cliente',
  quoteId = 'REQ-0000',
  outcome,
  explanation = '',
  baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
}: RejectedQuoteEmailProps) => {
  const getReasonTitle = () => {
    switch (outcome) {
      case 'oem_restricted':
        return 'Información sobre su equipo exclusivo (OEM)';
      case 'discontinued':
        return 'Aviso de obsolescencia de equipo';
      case 'blocked_pending_info':
        return 'Requerimos más información para su cotización';
      default:
        return 'Actualización de Cotización';
    }
  };

  const getReasonMessage = () => {
    switch (outcome) {
      case 'oem_restricted':
        return 'Después de revisar su solicitud, hemos identificado que el modelo o número de parte solicitado es un diseño exclusivo para el fabricante original del equipo (OEM). Por políticas de distribución, debe contactar directamente al fabricante de su máquina para obtener este reemplazo.';
      case 'discontinued':
        return 'Lamentamos informarle que el equipo que ha solicitado se encuentra obsoleto y ha sido descontinuado de nuestro catálogo.';
      case 'blocked_pending_info':
        return 'Para poder ofrecerle el reemplazo correcto y garantizar la compatibilidad, necesitamos que nos proporcione información adicional, preferentemente una fotografía clara de la placa de datos técnicos del ventilador actual.';
      default:
        return '';
    }
  };

  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-[#f6f9fc] font-sans">
          <Container className="bg-white border border-gray-200 rounded-lg my-10 mx-auto p-8 max-w-2xl shadow-sm">
            <Section className="text-center mb-8">
              <Img
                src={`${baseUrl}/logo_final.png`}
                width="160"
                alt="ZIEHL-ABEGG"
                className="mx-auto"
              />
            </Section>

            <Heading className="text-[#00519E] text-2xl font-bold mb-4">{getReasonTitle()}</Heading>

            <Text className="text-gray-700 text-base leading-relaxed">
              Estimado/a <strong>{fullName}</strong>,
            </Text>

            <Text className="text-gray-700 text-base leading-relaxed">
              En relación a su solicitud de cotización con folio <strong>{quoteId}</strong>, le
              compartimos la siguiente información:
            </Text>

            <Section className="bg-gray-50 border-l-4 border-[#00519E] p-4 my-6">
              <Text className="text-gray-800 text-base m-0">{getReasonMessage()}</Text>
              {explanation && (
                <Text className="text-gray-700 text-sm mt-4 italic">
                  <strong>Nota adicional de nuestro equipo:</strong> &quot;{explanation}&quot;
                </Text>
              )}
            </Section>

            {outcome === 'blocked_pending_info' && (
              <Section className="text-center my-8">
                <Link
                  href={`${baseUrl}`}
                  className="bg-[#00519E] text-white px-6 py-3 rounded-md font-semibold text-sm no-underline"
                >
                  Regresar a la plataforma
                </Link>
              </Section>
            )}

            <Text className="text-gray-700 text-base leading-relaxed">
              Si tiene alguna duda o requiere asistencia técnica adicional, no dude en responder a
              este correo.
            </Text>

            <Hr className="border-gray-200 my-8" />

            <Text className="text-gray-500 text-sm text-center">
              Este es un correo automático generado por ZIEHL-ABEGG México.
              <br />
              4971 Millennium Drive, Winston-Salem NC 27107
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default RejectedQuoteEmail;
