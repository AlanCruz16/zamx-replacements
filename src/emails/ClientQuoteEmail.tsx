import { Body, Container, Head, Heading, Html, Preview, Text } from 'react-email';
import * as React from 'react';

interface ClientQuoteEmailProps {
  fullName: string;
  quoteId: string;
}

export const ClientQuoteEmail = ({ fullName, quoteId }: ClientQuoteEmailProps) => (
  <Html>
    <Head />
    <Preview>Su cotización oficial de ZIEHL-ABEGG México ({quoteId})</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Cotización ZIEHL-ABEGG</Heading>

        <Text style={text}>Estimado/a {fullName},</Text>

        <Text style={text}>
          Agradecemos su interés en nuestros productos. Adjunto a este correo encontrará la
          cotización oficial **{quoteId}** correspondiente a su solicitud de piezas de reemplazo.
        </Text>

        <Text style={text}>
          El documento en formato PDF adjunto contiene el detalle de precios, tiempos de entrega y
          condiciones comerciales.
        </Text>

        <Text style={text}>
          Si tiene alguna duda o desea proceder con la orden de compra, use el correo proporcionado
          al final del documento PDF haciendo referencia al número de cotización.
        </Text>

        <Text style={text}>
          Atentamente,
          <br />
          El equipo de Ventas ZIEHL-ABEGG México
        </Text>
      </Container>
    </Body>
  </Html>
);

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
