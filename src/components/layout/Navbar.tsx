'use client';

import { UserButton } from '@clerk/nextjs';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FileText, Globe, Home } from 'lucide-react';
import { ExpandableTabs, TabItem } from '@/components/ui/expandable-tabs';
import QuotesModal from './QuotesModal';
import { messagesFor, resolveLanguage } from '@/lib/messages';

/**
 * `onHome` es lo que hace «Inicio» cuando la pantalla que contiene la barra sabe
 * a dónde es «inicio» para ella —la de chat lo usa para salirse de la
 * conversación que el Customer tenga a medias—. Sin él la barra navega a la raíz
 * y ya está, que es lo correcto para una pantalla que no tiene nada que
 * abandonar.
 *
 * Puede tardar: la pantalla de chat escribe en el servidor antes de dejar la
 * conversación. Por eso el tipo admite una promesa —tiparla como síncrona la
 * hacía verdad sólo por no mirarla—, y lo que devuelva se mira. Quién le
 * cuenta al Customer que no se pudo salir es la pantalla que sabe lo que
 * intentaba; aquí sólo se garantiza que un fallo no se pierda en silencio.
 */
export default function Navbar({ onHome }: { onHome?: () => void | Promise<void> }) {
  const user = useQuery(api.users.current);
  const updateLanguage = useMutation(api.users.updateLanguage);
  const [isQuotesModalOpen, setIsQuotesModalOpen] = useState(false);
  const router = useRouter();

  const toggleLanguage = () => {
    if (!user) return;
    const newLang = user.preferredLanguage === 'es' ? 'en' : 'es';
    updateLanguage({ language: newLang });
  };

  // Mientras Convex no ha contestado quién es el Customer no hay barra que
  // pintar, así que el idioma por defecto sirve para armar los tabs sin que se
  // llegue a ver ninguno en el idioma equivocado.
  const language = resolveLanguage(user?.preferredLanguage);
  const t = messagesFor(language).nav;

  const tabs: TabItem[] = [
    { title: t.home, icon: Home },
    { type: 'separator' },
    // La etiqueta pone en mayúscula el idioma activo: el control dice a la vez
    // dónde estás y a dónde te lleva.
    { title: t.languageToggle, icon: Globe },
    { type: 'separator' },
    { title: t.quotes, icon: FileText },
  ];

  const handleTabChange = (index: number | null) => {
    if (index === 0) {
      // Navegación dentro de la app: `window.location.href` forzaba una carga
      // entera del documento —el bundle, el handshake y todas las consultas otra
      // vez—, que es lo más caro que un Customer puede tocar con datos móviles.
      if (onHome) {
        Promise.resolve(onHome()).catch((error) => {
          console.error('«Inicio» no pudo completarse:', error);
        });
      } else router.push('/');
    } else if (index === 2) {
      toggleLanguage();
    } else if (index === 4) {
      setIsQuotesModalOpen(true);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-white/70 dark:bg-[#0a0a0a]/70 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm transition-all duration-300">
        <div className="mx-auto max-w-5xl pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.svg" alt={t.logoAlt} className="w-8 h-8 object-contain" />
            <span className="text-4xl leading-none ml-1" title={t.countryTitle}>
              🇲🇽
            </span>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <ExpandableTabs
                tabs={tabs}
                onChange={handleTabChange}
                activeColor="text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)]"
                className="border-gray-200/50 dark:border-gray-800/50 bg-white/50 dark:bg-[#111111]/50 backdrop-blur-sm"
              />
            )}
            <div className="h-8 w-8 rounded-full shadow-sm overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-800">
              <UserButton />
            </div>
          </div>
        </div>
      </header>

      {user && (
        <QuotesModal isOpen={isQuotesModalOpen} onClose={() => setIsQuotesModalOpen(false)} />
      )}
    </>
  );
}
