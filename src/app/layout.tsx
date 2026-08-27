import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import ConvexClientProvider from '@/components/providers/ConvexClientProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ZAMX Replacements',
  description: 'Sistema de reemplazos para ZIEHL-ABEGG',
};

/*
  Se dibuja por debajo de lo que el aparato se reserva —el notch, la barra de
  gestos— y cada pantalla aparta su contenido de ahí con `--safe-*`
  (ticket 04 de «usable-on-a-phone»). Sin `viewport-fit: cover` los insets valen
  siempre 0 y no hay nada que apartar.
*/
export const viewport: Viewport = {
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-[100dvh] flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
