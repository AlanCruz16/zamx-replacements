'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConvexAuth, usePaginatedQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { hasFilters, type RequestFilters } from '../../../convex/lib/request_filters';
import { PeriodPicker } from './PeriodPicker';
import { RequestFilterBar } from './RequestFilterBar';
import { RequestTable } from './RequestTable';
import { periodBounds, type PeriodPreset } from '@/lib/supervisor-period';
import { listViewHref, readListView, type ListView } from '@/lib/supervisor-list-url';
import { SUPERVISOR_MESSAGES } from '@/lib/messages';

const t = SUPERVISOR_MESSAGES;
const PAGE_SIZE = 25;

/**
 * Las Replacement Requests del periodo, de la más reciente a la más antigua,
 * con sus filtros.
 *
 * El periodo y los filtros se leen de la URL y se escriben en ella, así que una
 * vista filtrada se puede enlazar y volver atrás la restaura.
 */
export function RequestList() {
  const view = readListView(useSearchParams());
  const router = useRouter();
  const show = (next: ListView) => router.push(listViewHref(next), { scroll: false });

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.nav.requests}</h1>
        <PeriodPicker value={view.preset} onChange={(preset) => show({ ...view, preset })} />
      </div>

      {/*
        La clave remonta la lista al cambiar de preajuste: así el periodo se
        resuelve una vez por elección, no en cada render. Un `Date.now()` por
        render sería una suscripción nueva en cada render.
      */}
      <FilteredRequests
        key={view.preset}
        preset={view.preset}
        filters={view.filters}
        onFilter={(filters) => show({ ...view, filters })}
      />
    </section>
  );
}

function FilteredRequests({
  preset,
  filters,
  onFilter,
}: {
  preset: PeriodPreset;
  filters: RequestFilters;
  onFilter: (filters: RequestFilters) => void;
}) {
  const [period] = useState(() => periodBounds(preset, Date.now()));

  // Hasta que el token de Clerk alcanza a Convex no se pregunta: sin sesión la
  // consulta no devuelve nada, y eso se pintaría como «no hay solicitudes».
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.supervisor.listRequests,
    isAuthenticated ? { period, filters } : 'skip',
    { initialNumItems: PAGE_SIZE }
  );

  const customerName = results.find((row) => row.customerId === filters.customerId)?.customerName;

  return (
    <>
      <RequestFilterBar filters={filters} customerName={customerName} onChange={onFilter} />

      {status === 'LoadingFirstPage' ? (
        <p className="mt-6 text-sm text-gray-500">{t.requests.loading}</p>
      ) : results.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">
          {hasFilters(filters) ? t.requests.emptyFiltered : t.requests.empty}
        </p>
      ) : (
        <div className="mt-6">
          <RequestTable
            rows={results}
            onFilterCustomer={(customerId) => onFilter({ ...filters, customerId })}
          />
        </div>
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
    </>
  );
}
