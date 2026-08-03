import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Outcome — lo que decidió el Approver. Su **ausencia** significa que la
 * Replacement Request sigue en revisión: no existe un literal `awaiting_review`,
 * porque el glosario define la espera como la ausencia de decisión.
 *
 * Es independiente de `customerNotifiedAt`: ninguna superficie puede inferir uno
 * a partir del otro.
 */
export const outcomeValidator = v.union(
  v.literal('priced_as_suggested'),
  v.literal('priced_differently'),
  v.literal('oem_restricted'),
  v.literal('discontinued'),
  v.literal('blocked_pending_info')
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    fullName: v.string(),
    companyName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    preferredLanguage: v.union(v.literal('es'), v.literal('en')),
  }).index('by_clerk_id', ['clerkId']),

  pricing_rules: defineTable({
    prefix: v.string(),
    minPriceUSD: v.number(),
    maxPriceUSD: v.number(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
  }).index('by_prefix', ['prefix']),

  quotes: defineTable({
    userId: v.id('users'),
    requestId: v.string(),
    products: v.array(
      v.object({
        partNumber: v.string(),
        model: v.string(),
        quantity: v.number(),
        deliveryLocation: v.string(),
        /** Ausente => ningún Model Prefix coincidió, el producto no es cotizable. */
        suggestedPriceUSD: v.optional(v.number()),
        /** Ausente => todavía no existe un precio. NUNCA se lee como cero. */
        confirmedPriceUSD: v.optional(v.number()),
        suggestedDeliveryWeeksMin: v.number(),
        suggestedDeliveryWeeksMax: v.number(),
        confirmedDeliveryWeeksMin: v.optional(v.number()),
        confirmedDeliveryWeeksMax: v.optional(v.number()),
      })
    ),
    /** Ausente => en revisión. Ver `outcomeValidator`. */
    outcome: v.optional(outcomeValidator),
    /** Las palabras del propio Approver, conservadas junto al Outcome. */
    approverExplanation: v.optional(v.string()),
    /** Cuándo se le dijo algo al Customer, sea lo que sea. Independiente del Outcome. */
    customerNotifiedAt: v.optional(v.number()),
    /**
     * Los dos hechos concretos que puede haber detrás de esa notificación, cada
     * uno en su propio campo para que no se pisen: una Replacement Request
     * puede recibir su Quote Document y más tarde una explicación (o al revés),
     * y con un solo campo el primer hecho se perdía.
     */
    quoteDocumentSentAt: v.optional(v.number()),
    rejectionExplainedAt: v.optional(v.number()),
    expiresAt: v.number(),
  })
    .index('by_user_id', ['userId'])
    .index('by_request_id', ['requestId']),

  /**
   * Conversaciones del chat (ticket 21). Se definen aquí para que el esquema se
   * asiente en un solo commit; el ticket 21 las llena.
   *
   * `submittedQuoteId` presente => la conversación ya produjo una Replacement
   * Request y queda de solo lectura, para que `submit_quote_request` no pueda
   * dispararse dos veces por las mismas piezas.
   */
  chat_sessions: defineTable({
    userId: v.id('users'),
    lastMessageAt: v.number(),
    submittedQuoteId: v.optional(v.id('quotes')),
  }).index('by_user_id', ['userId']),

  /**
   * Mensajes del chat. Se guarda `parts[]` tal cual lo produce el AI SDK v6 —
   * aplanarlo a un `content` perdería las tool parts, que es como se renderiza
   * la confirmación de la Replacement Request.
   */
  chat_messages: defineTable({
    sessionId: v.id('chat_sessions'),
    /** El `id` del UIMessage del AI SDK, para reconciliar reenvíos. */
    messageId: v.string(),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
    parts: v.array(v.any()),
  }).index('by_session_id', ['sessionId']),

  /**
   * Ventanas de rate limiting (ticket 19). La cuenta vive en Convex, no en la
   * memoria del route handler: la ruta es una función serverless y un contador
   * en proceso no sobrevive entre invocaciones ni se comparte entre instancias.
   */
  rate_limit_windows: defineTable({
    /** Identidad de Clerk más el nombre del recurso limitado. */
    key: v.string(),
    windowStartedAt: v.number(),
    count: v.number(),
  }).index('by_key', ['key']),
});
