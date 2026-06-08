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

## Siguiente Paso: Fase 3 (Cálculo y Base de Datos)

- Interceptar la ejecución de `submit_quote_request`.
- Algoritmo aleatorio de precios basado en prefijos de modelo.
- Guardar historial en Convex.
