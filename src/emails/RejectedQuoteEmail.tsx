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
import { messagesFor, type Language } from '@/lib/messages';

/**
 * Qué se le dice al Customer por cada Outcome que no lleva Quote Document vive
 * en `@/lib/messages`, en los dos idiomas.
 *
 * Siguen siendo `Record` teclados por el Outcome y no un `switch` con rama por
 * defecto: añadir un Outcome notificable sin redactarlo —en ambos idiomas—
 * rompe en el typecheck, en vez de mandarle al Customer un encabezado genérico
 * y un cuerpo vacío. Cada mensaje termina en lo que le toca hacer a él —a quién
 * llamar, qué mandarnos—, que es lo único que hace accionable un rechazo.
 */

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
  /**
   * El idioma del Customer, del registro. Como en el correo del Quote Document:
   * esto lo renderiza el servidor al enviarlo, así que no hay cabecera de la que
   * deducirlo.
   */
  language: Language;
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
  language,
}: RejectedQuoteEmailProps) => {
  const t = messagesFor(language).rejectedQuoteEmail;

  return (
    <Html lang={language}>
      <Head />
      <Tailwind>
        <Body className="bg-[#f6f9fc] font-sans">
          <Container className="bg-white border border-gray-200 rounded-lg my-10 mx-auto p-8 max-w-2xl shadow-sm">
            {baseUrl && (
              <Section className="text-center mb-8">
                <Img
                  src={`${baseUrl}/logo_final.png`}
                  width="160"
                  alt={t.logoAlt}
                  className="mx-auto"
                />
              </Section>
            )}

            <Heading className="text-[#00519E] text-2xl font-bold mb-4">
              {t.reasonTitle[outcome]}
            </Heading>

            <Text className="text-gray-700 text-base leading-relaxed">
              {t.greeting} <strong>{fullName}</strong>,
            </Text>

            <Text className="text-gray-700 text-base leading-relaxed">
              {t.introBefore}
              <strong>{requestId}</strong>
              {t.introAfter}
            </Text>

            <Section className="bg-gray-50 border-l-4 border-[#00519E] p-4 my-6">
              <Text className="text-gray-800 text-base m-0">{t.reasonMessage[outcome]}</Text>
              {explanation && (
                <Text className="text-gray-700 text-sm mt-4 italic">
                  <strong>{t.additionalNote}</strong> &quot;{explanation}&quot;
                </Text>
              )}
            </Section>

            {outcome === 'blocked_pending_info' && baseUrl && (
              <Section className="text-center my-8">
                <Link
                  href={baseUrl}
                  className="bg-[#00519E] text-white px-6 py-3 rounded-md font-semibold text-sm no-underline"
                >
                  {t.backToPlatform}
                </Link>
              </Section>
            )}

            <Text className="text-gray-700 text-base leading-relaxed">{t.replyInvitation}</Text>

            <Hr className="border-gray-200 my-8" />

            <Text className="text-gray-500 text-sm text-center">
              {t.automatedFooter}
              <br />
              {t.postalAddress}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default RejectedQuoteEmail;
