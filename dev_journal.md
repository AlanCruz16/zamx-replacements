# Bitácora de Desarrollo (Dev Journal)

**Proyecto:** ZAMX_replacements
**Inicio:** 2026-06-05

## Fase 1A: Setup Base y Configuración

- Inicialización de Next.js 16.2.7 con Tailwind v4.
- Instalación de dependencias: Clerk, Convex, Svix.
- Configuración de husky y lint-staged (se ajustó formato a JSON por problemas con ESLint).

## Fase 1B: Auth y Schema

- Se definió el esquema de base de datos (`users`, `quotes`, `pricing_rules`, `delivery_seasons`) en Convex.
- Se configuró la autenticación con Clerk, usando `ConvexClientProvider`.
- Se configuró el webhook de Clerk con Svix para que inserte a los nuevos usuarios en la tabla `users` de Convex automáticamente.

## Fase 1C: Layout y Dashboard

- Implementación completa de la UI del dashboard en `src/app/page.tsx` usando diseño Premium (colores corporativos ZIEHL-ABEGG y glassmorphism).
- Se creó `Navbar.tsx` con un selector de idioma conectado en tiempo real a Convex.
- Corrección de bucle infinito en React estabilizando los hooks de Clerk y Convex en `ConvexClientProvider`.
- **Fase 1 completada con éxito.**

## Fase 2: Chatbot (Gemini)

- Integración exitosa de Vercel AI SDK (`ai`, `@ai-sdk/google`, `zod`).
- Creación del endpoint `api/chat/route.ts` con System Prompt estricto.
- Implementación de `useChat` en el Frontend con diseño de chat y Burbujas.
- Creación de Tool `submit_quote_request` validado en Zod.
- **Fase 2 completada con éxito.**

## Fase 3: Cálculo, Base de Datos y Notificaciones (Email)

- Se interceptó la ejecución de la herramienta `submit_quote_request`.
- Se implementó un algoritmo aleatorio de precios y tiempos de entrega en Convex (`quotes:create`) basado en reglas de prefijos y temporalidad guardadas en BD mediante un script semilla (`init.ts`).
- Se guardó el resultado del cálculo en la tabla `quotes` de Convex vinculando el `clerkId` del cliente.
- Se integró la librería `resend` en la ruta `/api/chat/route.ts` de Next.js para enviar notificaciones automáticas al equipo de ventas.
- Se implementó una plantilla visual con `@react-email/components` (`QuoteRequestTemplate.tsx`).
- Se crearon rutas para pruebas manuales (`/api/test-email`).
- Solución de stale closures en `useChat` pasando el payload de usuario mediante ref reactivo (`userRef.current`).
- **Fase 3 completada con éxito.**

## Siguiente Paso: Fase 4 (Recepción de Respuestas del Empleado)

- Configurar buzón de correo y conexión IMAP (`imapflow`).
- Crear un Cron Job (`/api/cron/check-email`) para leer correos nuevos.
- Integrar Gemini para leer el cuerpo del correo e interpretar la decisión del vendedor.
- Actualizar el estado de la cotización en Convex (aprobado, modificado, etc.).
