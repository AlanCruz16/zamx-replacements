import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

// Formateador de moneda
const formatCurrency = (value: number) => {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#333333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  leftHeader: {
    width: '45%',
  },
  rightHeader: {
    width: '55%',
    alignItems: 'flex-end',
  },
  topLogoContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  logo: {
    width: 160,
  },
  smallGrayText: {
    fontSize: 8,
    color: '#888888',
    marginBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    fontFamily: 'Helvetica-Bold',
  },
  customerData: {
    marginTop: 10,
  },
  compactText: {
    marginBottom: 2,
  },
  metaData: {
    marginTop: 10,
    lineHeight: 1.4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  metaLabel: {
    width: 90,
    textAlign: 'left',
    marginRight: 5,
  },
  metaValue: {
    width: 170,
    textAlign: 'left',
  },
  dateBanner: {
    backgroundColor: '#F0F0F0',
    padding: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  greeting: {
    marginBottom: 15,
    lineHeight: 1.4,
  },
  validUntilBanner: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 15,
  },
  validLabel: {
    marginRight: 20,
  },
  table: {
    width: '100%',
    marginBottom: 15,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 5,
    marginBottom: 5,
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
  },
  colPos: { width: '10%' },
  colQty: { width: '15%' },
  colItem: { width: '35%' },
  colPrice: { width: '20%', textAlign: 'right' },
  colTotal: { width: '20%', textAlign: 'right' },
  deliveryText: {
    fontFamily: 'Helvetica-Bold',
    marginBottom: 15,
  },
  totalsContainer: {
    width: '50%',
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalRowBold: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    fontFamily: 'Helvetica-Bold',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#DDDDDD',
    paddingTop: 5,
    lineHeight: 1.2,
  },
  signatureName: {
    marginTop: 5,
    fontFamily: 'Helvetica-Bold',
  },
  automatedNote: {
    fontSize: 8,
    color: '#888888',
    marginBottom: 2,
  },
  confidential: {
    fontSize: 8,
    color: '#888888',
  },
});

interface QuoteDocumentProps {
  quoteId: string;
  requestId: string;
  date: string;
  validUntil: string;
  clientInfo: {
    companyName: string;
    fullName: string;
    deliveryLocation: string;
  };
  products: {
    partNumber: string;
    model: string;
    quantity: number;
    priceUSD: number;
    subtotalUSD: number;
    deliveryWeeksMin: number;
    deliveryWeeksMax: number;
  }[];
  subtotal: number;
  iva: number;
  total: number;
  employeeName: string;
  employeeEmail: string;
  baseUrl: string; // Para cargar el logo dinámicamente
}

export const QuoteDocument: React.FC<QuoteDocumentProps> = ({
  quoteId,
  requestId,
  date,
  validUntil,
  clientInfo,
  products,
  subtotal,
  iva,
  total,
  employeeName,
  employeeEmail,
  baseUrl,
}) => {
  const logoUrl = `${baseUrl}/logo_final.png`;
  // La Delivery Estimate se cotiza como rango de semanas enteras, y es de cada
  // pieza: colapsar rangos distintos a un mínimo y un máximo globales anunciaría
  // un rango que ninguna pieza tiene.
  const sharedDelivery = products.every(
    (p) =>
      p.deliveryWeeksMin === products[0].deliveryWeeksMin &&
      p.deliveryWeeksMax === products[0].deliveryWeeksMax
  )
    ? products[0]
    : undefined;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* TOP LOGO */}
        <View style={styles.topLogoContainer}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoUrl} style={styles.logo} />
        </View>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.leftHeader}>
            <Text style={styles.smallGrayText}>
              ZIEHL-ABEGG MEXICO | San Pedro Garza García, NL, México
            </Text>
            <View style={styles.customerData}>
              <Text style={styles.compactText}>Cliente:</Text>
              <Text style={styles.compactText}>{clientInfo.companyName}</Text>
              <Text style={styles.compactText}>{clientInfo.fullName}</Text>
              <Text style={styles.compactText}>{clientInfo.deliveryLocation}</Text>
              <Text style={styles.compactText}>MEX</Text>
            </View>
          </View>

          <View style={styles.rightHeader}>
            <Text style={styles.title}>COTIZACIÓN</Text>

            <View style={styles.metaData}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>n° de cotización:</Text>
                <Text style={styles.metaValue}>{quoteId}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>contacto:</Text>
                <Text style={styles.metaValue}>{employeeName}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}></Text>
                <Text style={styles.metaValue}>{employeeEmail}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* DATE BANNER */}
        <View style={styles.dateBanner}>
          <View>
            <Text>fecha de solicitud</Text>
            <Text>{date}</Text>
          </View>
          <View>
            <Text>número de solicitud</Text>
            <Text>{requestId}</Text>
          </View>
          <View>
            <Text>fecha</Text>
            <Text>{date}</Text>
          </View>
        </View>

        {/* GREETING */}
        <View style={styles.greeting}>
          <Text>Estimado/a {clientInfo.fullName},</Text>
          <Text>Estamos agradecidos por su solicitud de cotización.</Text>
          <Text>Nos complace ofrecerle lo siguiente:</Text>
        </View>

        {/* VALID UNTIL */}
        <View style={styles.validUntilBanner}>
          <Text style={styles.validLabel}>precio válido hasta:</Text>
          <Text>{validUntil}</Text>
        </View>

        {/* TABLE */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colPos}>pos</Text>
            <Text style={styles.colQty}>cantidad</Text>
            <Text style={styles.colItem}>artículo</Text>
            <Text style={styles.colPrice}>precio/pza.</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>

          {products.map((p, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colPos}>{(index + 1).toFixed(1)}</Text>
              <Text style={styles.colQty}>{p.quantity} pza</Text>
              <Text style={styles.colItem}>
                {p.partNumber} ({p.model})
              </Text>
              <Text style={styles.colPrice}>{formatCurrency(p.priceUSD)} USD</Text>
              <Text style={styles.colTotal}>{formatCurrency(p.subtotalUSD)} USD</Text>
            </View>
          ))}
        </View>

        {/* DELIVERY TIME */}
        {sharedDelivery ? (
          <Text style={styles.deliveryText}>
            Tiempo de entrega: {sharedDelivery.deliveryWeeksMin} a {sharedDelivery.deliveryWeeksMax}{' '}
            semanas
          </Text>
        ) : (
          <View>
            {products.map((p, index) => (
              <Text key={index} style={styles.deliveryText}>
                Tiempo de entrega {p.partNumber}: {p.deliveryWeeksMin} a {p.deliveryWeeksMax}{' '}
                semanas
              </Text>
            ))}
          </View>
        )}

        {/* TOTALS */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalRow}>
            <Text>Monto de productos</Text>
            <Text>{formatCurrency(subtotal)} USD</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>IVA (16%)</Text>
            <Text>{formatCurrency(iva)} USD</Text>
          </View>
          <View style={styles.totalRowBold}>
            <Text>Suma total</Text>
            <Text>{formatCurrency(total)} USD</Text>
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text>Nuestra oferta no es obligatoria y está sujeta a cualquier cambio.</Text>
          <Text>Le pedimos referirse a la oferta mencionada al momento de enviar la orden.</Text>
          <Text style={{ marginTop: 5 }}>
            Si está interesado en proceder con la compra, por favor envíe un correo a{' '}
            {employeeEmail}
          </Text>

          <Text style={{ marginTop: 15 }}>Atentamente</Text>
          <Text>ZIEHL-ABEGG MEXICO</Text>

          <Text style={styles.signatureName}>{employeeName}</Text>
          <Text style={styles.automatedNote}>
            (esta cotización fue generada automáticamente - válida sin firma)
          </Text>

          <Text style={styles.confidential}>
            Este documento es confidencial y está protegido por la ley.
          </Text>
          <Text style={styles.confidential}>Su divulgación no está autorizada.</Text>
        </View>
      </Page>
    </Document>
  );
};
