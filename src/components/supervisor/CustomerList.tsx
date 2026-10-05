'use client';

import { useId } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
  CUSTOMER_SORTS,
  DEFAULT_CUSTOMER_SORT,
  type CustomerSort,
} from '../../../convex/lib/customer_list';
import { StackedCell } from './StackedCell';
import { formatDateTime, SUPERVISOR_MESSAGES } from '@/lib/messages';

const t = SUPERVISOR_MESSAGES;

const FIELD =
  'rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0a0a0a] px-2 py-1.5';

const PATH = '/supervisor/customers';

function isSort(value: string | null): value is CustomerSort {
  return CUSTOMER_SORTS.some((sort) => sort === value);
}

/**
 * Los Customers que han enviado alguna Replacement Request, uno por fila. Nunca
 * se agrupan por empresa: es texto libre, y dos maneras de escribir la misma
 * firma —o muchos «Pendiente»— son personas distintas.
 *
 * El filtro de empresa y el orden viven en la URL, como los de la lista de
 * solicitudes, para que volver atrás desde un detalle los conserve. Un valor
 * que no se reconoce se ignora.
 */
export function CustomerList() {
  const params = useSearchParams();
  const company = params.get('company')?.trim() || undefined;
  const sortParam = params.get('sort');
  const sort: CustomerSort = isSort(sortParam) ? sortParam : DEFAULT_CUSTOMER_SORT;

  const router = useRouter();
  const show = (next: { company?: string; sort: CustomerSort }) => {
    const search = new URLSearchParams();
    if (next.company) search.set('company', next.company);
    if (next.sort !== DEFAULT_CUSTOMER_SORT) search.set('sort', next.sort);
    const query = search.toString();
    router.push(query ? `${PATH}?${query}` : PATH, { scroll: false });
  };

  // Como en las demás pantallas: sin el token en Convex todavía, la lista vacía
  // se pintaría como «no hay clientes».
  const { isAuthenticated } = useConvexAuth();
  const customers = useQuery(
    api.supervisor.listCustomers,
    isAuthenticated ? { company, sort } : 'skip'
  );

  const companyId = useId();
  const sortId = useId();

  return (
    <section>
      <h1 className="text-2xl font-semibold">{t.nav.customers}</h1>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm">
        {/* Busca al enviar, como el código `REQ-`; la clave lo rellena si la URL cambia por otro lado. */}
        <form
          key={company ?? ''}
          role="search"
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get('company')?.toString().trim();
            show({ company: value || undefined, sort });
          }}
        >
          <label htmlFor={companyId} className="text-gray-500">
            {t.customers.company}
          </label>
          <input
            id={companyId}
            name="company"
            type="search"
            defaultValue={company}
            placeholder={t.customers.companyPlaceholder}
            autoComplete="off"
            className={`${FIELD} w-44`}
          />
          <button
            type="submit"
            className="rounded-md border border-gray-200 dark:border-gray-800 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-900/50"
          >
            {t.customers.searchButton}
          </button>
        </form>

        <div className="flex items-center gap-2">
          <label htmlFor={sortId} className="text-gray-500">
            {t.customers.sort}
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(event) => show({ company, sort: event.target.value as CustomerSort })}
            className={FIELD}
          >
            {CUSTOMER_SORTS.map((option) => (
              <option key={option} value={option}>
                {t.customers.sorts[option]}
              </option>
            ))}
          </select>
        </div>

        {company && (
          <button
            type="button"
            onClick={() => show({ sort })}
            className="text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)] hover:underline"
          >
            {t.customers.clear}
          </button>
        )}
      </div>

      {customers === undefined ? (
        <p className="mt-6 text-sm text-gray-500">{t.customers.loading}</p>
      ) : customers.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">
          {company ? t.customers.emptyFiltered : t.customers.empty}
        </p>
      ) : (
        <table className="mt-6 block md:table w-full text-sm">
          <thead className="hidden md:table-header-group text-left text-gray-500">
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="py-2 pr-4 font-medium">{t.customers.columns.name}</th>
              <th className="py-2 pr-4 font-medium">{t.customers.columns.company}</th>
              <th className="py-2 pr-4 font-medium">{t.customers.columns.email}</th>
              <th className="py-2 pr-4 font-medium text-right">{t.customers.columns.requests}</th>
              <th className="py-2 font-medium">{t.customers.columns.latestRequestAt}</th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group space-y-3 md:space-y-0">
            {customers.map((customer) => (
              <tr
                key={customer._id}
                className="relative block md:table-row rounded-lg border md:border-0 md:border-b border-gray-200 dark:border-gray-800 p-3 md:p-0 hover:bg-gray-50 dark:hover:bg-gray-900/50"
              >
                <StackedCell label={t.customers.columns.name}>
                  {/* El enlace cubre la fila entera: toda ella abre el detalle. */}
                  <Link
                    href={`${PATH}/${customer._id}`}
                    className="font-medium text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)] after:absolute after:inset-0"
                  >
                    {customer.fullName}
                  </Link>
                </StackedCell>
                <StackedCell label={t.customers.columns.company}>
                  {customer.companyName}
                </StackedCell>
                <StackedCell label={t.customers.columns.email}>
                  <span className="break-all">{customer.email}</span>
                </StackedCell>
                <StackedCell label={t.customers.columns.requests} numeric>
                  {customer.requestCount}
                </StackedCell>
                <StackedCell label={t.customers.columns.latestRequestAt}>
                  {formatDateTime(customer.latestRequestAt, 'es')}
                </StackedCell>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
