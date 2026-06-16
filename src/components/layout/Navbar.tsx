'use client';

import { UserButton } from '@clerk/nextjs';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useState } from 'react';
import { FileText, Globe, Home } from 'lucide-react';
import { ExpandableTabs, TabItem } from '@/components/ui/expandable-tabs';
import QuotesModal from './QuotesModal';

export default function Navbar() {
  const user = useQuery(api.users.current);
  const updateLanguage = useMutation(api.users.updateLanguage);
  const [isQuotesModalOpen, setIsQuotesModalOpen] = useState(false);

  const toggleLanguage = () => {
    if (!user) return;
    const newLang = user.preferredLanguage === 'es' ? 'en' : 'es';
    updateLanguage({ language: newLang });
  };

  const tabs: TabItem[] = [
    { title: 'Inicio', icon: Home },
    { type: 'separator' },
    { title: user?.preferredLanguage === 'es' ? 'ES / en' : 'es / EN', icon: Globe },
    { type: 'separator' },
    { title: 'Mis Cotizaciones', icon: FileText },
  ];

  const handleTabChange = (index: number | null) => {
    if (index === 0) {
      window.location.href = '/';
    } else if (index === 2) {
      toggleLanguage();
    } else if (index === 4) {
      setIsQuotesModalOpen(true);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-white/70 dark:bg-[#0a0a0a]/70 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm transition-all duration-300">
        <div className="mx-auto max-w-5xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.svg" alt="ZIEHL-ABEGG Logo" className="w-8 h-8 object-contain" />
            <span className="text-4xl leading-none ml-1" title="México">
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
              <UserButton afterSignOutUrl="/" />
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
