import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * El logo del Quote Document se lee de disco y se incrusta en el PDF
   * (`src/lib/quote-logo.ts`). El trazado de archivos sólo sigue los `import`,
   * y `public/` no viaja al servidor por sí solo, así que las dos rutas que
   * renderizan PDF lo declaran aquí: sin esta entrada el archivo está en el
   * repositorio pero no en la función desplegada.
   */
  outputFileTracingIncludes: {
    '/api/download-quote': ['./public/logo_final.png'],
    '/api/send-client-quote': ['./public/logo_final.png'],
  },
};

export default nextConfig;
