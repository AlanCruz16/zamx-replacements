import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { authorizeInternalRequest } from '@/lib/internal-secret';
import { INTERNAL_API_ROUTES } from '@/lib/internal-routes';

// Define public routes (login/signup are handled by Clerk automatically if needed,
// but we leave them public just in case. Webhooks must be public).
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/api/cron(.*)',
]);

// La lista vive en `lib/internal-routes.ts`, donde se puede leer sin cargar
// Clerk; ahí está también por qué olvidar una ruta se ve como un 404.
const isInternalApiRoute = createRouteMatcher(INTERNAL_API_ROUTES.map((route) => `${route}(.*)`));

export default clerkMiddleware(async (auth, request) => {
  if (isInternalApiRoute(request)) {
    const denied = authorizeInternalRequest(request);
    if (denied) {
      return new NextResponse(denied.error, { status: denied.status });
    }
    return NextResponse.next();
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
