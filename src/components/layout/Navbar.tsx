'use client';

import { UserButton } from '@clerk/nextjs';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export default function Navbar() {
  const user = useQuery(api.users.current);
  const updateLanguage = useMutation(api.users.updateLanguage);

  const toggleLanguage = () => {
    if (!user) return;
    const newLang = user.preferredLanguage === 'es' ? 'en' : 'es';
    updateLanguage({ language: newLang });
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-white/70 dark:bg-[#0a0a0a]/70 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm transition-all duration-300">
      <div className="mx-auto max-w-5xl px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Temporary Logo Placeholder */}
          <div className="w-8 h-8 rounded bg-[var(--color-brand-blue)] text-white flex items-center justify-center font-bold text-lg shadow-inner">
            Z
          </div>
          <span className="font-semibold text-lg tracking-tight text-[var(--color-brand-blue)] dark:text-white">
            ZIEHL-ABEGG
            <span className="text-gray-400 font-light ml-1 text-sm hidden sm:inline-block">
              Replacements
            </span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <button
              onClick={toggleLanguage}
              className="text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-[var(--color-brand-blue)] transition-colors px-3 py-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
            >
              {user.preferredLanguage === 'es' ? 'ES / en' : 'es / EN'}
            </button>
          )}
          <div className="h-8 w-8 rounded-full shadow-sm overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </div>
    </header>
  );
}
