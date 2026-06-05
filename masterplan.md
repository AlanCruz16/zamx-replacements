# Masterplan: Sistema Automatizado de Cotización de Reemplazos — ZIEHL-ABEGG México

> **Versión:** 2.1  
> **Última actualización:** 2026-06-05

---

## 1. Visión General

### 1.1 Problema

ZIEHL-ABEGG México recibe solicitudes de piezas de reemplazo de ventiladores industriales. Actualmente el proceso es manual: el cliente contacta a un empleado, el empleado busca precios, genera una cotización y la envía. Esto es lento, propenso a errores y no escalable.

### 1.2 Solución

Una aplicación web con un chatbot conversacional impulsado por IA que:

1. Captura los datos del cliente y sus necesidades de reemplazo de forma guiada.
2. Calcula automáticamente un precio sugerido y tiempo de entrega.
3. Envía la solicitud a un empleado de ventas por correo para validación.
4. Interpreta la respuesta del empleado por email (usando LLM).
5. Genera y envía una cotización formal en PDF al cliente.
6. Almacena un historial de cotizaciones por cliente.

### 1.3 Enfoque de Desarrollo

- **MVP First:** Priorizar funcionalidad completa sobre estética.
- **Fase 2:** Pulido visual, experiencia de usuario premium y features adicionales.

---

## 2. Tech Stack

| Componente            | Tecnología                                   | Justificación                                                                                                   |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Framework**         | Next.js (App Router, última versión estable) | SSR, API routes, experiencia del equipo                                                                         |
| **Autenticación**     | Clerk                                        | Email + contraseña. Simple, seguro, manejo de sesiones B2C                                                      |
| **Base de Datos**     | Convex                                       | DB reactiva, funciones serverless, storage de archivos, tiempo real para el chat                                |
| **LLM / IA**          | Google Gemini (via Vercel AI SDK)            | Chatbot NLP, parsing de emails, generación de respuestas. API key ya disponible                                 |
| **Email (envío)**     | Resend + React Email                         | Envío transaccional, templates tipados en React                                                                 |
| **Email (recepción)** | IMAP Polling (Gmail/Outlook)                 | Sin dominio propio → no se puede usar inbound webhooks. Se usará polling vía IMAP con `imapflow` en un cron job |
| **PDF**               | `@react-pdf/renderer`                        | Generación server-side del documento de cotización                                                              |
| **Deployment**        | Vercel                                       | Experiencia del equipo, integración nativa con Next.js                                                          |
| **Idioma**            | Bilingüe (Español/Inglés)                    | Toggle en UI. Chatbot y cotización en el idioma seleccionado                                                    |
| **Moneda**            | USD únicamente                               | Todos los precios en dólares americanos                                                                         |

### 2.1 Decisiones Técnicas Clave

#### ¿Por qué solo Convex (sin Supabase)?

Convex maneja todo lo que necesitamos: esquema tipado, funciones serverless (queries/mutations/actions), almacenamiento de archivos, y reactividad en tiempo real para el chat. Agregar Supabase duplicaría la complejidad sin beneficio claro para el MVP.

#### ¿Por qué IMAP Polling en lugar de Inbound Webhooks?

No tenemos un dominio propio configurado. Los webhooks de Resend requieren un dominio verificado para recibir emails. La alternativa más simple es un cron job que revise una bandeja de correo dedicada cada N minutos usando el protocolo IMAP.

**Cuenta de email dedicada:** Se creará una cuenta de email (ej. `zamx.replacements@gmail.com`) que será:

- La dirección de **envío** de solicitudes al empleado (Reply-To).
- La dirección que el empleado responde.
- La bandeja que el cron job monitorea para recibir respuestas.

#### ¿Por qué Vercel AI SDK?

Abstrae la comunicación con Gemini, maneja streaming de respuestas, structured output (JSON), y tool calling. Facilita cambiar de modelo LLM en el futuro sin reescribir lógica.

---

## 3. Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Browser)                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │  Login/   │  │   Chatbot    │  │  Historial │  │   Selector   │  │
│  │ Register  │  │  Interface   │  │    Panel   │  │   Idioma     │  │
│  └──────────┘  └──────────────┘  └────────────┘  └──────────────┘  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Next.js   │
                    │  App Router │
                    │  (Vercel)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼───┐ ┌──────▼──────┐
       │    Convex    │ │Clerk │ │  Vercel AI  │
       │  (DB, Logic, │ │(Auth)│ │  SDK + Gemini│
       │   Storage)   │ │      │ │  (Chat, NLP) │
       └──────┬───────┘ └──────┘ └─────────────┘
              │
       ┌──────▼──────┐
       │   Resend     │◄──────────────────────┐
       │ (Send Email) │                       │
       └──────┬───────┘                       │
              │                               │
       ┌──────▼────────────┐    ┌─────────────┴──────┐
       │ Empleado ZIEHL-   │    │ IMAP Cron Job      │
       │ ABEGG (Outlook/   │───►│ (Poll cada 2 min)  │
       │ Gmail)            │    │ Lee respuestas      │
       └───────────────────┘    └─────────────┬──────┘
                                              │
                                       ┌──────▼──────┐
                                       │  Gemini LLM │
                                       │ (Parse Email)│
                                       └──────┬──────┘
                                              │
                                       ┌──────▼──────┐
                                       │  PDF Gen +   │
                                       │  Email Client│
                                       └─────────────┘
```

---

## 4. Flujo del Sistema (Workflow Detallado)

### Fase 1: Registro / Login del Cliente

**Ruta:** `/` → redirige a `/login` o `/dashboard`

1. El cliente accede a la aplicación.
2. Si no tiene cuenta, se registra con Clerk proporcionando:
   - Nombre completo
   - Nombre de la empresa
   - Correo electrónico
   - Teléfono (opcional)
3. Si ya tiene cuenta, inicia sesión con email + contraseña.
4. Tras autenticarse, se redirige al dashboard del cliente.

**Datos almacenados en Convex (`users` table):**

```typescript
{
  clerkId: string,          // ID de Clerk
  fullName: string,
  companyName: string,
  email: string,
  phone?: string,
  preferredLanguage: "es" | "en",
  createdAt: number,        // timestamp
}
```

> **Nota:** Clerk almacena las credenciales de autenticación. Convex almacena el perfil extendido del usuario (empresa, teléfono, idioma) sincronizado via webhook de Clerk.

---

### Fase 2: Interacción con el Chatbot

**Ruta:** `/dashboard` → sección principal del chatbot

#### 2.1 Inicio de Conversación

El chatbot saluda al cliente por nombre (datos de Clerk) y le explica el proceso:

- Dónde encontrar el número de parte y modelo en la etiqueta del ventilador.
- Qué información necesita: **número de parte**, **modelo**, **cantidad**, **lugar de entrega**.

#### 2.2 Recopilación de Datos (Multi-producto)

El cliente puede solicitar cotización de **múltiples productos** en una misma sesión. Para cada producto, el chatbot debe capturar:

```typescript
interface ProductRequest {
  partNumber: string; // Ej: "162562" o "162562/A01" (Generalmente 6 dígitos numéricos)
  model: string; // Ej: "MK137-4DZ.07.U" o "GR45-..." (Alfanumérico, contiene el prefijo)
  quantity: number; // Número de piezas
  deliveryLocation: string; // Ciudad o dirección de entrega
}
```

#### 2.3 Validación del Chatbot

El chatbot (via Gemini + Vercel AI SDK con structured output) debe:

1. **Validar formato** — Asegurar que el cliente proporcione tanto el **número de parte** (ej: 6 dígitos `162562`, opcionalmente con sufijos como `/A01`) como el **modelo** (alfanumérico, ej: `MK137-4DZ.07.U`).
2. **Confirmar con el usuario** los datos recopilados antes de proceder.
3. **Permitir agregar más productos** o confirmar que ha terminado.
4. Generar un JSON estructurado con todos los productos solicitados.

#### 2.4 Extracción Inteligente del Prefijo

Del `model` proporcionado por el cliente, el sistema debe extraer automáticamente el prefijo para alimentar el algoritmo de precios. La lógica de extracción debe coincidir con las reglas definidas en la tabla `pricing_rules`.

#### 2.5 Prompt del Chatbot (Guía para implementación)

El system prompt del chatbot debe incluir:

- **Rol:** Eres un asistente de ZIEHL-ABEGG México especializado en reemplazos de ventiladores industriales.
- **Objetivo:** Recopilar número de parte, modelo, cantidad y lugar de entrega.
- **Instrucciones para ayudar al cliente:** Explicar dónde encontrar la etiqueta del ventilador (generalmente en la carcasa lateral o en la placa de datos).
- **Idioma:** Responder en el idioma seleccionado por el usuario.
- **Restricción:** NO dar precios, NO prometer tiempos de entrega. Solo recopilar datos.
- **Multi-producto:** Permitir que el cliente agregue varios productos. Preguntar "¿Desea cotizar otro producto?" después de cada uno.
- **Output format:** Cuando el cliente confirme, generar un JSON con el schema `ProductRequest[]`.

---

### Fase 3: Cálculo de Precio y Envío al Empleado

#### 3.1 Algoritmo de Precios

**Concepto:** El sistema genera un precio aleatorio dentro de un rango predefinido por prefijo de modelo. El precio resultante tiene exactamente **2 decimales** (ej: `$2,547.83 USD`). Esto es intencional: un precio con centavos aparenta una calculación más precisa y profesional, y evita que cotizaciones diferentes al mismo cliente tengan precios idénticos.

**Tabla `pricing_rules` en Convex:**

```typescript
{
  prefix: string,           // Prefijo del modelo, ej: "GR45", "GR50", "GR56"
  minPriceUSD: number,      // Precio mínimo del rango en USD
  maxPriceUSD: number,      // Precio máximo del rango en USD
  description?: string,     // Descripción de la categoría
  isActive: boolean,
}
```

**Datos iniciales (Seed Data para el MVP):**

| Prefijo | Rango Mínimo (USD) | Rango Máximo (USD) |
| ------- | ------------------ | ------------------ |
| `GR45`  | $2,400.00          | $2,600.00          |
| `GR50`  | $2,500.00          | $2,700.00          |
| `GR56`  | $2,600.00          | $2,800.00          |

> **Nota:** En el futuro se agregarán más prefijos desde el panel de administración (post-MVP).

**Lógica del cálculo (pseudocódigo):**

```typescript
function calculateSuggestedPrice(modelPrefix: string): number | null {
  // 1. Buscar la regla que coincida con el prefijo del modelo
  const rule = pricingRules.find((r) => modelPrefix.startsWith(r.prefix) && r.isActive);

  if (!rule) return null; // Prefijo no reconocido

  // 2. Generar precio random dentro del rango [min, max]
  const randomPrice = rule.minPriceUSD + Math.random() * (rule.maxPriceUSD - rule.minPriceUSD);

  // 3. Redondear a exactamente 2 decimales
  return Math.round(randomPrice * 100) / 100;
}
```

**Manejo de prefijo no encontrado:**
Si el `model` del cliente no coincide con ningún prefijo en la tabla `pricing_rules`, el chatbot informa al cliente que debe verificar el modelo ingresado. El sistema NO envía la solicitud al empleado con precio "no disponible" — el cliente debe corregir el dato.

**IVA (Impuesto al Valor Agregado):**

- Se aplica **IVA del 16%** sobre el precio unitario.
- La cotización debe mostrar: Subtotal, IVA (16%), y Total.
- Fórmula: `totalConIVA = subtotal * 1.16`

#### 3.2 Tiempo de Entrega por Temporada

| Temporada | Meses                              | Tiempo de Entrega |
| --------- | ---------------------------------- | ----------------- |
| **Alta**  | Abril — Septiembre (meses 4-9)     | **12 semanas**    |
| **Baja**  | Octubre — Marzo (meses 10-12, 1-3) | **8 semanas**     |

**Tabla `delivery_seasons` en Convex:**

```typescript
{
  seasonName: string,        // "high" | "low"
  startMonth: number,        // 4 (Abril) para alta, 10 (Octubre) para baja
  endMonth: number,          // 9 (Septiembre) para alta, 3 (Marzo) para baja
  deliveryWeeks: number,     // 12 para alta, 8 para baja
  isActive: boolean,
}
```

**Lógica:**

```typescript
function getDeliveryWeeks(): number {
  const currentMonth = new Date().getMonth() + 1; // 1-12
  // Temporada alta: Abril (4) a Septiembre (9)
  if (currentMonth >= 4 && currentMonth <= 9) return 12;
  // Temporada baja: Octubre (10) a Marzo (3)
  return 8;
}
```

#### 3.3 Envío del Email al Empleado

**Destinatario:** Un único empleado de ventas (dirección configurada en Convex como variable de entorno o en tabla `system_config`).

**Estructura del correo:**

```
Asunto: [ZAMX-REQ-{requestId}] Nueva solicitud de reemplazo — {companyName}

Cuerpo:
────────────────────────────────
NUEVA SOLICITUD DE REEMPLAZO
Solicitud ID: {requestId}
────────────────────────────────

DATOS DEL CLIENTE:
• Nombre: {fullName}
• Empresa: {companyName}
• Email: {clientEmail}
• Teléfono: {phone}

PRODUCTOS SOLICITADOS:
┌─────┬──────────────────────────┬──────────┬──────────────────────┐
│  #  │ Número de Parte / Modelo │ Cantidad │ Lugar de Entrega     │
├─────┼──────────────────────────┼──────────┼──────────────────────┤
│  1  │ 162562 / GR45-XXX...     │ 5        │ Monterrey, NL        │
│  2  │ 162563 / GR50-XXX...     │ 2        │ CDMX                 │
└─────┴──────────────────────────┴──────────┴──────────────────────┘

PRECIOS Y TIEMPOS SUGERIDOS:
• Producto 1: $2,547.83 USD/unidad — Entrega: 12 semanas
• Producto 2: $2,634.19 USD/unidad — Entrega: 12 semanas
• Subtotal: $17,007.53 USD
• IVA (16%): $2,721.20 USD
• Total sugerido: $19,728.73 USD

────────────────────────────────
INSTRUCCIONES PARA RESPONDER:
────────────────────────────────

✅ Si APRUEBA todos los precios y tiempos sugeridos:
   Responda con: "Aprobado" o "OK" o cualquier confirmación.

✏️ Si desea MODIFICAR precio o tiempo de entrega:
   Responda con el formato:
   Producto 1: $NuevoPrecio, Entrega: N semanas
   Producto 2: $NuevoPrecio, Entrega: N semanas

❌ Si la pieza NO ESTÁ DISPONIBLE para venta al público (exclusiva OEM):
   Responda con: "OEM" o "No disponible al público"

🚫 Si la pieza está DESCONTINUADA / OBSOLETA:
   Responda con: "Obsoleto" o "Descontinuado"

❓ Si FALTA INFORMACIÓN TÉCNICA:
   Responda con: "Falta info:" seguido de lo que necesita del cliente.

────────────────────────────────
```

**Dirección Reply-To:** La cuenta de email dedicada del sistema (`zamx.replacements@gmail.com`) para que cuando el empleado responda, el cron job pueda leerlo.

**Tracking:** El `requestId` en el asunto permite correlacionar la respuesta del empleado con la solicitud en Convex.

---

### Fase 4: Recepción e Interpretación de la Respuesta del Empleado

#### 4.1 IMAP Polling (Cron Job)

**Implementación:** Una API route de Next.js (`/api/cron/check-email`) invocada periódicamente (cada 2-3 minutos) usando Vercel Cron Jobs.

**Flujo:**

1. Conectar a la bandeja de entrada via IMAP (usando `imapflow`).
2. Buscar emails no leídos cuyo asunto contenga `[ZAMX-REQ-`.
3. Para cada email encontrado:
   a. Extraer el `requestId` del asunto.
   b. Extraer el cuerpo del email (texto plano).
   c. Marcar como leído.
   d. Enviar a Gemini para interpretación.
4. Desconectar.

#### 4.2 Interpretación con LLM (Gemini)

**Prompt de interpretación para Gemini:**

```
Eres un sistema de ZIEHL-ABEGG México. Analiza la respuesta del empleado
a una solicitud de cotización de reemplazo.

Solicitud original:
{datos_originales_del_request}

Respuesta del empleado:
{cuerpo_del_email}

Clasifica la respuesta en UNA de estas categorías y extrae los datos relevantes:

1. "approved" — El empleado aprueba precios y tiempos sugeridos.
   Datos: ninguno adicional.

2. "modified" — El empleado modifica precio y/o tiempo de entrega.
   Datos: array de { productIndex, newPriceUSD?, newDeliveryWeeks? }

3. "oem_exclusive" — La pieza no está disponible para venta al público.
   Datos: { message: "razón del empleado" }

4. "obsolete" — La pieza está descontinuada.
   Datos: { message: "razón del empleado" }

5. "needs_info" — El empleado necesita más información técnica del cliente.
   Datos: { missingInfo: "qué necesita saber" }

Responde ÚNICAMENTE en formato JSON:
{
  "classification": "approved" | "modified" | "oem_exclusive" | "obsolete" | "needs_info",
  "data": { ... },
  "confidence": 0.0-1.0
}
```

#### 4.3 Acciones según Clasificación

| Clasificación   | Acción                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `approved`      | Usar precios/tiempos sugeridos → Generar cotización PDF → Enviar al cliente                                                            |
| `modified`      | Usar precios/tiempos del empleado → Generar cotización PDF → Enviar al cliente                                                         |
| `oem_exclusive` | Enviar email al cliente explicando que la pieza es exclusiva OEM. Mensaje amable generado por Gemini basado en template configurable   |
| `obsolete`      | Enviar email al cliente explicando que la pieza está descontinuada. Mensaje amable generado por Gemini basado en template configurable |
| `needs_info`    | Enviar email al cliente solicitando la información faltante. También notificar en el chatbot si el cliente está conectado              |

**Umbral de confianza:** Si `confidence < 0.7`, NO procesar automáticamente. Marcar el request como `"pending_review"` y notificar al empleado que su respuesta no fue interpretada correctamente.

---

### Fase 5: Generación y Envío de la Cotización

#### 5.1 Generación del PDF

**Tecnología:** `@react-pdf/renderer` ejecutado en una API route de Next.js.

**Contenido del PDF:**

> ✅ Screenshots de la cotización oficial revisados. Archivos de referencia:
>
> - `quote_images/quote1.jpg` — Página 1: Header, datos del cliente, tabla de productos
> - `quote_images/quote2.jpg` — Página 2: Continuación tabla, tiempo de entrega, totales
> - `quote_images/quote3.jpg` — Página 3: Condiciones, firma (simplificaremos esta sección)

**Directrices del formato (basadas en la cotización oficial `12601926-PRONAL.pdf`):**

- Replicar el **estilo visual** del PDF oficial: limpio, profesional, fondo blanco, tipografía sans-serif.
- **NO incluir** las secciones legales extensas de la página 3 del original.
- **NO incluir** las descripciones técnicas largas del ventilador (en el original ocupa casi 2 páginas). Las cotizaciones de reemplazo son más simples: solo número de parte, cantidad, precio.
- La firma será mucho más sencilla: nota de generación automática + nombre del empleado que confirmó.
- La cotización de reemplazo debe caber en **1 sola página** (máximo 2 si hay muchos productos).

**Especificación Visual Detallada (extraída del PDF oficial):**

**HEADER:**

```
┌──────────────────────────────────────────────────────────────┐
│ [Texto pequeño gris:]                                        │
│ ZIEHL-ABEGG Inc. | 4971 Millennium Drive | Winston-Salem... │
│                                                              │
│ Purchaser / Cliente:              ┃  COTIZACIÓN              │
│ {companyName}                     ┃                          │
│ {fullName}                        ┃  página:     1 | 1       │
│ {deliveryLocation}                ┃  n° de cotización: {id}  │
│                                   ┃  n° de cliente: {nClte}  │
│                                   ┃                          │
│                                   ┃  contacto: {empleado}    │
│                                   ┃  {empleado_email}        │
│                                   ┃                          │
│                          [LOGO ZIEHL-ABEGG ►]  (esq sup der) │
└──────────────────────────────────────────────────────────────┘
```

- Logo ZIEHL-ABEGG: negro con la flecha/icono, **esquina superior derecha**.
- Título "COTIZACIÓN": bold, tamaño grande, alineado a la derecha debajo del logo.
- Datos del cliente a la **izquierda**, metadata de la cotización a la **derecha**.

**FRANJA DE FECHAS (fondo gris claro):**

```
┌──────────────────────────────────────────────────────────────┐
│ [fondo gris]                                                 │
│  fecha de solicitud    número de solicitud         fecha:     │
│  {fechaSolicitud}      {requestId}                {fechaHoy} │
└──────────────────────────────────────────────────────────────┘
```

**SALUDO + VIGENCIA:**

```
Estimado/a {fullName},
Estamos agradecidos por su solicitud de cotización.
Nos complace ofrecerle lo siguiente:

            precio válido hasta:    {fecha + 30 días}
```

**TABLA DE PRODUCTOS:**

```
┌──────────────────────────────────────────────────────────────┐
│ [Headers en bold:]                                           │
│  pos   cantidad    artículo         precio/pza.     Total    │
│ ─────────────────────────────────────────────────────────────│
│  1.0   {qty} pza   {partNumber}     {precio} USD   {sub} USD│
│  2.0   {qty} pza   {partNumber}     {precio} USD   {sub} USD│
└──────────────────────────────────────────────────────────────┘
```

- Columna `artículo`: Solo el número de parte (sin descripción técnica larga).
- Formato de precios: con separador de miles y 2 decimales (ej: `6,719.60 USD`).

**TIEMPO DE ENTREGA (bold):**

```
Tiempo de entrega: {X} semana(s)
```

**TOTALES (alineados a la derecha):**

```
                              Monto de productos    {subtotal} USD
                              IVA (16%)             {iva} USD
                              Suma total            {total} USD
```

**CIERRE SIMPLIFICADO (reemplaza la página 3 del original):**

```
Nuestra oferta no es obligatoria y está sujeta a cualquier cambio.
Le pedimos referirse a la oferta mencionada al momento de enviar la orden.

Atentamente
ZIEHL-ABEGG Inc.

{nombre_del_empleado}
(esta cotización fue generada automáticamente - válida sin firma)

Este documento es confidencial y está protegido por la ley.
Su divulgación no está autorizada.
```

> **Nota:** La frase "este documento esta computerizado - valido sin firma" viene directamente
> del formato original (página 3). La adaptaremos a: "esta cotización fue generada
> automáticamente - válida sin firma" para reflejar que es un proceso automatizado.

**Resumen de diferencias vs. el original:**

| Aspecto                  | Cotización Original                         | Nuestra Cotización de Reemplazo                   |
| ------------------------ | ------------------------------------------- | ------------------------------------------------- |
| Descripción del artículo | Muy larga (specs técnicas, 1-2 páginas)     | Solo número de parte                              |
| Secciones legales        | Párrafos extensos (garantía, DOE, términos) | Eliminadas                                        |
| Firma                    | Nombre del contacto + nota computerizado    | "Generada automáticamente" + nombre empleado      |
| IVA                      | No se muestra explícitamente                | Se muestra: Subtotal + IVA 16% + Total            |
| Páginas                  | 3 páginas                                   | 1 página (máximo 2)                               |
| Estilo visual            | Igual                                       | Replicar exactamente (tipografía, grises, layout) |

#### 5.2 Envío al Cliente

- **Vía Resend:** Se envía un correo formal con:
  - Asunto: `Su cotización ZAMX-Q-{quoteId} de ZIEHL-ABEGG México`
  - Cuerpo: Mensaje amable confirmando la cotización + resumen.
  - Adjunto: PDF de la cotización.
- **En el Chatbot:** Si el cliente tiene una sesión activa, se muestra la cotización directamente en el chat.
- **En el Historial:** La cotización se guarda en Convex asociada al usuario.

---

## 5. Modelo de Datos (Schema de Convex)

### 5.1 Tablas Principales

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  // Perfil extendido del usuario (sync con Clerk)
  users: defineTable({
    clerkId: v.string(),
    fullName: v.string(),
    companyName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    preferredLanguage: v.union(v.literal('es'), v.literal('en')),
    createdAt: v.number(),
  }).index('by_clerkId', ['clerkId']),

  // Sesiones de chat
  chatSessions: defineTable({
    userId: v.id('users'),
    status: v.union(
      v.literal('active'), // Chat en progreso
      v.literal('data_collected'), // Datos recopilados, pendiente envío
      v.literal('pending_employee'), // Esperando respuesta del empleado
      v.literal('quoted'), // Cotización enviada
      v.literal('special_case'), // Caso especial (OEM, obsoleto, etc.)
      v.literal('needs_info') // Falta información
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),

  // Mensajes del chat
  chatMessages: defineTable({
    sessionId: v.id('chatSessions'),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
    content: v.string(),
    timestamp: v.number(),
  }).index('by_sessionId', ['sessionId']),

  // Solicitudes de reemplazo (cada sesión puede tener una solicitud con múltiples productos)
  replacementRequests: defineTable({
    sessionId: v.id('chatSessions'),
    userId: v.id('users'),
    products: v.array(
      v.object({
        partNumber: v.string(),
        modelPrefix: v.string(),
        quantity: v.number(),
        deliveryLocation: v.string(),
        suggestedPriceUSD: v.optional(v.number()), // Precio random generado
        finalPriceUSD: v.optional(v.number()), // Precio aprobado/modificado por empleado
        suggestedDeliveryWeeks: v.optional(v.number()),
        finalDeliveryWeeks: v.optional(v.number()),
      })
    ),
    status: v.union(
      v.literal('pending_calculation'),
      v.literal('sent_to_employee'),
      v.literal('employee_approved'),
      v.literal('employee_modified'),
      v.literal('oem_exclusive'),
      v.literal('obsolete'),
      v.literal('needs_info'),
      v.literal('quoted'),
      v.literal('pending_review') // Baja confianza en interpretación
    ),
    employeeEmailSentAt: v.optional(v.number()),
    employeeResponseAt: v.optional(v.number()),
    employeeResponseRaw: v.optional(v.string()),
    employeeResponseClassification: v.optional(v.string()),
    specialCaseMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_sessionId', ['sessionId'])
    .index('by_status', ['status']),

  // Cotizaciones generadas
  quotes: defineTable({
    requestId: v.id('replacementRequests'),
    userId: v.id('users'),
    quoteNumber: v.string(), // "ZAMX-Q-XXXX"
    pdfStorageId: v.optional(v.id('_storage')), // PDF guardado en Convex Storage
    subtotalUSD: v.number(), // Suma de (precio * cantidad) por producto
    ivaAmount: v.number(), // subtotal * 0.16
    totalAmountUSD: v.number(), // subtotal + IVA
    confirmedByEmployee: v.string(), // Nombre del empleado que confirmó precios
    validUntil: v.number(), // timestamp (fecha + 30 días)
    sentToClientAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_requestId', ['requestId']),

  // ─── TABLAS DE CONFIGURACIÓN ───

  // Reglas de precios por prefijo de modelo (RANGO para generación aleatoria)
  pricingRules: defineTable({
    prefix: v.string(), // Ej: "GR45", "GR50", "GR56"
    minPriceUSD: v.number(), // Precio mínimo del rango
    maxPriceUSD: v.number(), // Precio máximo del rango
    description: v.optional(v.string()),
    isActive: v.boolean(),
  }).index('by_prefix', ['prefix']),

  // Configuración de temporadas de entrega
  deliverySeasons: defineTable({
    seasonName: v.string(), // "high" | "low"
    startMonth: v.number(), // 1-12
    endMonth: v.number(), // 1-12
    deliveryWeeks: v.number(),
    isActive: v.boolean(),
  }),

  // Templates de respuesta para casos especiales
  specialResponseTemplates: defineTable({
    caseType: v.string(), // "oem_exclusive" | "obsolete" | "needs_info"
    templateES: v.string(), // Template en español
    templateEN: v.string(), // Template en inglés
    description: v.string(),
    isActive: v.boolean(),
  }).index('by_caseType', ['caseType']),

  // Configuración del sistema
  systemConfig: defineTable({
    key: v.string(), // "employee_email", "imap_check_interval", etc.
    value: v.string(),
    description: v.optional(v.string()),
  }).index('by_key', ['key']),
});
```

---

## 6. Rutas y API Endpoints

### 6.1 Páginas (App Router)

| Ruta                           | Descripción                                  | Auth |
| ------------------------------ | -------------------------------------------- | ---- |
| `/`                            | Landing page + redirect a login              | No   |
| `/sign-in`                     | Login con Clerk                              | No   |
| `/sign-up`                     | Registro con Clerk                           | No   |
| `/dashboard`                   | Dashboard del cliente: chatbot + historial   | Sí   |
| `/dashboard/history`           | Lista de cotizaciones pasadas                | Sí   |
| `/dashboard/history/[quoteId]` | Detalle de una cotización (visualizador PDF) | Sí   |

### 6.2 API Routes

| Ruta                       | Método | Descripción                                          |
| -------------------------- | ------ | ---------------------------------------------------- |
| `/api/chat`                | POST   | Streaming endpoint para el chatbot (Vercel AI SDK)   |
| `/api/send-employee-email` | POST   | Envía solicitud al empleado via Resend               |
| `/api/cron/check-email`    | GET    | Cron job: revisa bandeja IMAP, interpreta respuestas |
| `/api/generate-quote-pdf`  | POST   | Genera PDF de cotización                             |
| `/api/send-client-quote`   | POST   | Envía cotización al cliente via Resend               |
| `/api/webhooks/clerk`      | POST   | Sync de usuarios Clerk → Convex                      |

---

## 7. Comportamiento del LLM — Especificaciones Detalladas

### 7.1 Chatbot (Recopilación de Datos)

**Modelo:** Gemini (via Vercel AI SDK)  
**Modo:** Streaming con structured output

**Herramientas (Tool Calling) del chatbot:**

1. `extractProductData` — Extrae y valida número de parte, modelo, cantidad y lugar de entrega del mensaje del usuario.
2. `confirmOrder` — Confirma con el usuario todos los productos recopilados antes de enviar al empleado.
3. `submitRequest` — Envía la solicitud completa al backend para procesamiento.

**Reglas de conversación:**

- Siempre saludar al usuario por nombre.
- Si el usuario no sabe dónde encontrar el número de parte, explicar con instrucciones claras (la etiqueta suele estar en la carcasa lateral del ventilador o en la placa de datos técnicos).
- Validar que el número de parte tenga un formato coherente con ZIEHL-ABEGG.
- Nunca inventar precios o tiempos de entrega.
- Permitir múltiples productos por sesión.
- Al final, mostrar un resumen de todos los productos y pedir confirmación.

### 7.2 Parsing de Emails del Empleado

**Modelo:** Gemini (via Vercel AI SDK)  
**Modo:** Structured output (JSON)

**El prompt está detallado en la Sección 4.2.**

**Reglas:**

- Si la respuesta es ambigua, clasificar con `confidence < 0.7`.
- Nunca asumir aprobación si no hay confirmación explícita.
- Extraer montos numéricos incluso si están formateados de formas variadas ("$500", "500 dólares", "quinientos").

---

## 8. Configuración de Servicios Externos

### 8.1 Clerk

- Crear app en Clerk Dashboard.
- Habilitar solo: Email + Password.
- Configurar webhook para sync de usuarios con Convex.
- Variables de entorno: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`.

### 8.2 Convex

- Inicializar proyecto Convex en el repo.
- Configurar schema (ver sección 5).
- Variables de entorno: se configuran automáticamente con `npx convex dev`.

### 8.3 Resend

- Crear cuenta en Resend.
- Generar API key.
- Configurar dominio de envío (o usar sandbox de Resend para desarrollo).
- Variables de entorno: `RESEND_API_KEY`.

### 8.4 Google AI (Gemini)

- API key de Google AI Studio.
- Variables de entorno: `GOOGLE_GENERATIVE_AI_API_KEY`.

### 8.5 IMAP (Cuenta de Email del Sistema)

- Crear cuenta de email dedicada (ej. Gmail con App Password).
- Variables de entorno: `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`.

### 8.6 Resumen de Variables de Entorno

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Convex
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=

# Google AI
GOOGLE_GENERATIVE_AI_API_KEY=

# Resend
RESEND_API_KEY=

# IMAP (email del sistema)
IMAP_HOST=
IMAP_PORT=
IMAP_USER=
IMAP_PASSWORD=

# Config
EMPLOYEE_EMAIL=                    # Email del empleado de ventas
SYSTEM_EMAIL=                      # Email del sistema (Reply-To)
```

---

## 9. Fases de Desarrollo del MVP

### Fase 1: Fundación (Setup del Proyecto)

- [ ] Inicializar proyecto Next.js con App Router
- [ ] Integrar Clerk (auth, login, registro)
- [ ] Inicializar Convex y definir schema completo
- [ ] Configurar webhook Clerk → Convex para sync de usuarios
- [ ] Crear layout principal con navegación básica
- [ ] Implementar selector de idioma (ES/EN)
- [ ] Crear página de dashboard (estructura)

### Fase 2: Chatbot Conversacional

- [ ] Instalar y configurar Vercel AI SDK con Gemini
- [ ] Diseñar UI del chatbot (interfaz de mensajes, input, scroll)
- [ ] Implementar system prompt con las reglas de conversación
- [ ] Implementar tool calling para extracción de datos
- [ ] Crear flujo multi-producto (agregar/confirmar/enviar)
- [ ] Almacenar mensajes del chat en Convex (`chatMessages`)
- [ ] Almacenar sesiones de chat en Convex (`chatSessions`)
- [ ] Testing del chatbot con diferentes escenarios de conversación

### Fase 3: Motor de Precios y Envío al Empleado

- [ ] Implementar tabla `pricingRules` con seed data
- [ ] Implementar tabla `deliverySeasons` con seed data
- [ ] Crear función Convex para calcular precio sugerido por prefijo
- [ ] Crear función Convex para calcular tiempo de entrega por temporada
- [ ] Crear la tabla `replacementRequests` y guardar solicitudes
- [ ] Diseñar template de email con React Email
- [ ] Implementar envío de email al empleado via Resend
- [ ] Testing del flujo completo: chatbot → precio → email

### Fase 4: Recepción de Respuestas del Empleado

- [ ] Configurar cuenta de email del sistema (Gmail + App Password)
- [ ] Implementar conexión IMAP con `imapflow`
- [ ] Crear API route `/api/cron/check-email`
- [ ] Implementar parsing del asunto para extraer `requestId`
- [ ] Implementar prompt de interpretación con Gemini
- [ ] Manejar las 5 clasificaciones de respuesta
- [ ] Implementar umbral de confianza y estado `pending_review`
- [ ] Configurar Vercel Cron Job
- [ ] Testing con diferentes tipos de respuesta del empleado

### Fase 5: Generación de Cotización y Entrega al Cliente

- [ ] Diseñar template PDF con `@react-pdf/renderer`
  - (Usar el template de cotización proporcionado por el usuario como referencia)
- [ ] Implementar generación de PDF en API route
- [ ] Guardar PDF en Convex Storage
- [ ] Implementar envío de cotización al cliente via Resend
- [ ] Crear templates de email para casos especiales (OEM, obsoleto, falta info)
- [ ] Implementar página de historial (`/dashboard/history`)
- [ ] Implementar vista de detalle de cotización
- [ ] Testing del flujo completo end-to-end

### Fase 6: Pulido del MVP

- [ ] Manejo de errores robusto en todos los flujos
- [ ] Logging y monitoreo básico
- [ ] Internacionalización (i18n) completa ES/EN
- [ ] Seed data para configuración inicial
- [ ] Documentación de deployment
- [ ] Deploy a Vercel

---

## 10. Items Pendientes del Usuario

Los siguientes items son necesarios para completar el masterplan y deben ser proporcionados antes o durante el desarrollo:

1. ~~**🔴 Algoritmo de precios detallado:**~~ ✅ **COMPLETADO** — Rango por prefijo con generación aleatoria + IVA 16%.
2. ~~**🔴 Tiempos de entrega exactos:**~~ ✅ **COMPLETADO** — 12 semanas (alta), 8 semanas (baja).
3. ~~**🟡 Screenshot del template de cotización:**~~ ✅ **COMPLETADO** — Screenshots revisados en `quote_images/`. Especificación visual detallada documentada en sección 5.1.
4. **🟡 Logo de ZIEHL-ABEGG:** Archivo de alta resolución (PNG/SVG) para el PDF y la webapp.
5. **🟢 Datos de contacto de ZIEHL-ABEGG México:** Para el footer de la cotización y la webapp.
6. **🟢 Email del empleado de ventas:** Dirección fija donde se enviarán las solicitudes.
7. **🟢 Nombre del empleado de ventas:** Para mostrar en la cotización como "Precios confirmados por: {nombre}".
8. **🟢 Ejemplo de números de parte y modelos reales (con prefijos válidos como GR45/GR50/GR56):** Para validar el formato en el chatbot y crear test data (ej: `162562` con modelo `GR45-...`).

---

## 11. Decisiones Pendientes

- [ ] **¿Qué pasa si el cron job falla?** → Implementar retry logic y alertas.
- [ ] **¿El empleado puede responder múltiples veces?** → Solo se procesa la primera respuesta.
- [ ] **¿Timeout del empleado?** → ¿Qué pasa si el empleado no responde en X días? → Enviar recordatorio automático.
- [ ] **¿Panel de admin?** → Decidido para después del MVP. Se podrá configurar precios, templates, y respuestas especiales desde una UI.
- [ ] **¿Vision/Fotos de etiquetas?** → Decidido para después del MVP. El cliente solo interactúa por texto en el chatbot.

---

## 12. Notas Técnicas Adicionales

### 12.1 Seguridad

- Todas las API routes protegidas con autenticación de Clerk (middleware).
- El cron job debe validarse con un `CRON_SECRET` para evitar invocaciones no autorizadas.
- Los emails entrantes deben validar que el remitente sea el empleado autorizado.

### 12.2 Rate Limiting

- Limitar llamadas al LLM por usuario/sesión para evitar abuso.
- Implementar rate limiting en el endpoint del chatbot.

### 12.3 Gestión de Estado del Chat

- Los mensajes del chat se almacenan en Convex para persistencia.
- Si el usuario cierra el browser y regresa, puede continuar la conversación donde la dejó.
- La sesión de chat tiene estados que determinan qué UI se muestra (chat activo, esperando respuesta, cotización lista, etc.).

### 12.4 Manejo de Errores del Email

- Si Resend falla al enviar, reintentar hasta 3 veces con backoff exponencial.
- Si IMAP falla al conectar, loggear error y reintentar en el siguiente ciclo del cron.
- Si Gemini no puede interpretar la respuesta, marcar como `pending_review`.
