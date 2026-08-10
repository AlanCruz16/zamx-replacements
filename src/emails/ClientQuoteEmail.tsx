import { Body, Container, Head, Heading, Html, Preview, Text } from 'react-email';
import * as React from 'react';
import { messagesFor, type Language } from '@/lib/messages';

interface ClientQuoteEmailProps {
  fullName: string;
  requestId: string;
  /**
   * El idioma del Customer, del registro. Llega como prop porque el correo lo
   * renderiza el servidor al enviarlo: no hay navegador ni cabecera a la que
   * preguntarle. Hasta el ticket 20 este correo salía siempre en español, así
   * que el Customer que había elegido inglés recibía respuestas en inglés en el
   * chat y luego esto.
   */
  language: Language;
}

export const ClientQuoteEmail = ({ fullName, requestId, language }: ClientQuoteEmailProps) => {
  const t = messagesFor(language).clientQuoteEmail;

  return (
    <Html lang={language}>
      <Head />
      <Preview>{t.preview(requestId)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{t.heading}</Heading>

          <Text style={text}>{t.greeting(fullName)}</Text>

          <Text style={text}>
            {t.attachedBefore}
            <strong>{requestId}</strong>
            {t.attachedAfter}
          </Text>

          <Text style={text}>{t.contents}</Text>

          <Text style={text}>{t.howToOrder}</Text>

          <Text style={text}>
            {t.closing}
            <br />
            {t.team}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default ClientQuoteEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '40px',
  margin: '0 0 20px',
  textAlign: 'center' as const,
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 20px',
};
