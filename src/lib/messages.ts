import type { NotifiableOutcome } from '../../convex/lib/outcome';

/**
 * Todo lo que el Customer lee, en los dos idiomas que puede elegir.
 *
 * Un solo módulo y no una constante por componente, porque la falla que arregla
 * el ticket 20 no es que faltara una traducción suelta: es que el idioma se
 * decidía en cada superficie por su cuenta, con un `isEs ? … : …` incrustado en
 * el JSX, y sólo en las superficies donde alguien se acordó de hacerlo. El
 * Customer que elegía inglés recibía respuestas en inglés dentro de una interfaz
 * en español, y después un Quote Document y unos correos en español.
 *
 * Las dos ramas son **el mismo objeto con los mismos campos**: `en` se declara
 * como `Messages`, que es la forma de `es`, de modo que olvidar una frase rompe
 * el typecheck en vez de dejar una superficie a medio traducir. Una superficie a
 * medio traducir es peor que una sin traducir, porque el Customer no puede saber
 * qué partes puede creerse. `messages.test.ts` lo vuelve a comprobar recorriendo
 * el árbol, que además cubre las diferencias de forma que el tipo permitiría.
 *
 * El idioma por defecto es el español, deliberadamente: esto es ZIEHL-ABEGG
 * México (ver `convex/users.ts`).
 */

export type Language = 'es' | 'en';

/** Los idiomas que existen. La fuente de la lista, no una copia. */
export const LANGUAGES = ['es', 'en'] as const satisfies readonly Language[];

export const DEFAULT_LANGUAGE: Language = 'es';

/**
 * El idioma de un valor que viene de fuera —un `data` del navegador, un registro
 * leído por la frontera interna— sin confiar en que traiga uno válido. Lo que no
 * reconocemos cae al español, que es lo que hace la propia alta del Customer.
 */
export function resolveLanguage(value: string | null | undefined): Language {
  return (LANGUAGES as readonly string[]).includes(value ?? '')
    ? (value as Language)
    : DEFAULT_LANGUAGE;
}

/**
 * El locale con el que se formatean fechas y números. Va aquí y no en cada
 * superficie porque es parte del idioma: un Quote Document con el cuerpo en
 * inglés y las fechas en `es-MX` sigue siendo bilingüe.
 */
const LOCALES: Record<Language, string> = {
  es: 'es-MX',
  en: 'en-US',
};

export function localeOf(language: Language): string {
  return LOCALES[language];
}

/** La fecha corta de una marca de tiempo, en el idioma del Customer. */
export function formatDate(timestamp: number, language: Language): string {
  return new Date(timestamp).toLocaleDateString(localeOf(language));
}

/** La fecha con hora que lleva cada Replacement Request en la lista. */
export function formatDateTime(timestamp: number, language: Language): string {
  return new Date(timestamp).toLocaleDateString(localeOf(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Un importe en dólares. La divisa **no** sigue al idioma: los precios de ZAMX
 * están en USD y lo estarán lea quien lea el documento. Lo que sigue al idioma
 * es la puntuación de los miles y los decimales.
 *
 * En español eso se lee `USD 6,250.00`, no `$6,250.00`, y es a propósito: aquí
 * el `$` a secas son pesos, así que el símbolo solo le diría al Customer
 * mexicano un precio veinte veces menor que el real. La lista de Replacement
 * Requests formateaba en `en-US` fijo justamente para conseguir ese `$`; el
 * cambio a `USD` es la parte deseada, no un efecto colateral del ticket 20.
 */
export function formatCurrency(valueUSD: number, language: Language): string {
  return valueUSD.toLocaleString(localeOf(language), {
    style: 'currency',
    currency: 'USD',
  });
}

/** El mismo importe sin el símbolo, como lo imprime el Quote Document. */
export function formatAmount(valueUSD: number, language: Language): string {
  return valueUSD.toLocaleString(localeOf(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const es = {
  /** La pantalla de chat: `src/app/page.tsx` y los componentes de `chat/`. */
  chat: {
    greeting: 'Hola,',
    quoteHere: 'Cotiza aquí tu',
    morphingWords: ['ventilador', 'reemplazo', 'refacción', 'equipo'],
    quoteReplacementPrompt: 'Quiero cotizar un ventilador de reemplazo.',
    quoteReplacementTitle: 'Cotizar un reemplazo',
    quoteReplacementBody: 'Inicia el flujo para cotizar uno o varios equipos.',
    dataplateHelpPrompt: 'No encuentro mi número de parte, ¿cómo lo busco?',
    dataplateHelpTitle: 'Ayuda con la placa de datos',
    dataplateHelpBody: 'Descubre dónde localizar el modelo y número de parte.',
    inputPlaceholder: 'Escribe un mensaje, modelo o número de parte...',
    genericError: 'No pudimos enviar tu mensaje. Vuelve a intentarlo.',
    startNewConversation: 'Empezar una conversación nueva',
    copyright: '© 2026 ZAMX Replacements. Todos los derechos reservados.',

    /** El envío de la Replacement Request, dentro del hilo. */
    submitting: 'Enviando tu solicitud de reemplazo...',
    submitFailedTitle: 'Tu solicitud no se envió',
    submitFailedBody: 'No pudimos registrarla. Por favor intenta de nuevo.',
    submittedTitle: 'Solicitud enviada',
    submittedReference: 'Tu folio es ',
    submittedFollowUp: 'Un vendedor la revisará y se pondrá en contacto contigo.',

    /** La guía de la placa de datos. */
    dataplateTitle: 'Información importante sobre la placa de datos',
    dataplateArticle: 'El ',
    dataplatePartNumber: 'número de parte',
    dataplatePartNumberBody:
      ' de un producto ZIEHL-ABEGG es necesario para identificar el reemplazo correcto. Generalmente es un número de 6 dígitos que comienza con un 1 o un 2.',
    dataplateModel: 'modelo',
    dataplateModelBody:
      ' del ventilador es necesario para confirmar que el número de pieza suministrado coincide con el diseño de la unidad solicitado.',
    dataplateImageAlt: 'Guía de placa de datos ZIEHL-ABEGG',
  },

  /**
   * Lo que contesta `api/chat/route.ts` cuando no atiende el turno. Va aquí
   * porque el transporte del AI SDK pinta el cuerpo de una respuesta no-2xx
   * literalmente en el chat: es copia de la pantalla, sólo que redactada en el
   * servidor.
   */
  chatErrors: {
    tooManyRequests: (minutes: number) =>
      `Has enviado demasiados mensajes. Vuelve a intentarlo en unos ${minutes} minuto${minutes === 1 ? '' : 's'}.`,
    alreadySubmitted:
      'Esta conversación ya terminó: su solicitud de reemplazo fue enviada. Empieza una conversación nueva para cotizar algo más.',
    unavailable:
      'El servicio no está disponible en este momento. Vuelve a intentarlo en un momento.',
  },

  /** La barra de navegación: `src/components/layout/Navbar.tsx`. */
  nav: {
    home: 'Inicio',
    /** Mayúscula el idioma activo: el control dice dónde estás y a dónde vas. */
    languageToggle: 'ES / en',
    quotes: 'Mis Cotizaciones',
    logoAlt: 'Logo ZIEHL-ABEGG',
    countryTitle: 'México',
  },

  /** La lista de Replacement Requests: `src/components/layout/QuotesModal.tsx`. */
  quotes: {
    title: 'Mis Cotizaciones',
    close: 'Cerrar',
    loading: 'Cargando historial...',
    emptyTitle: 'No tienes cotizaciones',
    emptyBody:
      'Cuando solicites cotizaciones a través del chatbot, aparecerán aquí para que puedas darles seguimiento.',
    totalLabel: 'Total (c/ IVA)',
    viewPdf: 'Ver PDF',

    /**
     * Lo que el navegador pinta cuando «Ver PDF» no acaba en un PDF. Es la
     * misma superficie: el Customer pulsa un enlace de esta lista y lee la
     * respuesta a pantalla completa, así que dejarla en español fijo traducía
     * la lista y no lo que pasa al usarla.
     */
    downloadNotFound: 'No encontramos esta cotización.',
    downloadNoQuoteDocument: 'Esta solicitud todavía no tiene una cotización que descargar.',

    /**
     * La insignia de cada Replacement Request. El tono lo decide
     * `outcome-badge.ts`; aquí sólo está lo que se lee.
     */
    badgeAwaiting: 'En revisión por Ventas',
    badgeSent: 'Enviada al correo',
    badgeSending: 'Procesando envío...',
    badgeOemRestricted: 'Exclusiva del fabricante (OEM)',
    badgeDiscontinued: 'Pieza descontinuada',
    badgeBlockedPendingInfo: 'Requiere más información',
  },

  /** El alta del Customer: `src/app/(auth)/onboarding/page.tsx`. */
  onboarding: {
    title: 'Bienvenido a la aplicación de remplazos',
    subtitle:
      'Por favor, completa tu información para configurar tu cuenta y personalizar tus cotizaciones.',
    fullNameLabel: 'Nombre Completo',
    fullNamePlaceholder: 'Ej. Juan Pérez',
    companyLabel: 'Empresa',
    companyPlaceholder: 'Nombre de tu compañía',
    phoneLabel: 'Teléfono',
    phoneOptional: '(Opcional)',
    phonePlaceholder: 'Ej. +52 55 1234 5678',
    submit: 'Guardar y Continuar',
  },

  /** El Quote Document en PDF: `src/components/pdf/QuoteDocument.tsx`. */
  quoteDocument: {
    /** Cómo se llama el archivo que descarga o recibe adjunto el Customer. */
    fileNamePrefix: 'Cotizacion',
    originLine: 'ZIEHL-ABEGG MEXICO | San Pedro Garza García, NL, México',
    customerLabel: 'Cliente:',
    country: 'MEX',
    title: 'COTIZACIÓN',
    quoteNumberLabel: 'n° de cotización:',
    contactLabel: 'contacto:',
    requestDateLabel: 'fecha de solicitud',
    requestNumberLabel: 'número de solicitud',
    dateLabel: 'fecha',
    greeting: (fullName: string) => `Estimado/a ${fullName},`,
    thanks: 'Estamos agradecidos por su solicitud de cotización.',
    pleased: 'Nos complace ofrecerle lo siguiente:',
    validUntilLabel: 'precio válido hasta:',
    colPos: 'pos',
    colQuantity: 'cantidad',
    colItem: 'artículo',
    colUnitPrice: 'precio/pza.',
    colTotal: 'Total',
    unit: 'pza',
    deliveryShared: (min: number, max: number) => `Tiempo de entrega: ${min} a ${max} semanas`,
    deliveryPerPart: (partNumber: string, min: number, max: number) =>
      `Tiempo de entrega ${partNumber}: ${min} a ${max} semanas`,
    totalsProducts: 'Monto de productos',
    totalsTax: 'IVA (16%)',
    totalsSum: 'Suma total',
    footerNotBinding: 'Nuestra oferta no es obligatoria y está sujeta a cualquier cambio.',
    footerReference: 'Le pedimos referirse a la oferta mencionada al momento de enviar la orden.',
    footerHowToOrder: (contactEmail: string) =>
      `Si está interesado en proceder con la compra, por favor envíe un correo a ${contactEmail}`,
    closing: 'Atentamente',
    automatedNote: '(esta cotización fue generada automáticamente - válida sin firma)',
    confidentialProtected: 'Este documento es confidencial y está protegido por la ley.',
    confidentialDisclosure: 'Su divulgación no está autorizada.',
  },

  /** El correo que lleva el Quote Document adjunto: `ClientQuoteEmail.tsx`. */
  clientQuoteEmail: {
    subject: (requestId: string) => `Su cotización ${requestId} de ZIEHL-ABEGG México`,
    preview: (requestId: string) => `Su cotización oficial de ZIEHL-ABEGG México (${requestId})`,
    heading: 'Cotización ZIEHL-ABEGG',
    greeting: (fullName: string) => `Estimado/a ${fullName},`,
    attachedBefore:
      'Agradecemos su interés en nuestros productos. Adjunto a este correo encontrará la cotización oficial ',
    attachedAfter: ' correspondiente a su solicitud de piezas de reemplazo.',
    contents:
      'El documento en formato PDF adjunto contiene el detalle de precios, tiempos de entrega y condiciones comerciales.',
    howToOrder:
      'Si tiene alguna duda o desea proceder con la orden de compra, use el correo proporcionado al final del documento PDF haciendo referencia al número de cotización.',
    closing: 'Atentamente,',
    team: 'El equipo de Ventas ZIEHL-ABEGG México',
  },

  /**
   * El correo de un Outcome sin Quote Document: `RejectedQuoteEmail.tsx`.
   *
   * Los `Record` teclados por el Outcome se conservan: añadir un Outcome
   * notificable sin redactarlo —en los dos idiomas— rompe el typecheck, en vez
   * de mandar un encabezado genérico y un cuerpo vacío.
   */
  rejectedQuoteEmail: {
    subject: (requestId: string) => `Actualización sobre su solicitud ${requestId}`,
    reasonTitle: {
      oem_restricted: 'Información sobre su equipo exclusivo (OEM)',
      discontinued: 'Aviso de obsolescencia de equipo',
      blocked_pending_info: 'Requerimos más información para su cotización',
    } satisfies Record<NotifiableOutcome, string>,
    reasonMessage: {
      oem_restricted:
        'Después de revisar su solicitud, hemos identificado que el modelo o número de parte solicitado es un diseño exclusivo para el fabricante original del equipo (OEM). Por políticas de distribución, debe contactar directamente al fabricante de su máquina para obtener este reemplazo.',
      discontinued:
        'Lamentamos informarle que el equipo que ha solicitado se encuentra obsoleto y ha sido descontinuado de nuestro catálogo.',
      blocked_pending_info:
        'Para poder ofrecerle el reemplazo correcto y garantizar la compatibilidad, necesitamos que nos proporcione información adicional, preferentemente una fotografía clara de la placa de datos técnicos del ventilador actual.',
    } satisfies Record<NotifiableOutcome, string>,
    greeting: 'Estimado/a',
    introBefore: 'En relación a su solicitud de cotización con folio ',
    introAfter: ', le compartimos la siguiente información:',
    additionalNote: 'Nota adicional de nuestro equipo:',
    backToPlatform: 'Regresar a la plataforma',
    replyInvitation:
      'Si tiene alguna duda o requiere asistencia técnica adicional, no dude en responder a este correo.',
    automatedFooter: 'Este es un correo automático generado por ZIEHL-ABEGG México.',
    postalAddress: '4971 Millennium Drive, Winston-Salem NC 27107',
    logoAlt: 'ZIEHL-ABEGG',
  },
};

/**
 * La forma que tienen que cumplir los dos idiomas. Se deriva del español en vez
 * de escribirse a mano para que añadir una frase nueva exija su traducción
 * automáticamente.
 */
export type Messages = typeof es;

const en: Messages = {
  chat: {
    greeting: 'Hello,',
    quoteHere: 'Quote here your',
    morphingWords: ['fan', 'replacement', 'spare part', 'equipment'],
    quoteReplacementPrompt: 'I want to quote a replacement fan.',
    quoteReplacementTitle: 'Quote a replacement',
    quoteReplacementBody: 'Start the flow to quote one or more items.',
    dataplateHelpPrompt: "I can't find my part number, where is it?",
    dataplateHelpTitle: 'Help with data plate',
    dataplateHelpBody: 'Find out where to locate the model and part number.',
    inputPlaceholder: 'Type a message, model, or part number...',
    genericError: 'We could not send your message. Please try again.',
    startNewConversation: 'Start a new conversation',
    copyright: '© 2026 ZAMX Replacements. All rights reserved.',

    submitting: 'Submitting your replacement request...',
    submitFailedTitle: 'Your replacement request was not submitted',
    submitFailedBody: 'We could not record it. Please try again.',
    submittedTitle: 'Request submitted',
    submittedReference: 'Your reference number is ',
    submittedFollowUp: 'A salesperson will review it and get back to you.',

    dataplateTitle: 'Important information about the data plate',
    dataplateArticle: 'The ',
    dataplatePartNumber: 'part number',
    dataplatePartNumberBody:
      ' of a ZIEHL-ABEGG product is necessary to identify the correct replacement. It is generally a 6-digit number starting with a 1 or a 2.',
    dataplateModel: 'fan model',
    dataplateModelBody:
      ' is necessary to confirm that the supplied part number matches the requested unit design.',
    dataplateImageAlt: 'ZIEHL-ABEGG data plate guide',
  },

  chatErrors: {
    tooManyRequests: (minutes: number) =>
      `You have sent too many messages. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    alreadySubmitted:
      'This conversation is already complete — its replacement request has been submitted. Start a new conversation to quote something else.',
    unavailable: 'The service is unavailable right now. Please try again in a moment.',
  },

  nav: {
    home: 'Home',
    languageToggle: 'es / EN',
    quotes: 'My Quotes',
    logoAlt: 'ZIEHL-ABEGG logo',
    countryTitle: 'Mexico',
  },

  quotes: {
    title: 'My Quotes',
    close: 'Close',
    loading: 'Loading history...',
    emptyTitle: 'You have no quotes yet',
    emptyBody:
      'When you request quotes through the chatbot, they will appear here so you can follow them up.',
    totalLabel: 'Total (incl. VAT)',
    viewPdf: 'View PDF',

    downloadNotFound: 'We could not find this quote.',
    downloadNoQuoteDocument: 'This request does not have a quote to download yet.',

    badgeAwaiting: 'Under review by Sales',
    badgeSent: 'Emailed to you',
    badgeSending: 'Sending...',
    badgeOemRestricted: 'Manufacturer exclusive (OEM)',
    badgeDiscontinued: 'Discontinued part',
    badgeBlockedPendingInfo: 'More information required',
  },

  onboarding: {
    title: 'Welcome to the replacements application',
    subtitle: 'Please complete your information to set up your account and tailor your quotes.',
    fullNameLabel: 'Full Name',
    fullNamePlaceholder: 'E.g. John Smith',
    companyLabel: 'Company',
    companyPlaceholder: 'Your company name',
    phoneLabel: 'Phone',
    phoneOptional: '(Optional)',
    phonePlaceholder: 'E.g. +52 55 1234 5678',
    submit: 'Save and Continue',
  },

  quoteDocument: {
    fileNamePrefix: 'Quotation',
    originLine: 'ZIEHL-ABEGG MEXICO | San Pedro Garza García, NL, Mexico',
    customerLabel: 'Customer:',
    country: 'MEX',
    title: 'QUOTATION',
    quoteNumberLabel: 'quotation no.:',
    contactLabel: 'contact:',
    requestDateLabel: 'request date',
    requestNumberLabel: 'request number',
    dateLabel: 'date',
    greeting: (fullName: string) => `Dear ${fullName},`,
    thanks: 'Thank you for your request for quotation.',
    pleased: 'We are pleased to offer you the following:',
    validUntilLabel: 'price valid until:',
    colPos: 'pos',
    colQuantity: 'quantity',
    colItem: 'item',
    colUnitPrice: 'price/pc.',
    colTotal: 'Total',
    unit: 'pcs',
    deliveryShared: (min: number, max: number) => `Delivery time: ${min} to ${max} weeks`,
    deliveryPerPart: (partNumber: string, min: number, max: number) =>
      `Delivery time ${partNumber}: ${min} to ${max} weeks`,
    totalsProducts: 'Products amount',
    totalsTax: 'VAT (16%)',
    totalsSum: 'Grand total',
    footerNotBinding: 'Our offer is not binding and is subject to change.',
    footerReference: 'Please refer to the quotation above when placing your order.',
    footerHowToOrder: (contactEmail: string) =>
      `If you wish to proceed with the purchase, please send an email to ${contactEmail}`,
    closing: 'Sincerely',
    automatedNote: '(this quotation was generated automatically - valid without signature)',
    confidentialProtected: 'This document is confidential and protected by law.',
    confidentialDisclosure: 'Its disclosure is not authorised.',
  },

  clientQuoteEmail: {
    subject: (requestId: string) => `Your quotation ${requestId} from ZIEHL-ABEGG Mexico`,
    preview: (requestId: string) => `Your official ZIEHL-ABEGG Mexico quotation (${requestId})`,
    heading: 'ZIEHL-ABEGG Quotation',
    greeting: (fullName: string) => `Dear ${fullName},`,
    attachedBefore:
      'Thank you for your interest in our products. Attached to this email you will find the official quotation ',
    attachedAfter: ' for your replacement parts request.',
    contents:
      'The attached PDF document contains the detail of prices, delivery times and commercial terms.',
    howToOrder:
      'If you have any questions or wish to proceed with a purchase order, use the email address given at the end of the PDF document, quoting the quotation number.',
    closing: 'Sincerely,',
    team: 'The ZIEHL-ABEGG Mexico Sales team',
  },

  rejectedQuoteEmail: {
    subject: (requestId: string) => `Update on your request ${requestId}`,
    reasonTitle: {
      oem_restricted: 'Information about your manufacturer-exclusive (OEM) equipment',
      discontinued: 'Notice of equipment obsolescence',
      blocked_pending_info: 'We need more information for your quotation',
    },
    reasonMessage: {
      oem_restricted:
        'After reviewing your request, we have identified that the requested model or part number is a design exclusive to the original equipment manufacturer (OEM). Under our distribution policy, you must contact the manufacturer of your machine directly to obtain this replacement.',
      discontinued:
        'We regret to inform you that the equipment you requested is obsolete and has been discontinued from our catalogue.',
      blocked_pending_info:
        'In order to offer you the correct replacement and guarantee compatibility, we need you to provide additional information, preferably a clear photograph of the technical data plate of the current fan.',
    },
    greeting: 'Dear',
    introBefore: 'Regarding your request for quotation with reference ',
    introAfter: ', we would like to share the following information with you:',
    additionalNote: 'Additional note from our team:',
    backToPlatform: 'Back to the platform',
    replyInvitation:
      'If you have any questions or need further technical assistance, feel free to reply to this email.',
    automatedFooter: 'This is an automated email generated by ZIEHL-ABEGG Mexico.',
    postalAddress: '4971 Millennium Drive, Winston-Salem NC 27107',
    logoAlt: 'ZIEHL-ABEGG',
  },
};

/** Las dos ramas, para quien tenga que recorrerlas —o elegir por idioma. */
export const MESSAGES: Record<Language, Messages> = { es, en };

/** Lo que lee el Customer, en su idioma. El punto de entrada de todo el módulo. */
export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}
