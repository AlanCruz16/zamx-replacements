'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, FileText, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPERVISOR_MESSAGES as t } from '@/lib/messages';

const SECTIONS = [
  { href: '/supervisor', label: t.nav.dashboard, icon: BarChart3 },
  { href: '/supervisor/requests', label: t.nav.requests, icon: FileText },
  { href: '/supervisor/customers', label: t.nav.customers, icon: Users },
] as const;

/**
 * Las tres secciones del panel. El resumen es la raíz, así que sólo se marca
 * activo en la raíz exacta; las otras dos, también en sus detalles.
 */
export function SupervisorNav() {
  const pathname = usePathname();

  return (
    <nav aria-label={t.navLabel} className="flex gap-1 overflow-x-auto -mb-px">
      {SECTIONS.map(({ href, label, icon: Icon }) => {
        const active = href === '/supervisor' ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap px-3 py-3 text-sm border-b-2 transition-colors',
              active
                ? 'border-[var(--color-brand-blue)] text-[var(--color-brand-blue)] dark:border-[var(--color-brand-light)] dark:text-[var(--color-brand-light)] font-medium'
                : 'border-transparent text-gray-500 hover:text-[var(--foreground)]'
            )}
          >
            <Icon className="w-4 h-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
