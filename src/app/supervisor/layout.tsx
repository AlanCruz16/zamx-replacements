import React from 'react';
import { UserButton } from '@clerk/nextjs';
import { SupervisorNav } from '@/components/supervisor/SupervisorNav';
import { SUPERVISOR_MESSAGES as t } from '@/lib/messages';
import { requireSupervisorPage } from '@/lib/supervisor-access';

/**
 * El armazón del panel del Supervisor: cabecera y navegación entre secciones.
 *
 * Vive fuera de la pantalla de chat, que es la única que manda al alta del
 * Customer, así que un Supervisor sin empresa no acaba en el alta. La puerta la
 * cruza aquí y otra vez en cada página (`supervisor-access.ts` explica por qué).
 */
export default async function SupervisorLayout({ children }: { children: React.ReactNode }) {
  await requireSupervisorPage();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-50 w-full bg-white/70 dark:bg-[#0a0a0a]/70 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm">
        <div className="mx-auto max-w-6xl pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.svg" alt={t.logoAlt} className="w-8 h-8 object-contain" />
            <span className="font-semibold truncate">{t.title}</span>
          </div>
          <div className="h-8 w-8 shrink-0 rounded-full shadow-sm overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <UserButton />
          </div>
        </div>
        <div className="mx-auto max-w-6xl pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))]">
          <SupervisorNav />
        </div>
      </header>

      <main className="flex-1 w-full mx-auto max-w-6xl pt-6 pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] pb-[calc(1.5rem+var(--safe-bottom))]">
        {children}
      </main>
    </div>
  );
}
