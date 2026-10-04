'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useConvexAuth, usePaginatedQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { OutcomeTag } from './OutcomeTag';
import { StackedCell } from './StackedCell';
import { PeriodPicker } from './PeriodPicker';
import { DEFAULT_PERIOD, periodBounds, type PeriodPreset } from '@/lib/supervisor-period';
import { formatDateTime, SUPERVISOR_MESSAGES } from '@/lib/messages';

const t = SUPERVISOR_MESSAGES;
const PAGE_SIZE = 25;

/**
 * Las Replacement Requests del periodo, de la más reciente a la más antigua.
 *
 * En pantallas estrechas la tabla deja de serlo: cada fila se apila como una
 * tarjeta con la etiqueta de cada dato delante, en vez de desplazarse de lado.
 */
export function RequestList() {
  // El periodo se resuelve una vez por elección, no en cada render: un
  // `Date.now()` por render sería una suscripción nueva en cada render.
  const [{ preset, period }, setSelection] = useState(() => resolvePeriod(DEFAULT_PERIOD));

  // Hasta que el token de Clerk alcanza a Convex no se pregunta: sin sesión la
  // consulta no devuelve nada, y eso se pintaría como «no hay solicitudes».
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.supervisor.listRequests,
    isAuthenticated ? { period } : 'skip',
    { initialNumItems: PAGE_SIZE }
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.nav.requests}</h1>
        <PeriodPicker value={preset} onChange={(next) => setSelection(resolvePeriod(next))} />
      </div>

      {status === 'LoadingFirstPage' ? (
        <p className="mt-6 text-sm text-gray-500">{t.requests.loading}</p>
      ) : results.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">{t.requests.empty}</p>
      ) : (
        <table className="mt-6 block md:table w-full text-sm">
          <thead className="hidden md:table-header-group text-left text-gray-500">
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="py-2 pr-4 font-medium">{t.requests.columns.requestId}</th>
              <th className="py-2 pr-4 font-medium">{t.requests.columns.receivedAt}</th>
              <th className="py-2 pr-4 font-medium">{t.requests.columns.customer}</th>
              <th className="py-2 pr-4 font-medium">{t.requests.columns.company}</th>
              <th className="py-2 pr-4 font-medium text-right">{t.requests.columns.parts}</th>
              <th className="py-2 font-medium">{t.requests.columns.outcome}</th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group space-y-3 md:space-y-0">
            {results.map((row) => (
              <tr
                key={row._id}
                className="relative block md:table-row rounded-lg border md:border-0 md:border-b border-gray-200 dark:border-gray-800 p-3 md:p-0 hover:bg-gray-50 dark:hover:bg-gray-900/50"
              >
                <StackedCell label={t.requests.columns.requestId}>
                  {/* El enlace cubre la fila entera: toda ella abre el detalle. */}
                  <Link
                    href={`/supervisor/requests/${row.requestId}`}
                    className="font-mono font-medium text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)] after:absolute after:inset-0"
                  >
                    {row.requestId}
                  </Link>
                </StackedCell>
                <StackedCell label={t.requests.columns.receivedAt}>
                  {formatDateTime(row.receivedAt, 'es')}
                </StackedCell>
                <StackedCell label={t.requests.columns.customer}>{row.customerName}</StackedCell>
                <StackedCell label={t.requests.columns.company}>{row.companyName}</StackedCell>
                <StackedCell label={t.requests.columns.parts} numeric>
                  {row.partCount}
                </StackedCell>
                <StackedCell label={t.requests.columns.outcome}>
                  <OutcomeTag outcome={row.outcome} />
                </StackedCell>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {status === 'CanLoadMore' && (
        <button
          type="button"
          onClick={() => loadMore(PAGE_SIZE)}
          className="mt-4 rounded-md border border-gray-200 dark:border-gray-800 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-900/50"
        >
          {t.requests.loadMore}
        </button>
      )}
      {status === 'LoadingMore' && (
        <p className="mt-4 text-sm text-gray-500">{t.requests.loading}</p>
      )}
    </section>
  );
}

function resolvePeriod(preset: PeriodPreset) {
  return { preset, period: periodBounds(preset, Date.now()) };
}
