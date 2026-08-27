import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { formatAmount, messagesFor, type Language } from '@/lib/messages';

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

export interface QuoteDocumentProps {
  /**
   * El folio `REQ-XXXXXX`. Es **uno**: nombra la Replacement Request, y el Quote
   * Document se identifica con el mismo código sin numerarse aparte. Antes
   * viajaba como `quoteId` y como `requestId`, dos props que las dos rutas
   * llenaban con el mismo valor y que el documento imprimía en dos sitios como
   * si pudieran diferir.
   */
  requestId: string;
  date: string;
  validUntil: string;
  customerInfo: {
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
  /**
   * A quién le escribe el Customer sobre este documento. No es el Approver que
   * lo autorizó —el documento no dice quién puso el precio— sino el buzón de
   * ventas de ZAMX; sale de `QUOTE_CONTACT` en `@/lib/addresses`.
   */
  contactName: string;
  contactEmail: string;
  /**
   * El logo ya resuelto — un data URI, no un URL que haya que ir a buscar. El
   * documento no sabe de dónde salió el archivo ni depende de que la aplicación
   * se pueda alcanzar a sí misma por red; ver `@/lib/quote-logo`.
   */
  logoSrc: string;
  /**
   * El idioma del Customer. Llega como prop y no se deduce de una cabecera
   * porque el documento se genera en el servidor: la ruta que lo adjunta al
   * correo no tiene navegador del que preguntarle nada, y las fechas ya vienen
   * formateadas con este mismo idioma desde `quoteDocumentProps`.
   */
  language: Language;
}

export const QuoteDocument: React.FC<QuoteDocumentProps> = ({
  requestId,
  date,
  validUntil,
  customerInfo,
  products,
  subtotal,
  iva,
  total,
  contactName,
  contactEmail,
  logoSrc,
  language,
}) => {
  const t = messagesFor(language).quoteDocument;

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
    /* `language` es además metadato del PDF: un lector de pantalla necesita
       saber en qué idioma está el documento que abre. */
    <Document language={language}>
      <Page size="A4" style={styles.page}>
        {/* TOP LOGO */}
        <View style={styles.topLogoContainer}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoSrc} style={styles.logo} />
        </View>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.leftHeader}>
            <Text style={styles.smallGrayText}>{t.originLine}</Text>
            <View style={styles.customerData}>
              <Text style={styles.compactText}>{t.customerLabel}</Text>
              <Text style={styles.compactText}>{customerInfo.companyName}</Text>
              <Text style={styles.compactText}>{customerInfo.fullName}</Text>
              <Text style={styles.compactText}>{customerInfo.deliveryLocation}</Text>
              <Text style={styles.compactText}>{t.country}</Text>
            </View>
          </View>

          <View style={styles.rightHeader}>
            <Text style={styles.title}>{t.title}</Text>

            <View style={styles.metaData}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t.quoteNumberLabel}</Text>
                <Text style={styles.metaValue}>{requestId}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t.contactLabel}</Text>
                <Text style={styles.metaValue}>{contactName}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}></Text>
                <Text style={styles.metaValue}>{contactEmail}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* DATE BANNER */}
        <View style={styles.dateBanner}>
          <View>
            <Text>{t.requestDateLabel}</Text>
            <Text>{date}</Text>
          </View>
          <View>
            <Text>{t.requestNumberLabel}</Text>
            <Text>{requestId}</Text>
          </View>
          <View>
            <Text>{t.dateLabel}</Text>
            <Text>{date}</Text>
          </View>
        </View>

        {/* GREETING */}
        <View style={styles.greeting}>
          <Text>{t.greeting(customerInfo.fullName)}</Text>
          <Text>{t.thanks}</Text>
          <Text>{t.pleased}</Text>
        </View>

        {/* VALID UNTIL */}
        <View style={styles.validUntilBanner}>
          <Text style={styles.validLabel}>{t.validUntilLabel}</Text>
          <Text>{validUntil}</Text>
        </View>

        {/* TABLE */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colPos}>{t.colPos}</Text>
            <Text style={styles.colQty}>{t.colQuantity}</Text>
            <Text style={styles.colItem}>{t.colItem}</Text>
            <Text style={styles.colPrice}>{t.colUnitPrice}</Text>
            <Text style={styles.colTotal}>{t.colTotal}</Text>
          </View>

          {products.map((p, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colPos}>{(index + 1).toFixed(1)}</Text>
              <Text style={styles.colQty}>
                {p.quantity} {t.unit}
              </Text>
              <Text style={styles.colItem}>
                {p.partNumber} ({p.model})
              </Text>
              <Text style={styles.colPrice}>{formatAmount(p.priceUSD, language)} USD</Text>
              <Text style={styles.colTotal}>{formatAmount(p.subtotalUSD, language)} USD</Text>
            </View>
          ))}
        </View>

        {/* DELIVERY TIME */}
        {sharedDelivery ? (
          <Text style={styles.deliveryText}>
            {t.deliveryShared(sharedDelivery.deliveryWeeksMin, sharedDelivery.deliveryWeeksMax)}
          </Text>
        ) : (
          <View>
            {products.map((p, index) => (
              <Text key={index} style={styles.deliveryText}>
                {t.deliveryPerPart(p.partNumber, p.deliveryWeeksMin, p.deliveryWeeksMax)}
              </Text>
            ))}
          </View>
        )}

        {/* TOTALS */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalRow}>
            <Text>{t.totalsProducts}</Text>
            <Text>{formatAmount(subtotal, language)} USD</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>{t.totalsTax}</Text>
            <Text>{formatAmount(iva, language)} USD</Text>
          </View>
          <View style={styles.totalRowBold}>
            <Text>{t.totalsSum}</Text>
            <Text>{formatAmount(total, language)} USD</Text>
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text>{t.footerNotBinding}</Text>
          <Text>{t.footerReference}</Text>
          <Text style={{ marginTop: 5 }}>{t.footerHowToOrder(contactEmail)}</Text>

          <Text style={{ marginTop: 15 }}>{t.closing}</Text>
          <Text>ZIEHL-ABEGG MEXICO</Text>

          <Text style={styles.signatureName}>{contactName}</Text>
          <Text style={styles.automatedNote}>{t.automatedNote}</Text>

          <Text style={styles.confidential}>{t.confidentialProtected}</Text>
          <Text style={styles.confidential}>{t.confidentialDisclosure}</Text>
        </View>
      </Page>
    </Document>
  );
};
