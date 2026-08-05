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

import type { NotifiableOutcome } from '../../convex/lib/outcome';

/**
 * Qué se le dice al Customer por cada Outcome que no lleva Quote Document.
 *
 * Son `Record` teclados por el Outcome y no un `switch` con rama por defecto:
 * añadir un Outcome notificable sin redactarlo rompe aquí en el typecheck, en
 * vez de mandarle un encabezado genérico y un cuerpo vacío. Cada mensaje termina
 * en lo que le toca hacer a él —a quién llamar, qué mandarnos—, que es lo único
 * que hace accionable un rechazo.
 */
const REASON_TITLE: Record<NotifiableOutcome, string> = {
  oem_restricted: 'Información sobre su equipo exclusivo (OEM)',
  discontinued: 'Aviso de obsolescencia de equipo',
  blocked_pending_info: 'Requerimos más información para su cotización',
};

const REASON_MESSAGE: Record<NotifiableOutcome, string> = {
  oem_restricted:
    'Después de revisar su solicitud, hemos identificado que el modelo o número de parte solicitado es un diseño exclusivo para el fabricante original del equipo (OEM). Por políticas de distribución, debe contactar directamente al fabricante de su máquina para obtener este reemplazo.',
  discontinued:
    'Lamentamos informarle que el equipo que ha solicitado se encuentra obsoleto y ha sido descontinuado de nuestro catálogo.',
  blocked_pending_info:
    'Para poder ofrecerle el reemplazo correcto y garantizar la compatibilidad, necesitamos que nos proporcione información adicional, preferentemente una fotografía clara de la placa de datos técnicos del ventilador actual.',
};

interface RejectedQuoteEmailProps {
  fullName: string;
  requestId: string;
  outcome: NotifiableOutcome;
  explanation?: string;
  /**
   * De dónde cuelgan el logo y el enlace de vuelta. Ausente cuando la
   * aplicación no tiene URL público configurado, y entonces el correo sale sin
   * ninguno de los dos: el mismo fallo que el ticket 17 le quitó al Quote
   * Document seguía aquí, cayendo a `http://localhost:3000`, de modo que el
   * Customer recibía el icono de imagen rota y un enlace a su propia máquina.
   * Un correo sin logo se lee; uno con una imagen rota parece una suplantación.
   */
  baseUrl?: string;
}

// Ni `fullName` ni `requestId` llevan valor por defecto: un `REQ-0000` de
// relleno convierte la falta de un dato en un correo que sale igual, con un
// folio que el Customer no puede citar y que no existe en ningún registro.
export const RejectedQuoteEmail = ({
  fullName,
  requestId,
  outcome,
  explanation = '',
  baseUrl,
}: RejectedQuoteEmailProps) => {
  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-[#f6f9fc] font-sans">
          <Container className="bg-white border border-gray-200 rounded-lg my-10 mx-auto p-8 max-w-2xl shadow-sm">
            {baseUrl && (
              <Section className="text-center mb-8">
                <Img
                  src={`${baseUrl}/logo_final.png`}
                  width="160"
                  alt="ZIEHL-ABEGG"
                  className="mx-auto"
                />
              </Section>
            )}

            <Heading className="text-[#00519E] text-2xl font-bold mb-4">
              {REASON_TITLE[outcome]}
            </Heading>

            <Text className="text-gray-700 text-base leading-relaxed">
              Estimado/a <strong>{fullName}</strong>,
            </Text>

            <Text className="text-gray-700 text-base leading-relaxed">
              En relación a su solicitud de cotización con folio <strong>{requestId}</strong>, le
              compartimos la siguiente información:
            </Text>

            <Section className="bg-gray-50 border-l-4 border-[#00519E] p-4 my-6">
              <Text className="text-gray-800 text-base m-0">{REASON_MESSAGE[outcome]}</Text>
              {explanation && (
                <Text className="text-gray-700 text-sm mt-4 italic">
                  <strong>Nota adicional de nuestro equipo:</strong> &quot;{explanation}&quot;
                </Text>
              )}
            </Section>

            {outcome === 'blocked_pending_info' && baseUrl && (
              <Section className="text-center my-8">
                <Link
                  href={baseUrl}
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
