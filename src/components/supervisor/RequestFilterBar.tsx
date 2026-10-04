'use client';

import { useId } from 'react';
import { X } from 'lucide-react';
import { hasFilters, type RequestFilters } from '../../../convex/lib/request_filters';
import { AWAITING_REVIEW, OUTCOME_FILTERS, type OutcomeFilter } from '../../../convex/lib/outcome';
import { SUPERVISOR_MESSAGES } from '@/lib/messages';

const t = SUPERVISOR_MESSAGES;

const FIELD =
  'rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0a0a0a] px-2 py-1.5';

/**
 * Los filtros de la lista: Outcome (con «en revisión» como uno más), código
 * `REQ-` y, cuando se eligió desde una fila, el Customer. Se combinan entre sí
 * y con el periodo; quien los guarda es la URL, no este componente.
 */
export function RequestFilterBar({
  filters,
  customerName,
  onChange,
}: {
  filters: RequestFilters;
  /** El nombre del Customer filtrado, si alguna fila lo trae. */
  customerName?: string;
  onChange: (filters: RequestFilters) => void;
}) {
  const outcomeId = useId();
  const searchId = useId();

  // Quitar un filtro es dejarlo sin valor: la URL no escribe lo que no tiene.
  const without = (key: keyof RequestFilters): RequestFilters => ({ ...filters, [key]: undefined });

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm">
      <div className="flex items-center gap-2">
        <label htmlFor={outcomeId} className="text-gray-500">
          {t.requests.filters.outcome}
        </label>
        <select
          id={outcomeId}
          value={filters.outcome ?? ''}
          onChange={(event) => {
            const value = event.target.value as OutcomeFilter | '';
            onChange(value ? { ...filters, outcome: value } : without('outcome'));
          }}
          className={FIELD}
        >
          <option value="">{t.requests.filters.anyOutcome}</option>
          {OUTCOME_FILTERS.map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcome === AWAITING_REVIEW ? t.awaitingReview : t.outcomes[outcome]}
            </option>
          ))}
        </select>
      </div>

      {/*
        Busca al enviar, no al teclear: el código se compara entero, y uno a
        medio escribir no encontraría nada. La clave lo rellena de nuevo cuando
        la URL cambia por otro lado (atrás, quitar filtros).
      */}
      <form
        key={filters.requestId ?? ''}
        role="search"
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('req')?.toString().trim();
          onChange(value ? { ...filters, requestId: value } : without('requestId'));
        }}
      >
        <label htmlFor={searchId} className="text-gray-500">
          {t.requests.filters.search}
        </label>
        <input
          id={searchId}
          name="req"
          type="search"
          defaultValue={filters.requestId}
          placeholder={t.requests.filters.searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className={`${FIELD} w-36 font-mono uppercase placeholder:normal-case`}
        />
        <button
          type="submit"
          className="rounded-md border border-gray-200 dark:border-gray-800 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-900/50"
        >
          {t.requests.filters.searchButton}
        </button>
      </form>

      {filters.customerId && (
        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 py-0.5 pl-3 pr-1">
          <span className="text-gray-500">{t.requests.filters.customer}:</span>
          <span className="font-medium">{customerName ?? t.requests.filters.someCustomer}</span>
          <button
            type="button"
            onClick={() => onChange(without('customerId'))}
            aria-label={t.requests.filters.removeCustomer}
            title={t.requests.filters.removeCustomer}
            className="rounded-full p-1 hover:bg-gray-200 dark:hover:bg-gray-800"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      )}

      {hasFilters(filters) && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)] hover:underline"
        >
          {t.requests.filters.clear}
        </button>
      )}
    </div>
  );
}
