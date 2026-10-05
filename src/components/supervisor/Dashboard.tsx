'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { AWAITING_REVIEW, OUTCOME_FILTERS } from '../../../convex/lib/outcome';
import { Card } from './Card';
import { PeriodPicker } from './PeriodPicker';
import { StackedCell } from './StackedCell';
import { periodBounds, type PeriodPreset } from '@/lib/supervisor-period';
import { dashboardHref, listViewHref, readPeriodPreset } from '@/lib/supervisor-list-url';
import { SUPERVISOR_MESSAGES } from '@/lib/messages';

const t = SUPERVISOR_MESSAGES;

const LINK = 'text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)]';

/**
 * El resumen del panel para un periodo: cuántas llegaron, cómo terminaron y
 * quién pide más. Nunca dinero.
 *
 * El periodo vive en la URL con la misma clave que la lista, así que volver
 * atrás desde una lista enlazada lo conserva.
 */
export function Dashboard() {
  const preset = readPeriodPreset(useSearchParams());
  const router = useRouter();
  const show = (next: PeriodPreset) => router.push(dashboardHref(next), { scroll: false });

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.nav.dashboard}</h1>
        <PeriodPicker value={preset} onChange={show} />
      </div>

      {/* Como en la lista: la clave resuelve el periodo una vez por elección. */}
      <Figures key={preset} preset={preset} />
    </section>
  );
}

function Figures({ preset }: { preset: PeriodPreset }) {
  const [period] = useState(() => periodBounds(preset, Date.now()));

  // Sin el token en Convex todavía, `null` se pintaría como ceros.
  const { isAuthenticated } = useConvexAuth();
  const summary = useQuery(api.supervisor.dashboard, isAuthenticated ? { period } : 'skip');

  if (!summary) return <p className="mt-6 text-sm text-gray-500">{t.dashboard.loading}</p>;

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <Card title={t.dashboard.received}>
        <p className="text-4xl font-semibold tabular-nums">{summary.received}</p>
      </Card>

      <Card title={t.dashboard.neverRequested}>
        <p className="text-4xl font-semibold tabular-nums">{summary.neverRequested}</p>
        <p className="mt-1 text-xs text-gray-500">{t.dashboard.neverRequestedNote}</p>
      </Card>

      <Card title={t.dashboard.byOutcomeHeading}>
        <ul className="divide-y divide-gray-200 dark:divide-gray-800 text-sm">
          {OUTCOME_FILTERS.map((outcome) => {
            const label = outcome === AWAITING_REVIEW ? t.awaitingReview : t.outcomes[outcome];
            return (
              <li key={outcome}>
                <Link
                  href={listViewHref({ preset, filters: { outcome } })}
                  aria-label={t.dashboard.openOutcome(label)}
                  className="flex items-center justify-between gap-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                >
                  <span>{label}</span>
                  <span className={`font-medium tabular-nums ${LINK}`}>
                    {summary.byOutcome[outcome]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={t.dashboard.topCustomersHeading}>
        {summary.topCustomers.length === 0 ? (
          <p className="text-sm text-gray-500">{t.dashboard.noTopCustomers}</p>
        ) : (
          <table className="block md:table w-full text-sm">
            <thead className="hidden md:table-header-group text-left text-gray-500">
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="py-2 pr-4 font-medium">{t.dashboard.topColumns.customer}</th>
                <th className="py-2 pr-4 font-medium">{t.dashboard.topColumns.company}</th>
                <th className="py-2 pr-4 font-medium text-right">
                  {t.dashboard.topColumns.requests}
                </th>
                <th className="py-2 font-medium text-right">{t.dashboard.topColumns.units}</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group space-y-3 md:space-y-0">
              {summary.topCustomers.map((customer) => (
                <tr
                  key={customer.customerId}
                  className="relative block md:table-row rounded-lg border md:border-0 md:border-b border-gray-200 dark:border-gray-800 p-3 md:p-0 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                >
                  <StackedCell label={t.dashboard.topColumns.customer}>
                    {/* El enlace cubre la fila entera: toda ella abre el detalle. */}
                    <Link
                      href={`/supervisor/customers/${customer.customerId}`}
                      className={`font-medium ${LINK} after:absolute after:inset-0`}
                    >
                      {customer.fullName}
                    </Link>
                  </StackedCell>
                  <StackedCell label={t.dashboard.topColumns.company}>
                    {customer.companyName}
                  </StackedCell>
                  <StackedCell label={t.dashboard.topColumns.requests} numeric>
                    {customer.requestCount}
                  </StackedCell>
                  <StackedCell label={t.dashboard.topColumns.units} numeric>
                    {customer.unitCount}
                  </StackedCell>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
