import { v, type Infer } from 'convex/values';
import type { SupervisorCustomerRow } from './supervisor_view';

/**
 * Cómo se filtra y se ordena la lista de Customers del Supervisor.
 *
 * La empresa es texto libre —y «Pendiente» por defecto—, así que nunca se
 * agrupa por ella: cada fila es una persona. Filtrar por empresa compara un
 * trozo del nombre sin mirar mayúsculas, acentos ni espacios alrededor, para
 * que «climatizacion» encuentre también «Climatización del Norte».
 */

export const customerSortValidator = v.union(
  /** Quien pidió algo más recientemente, primero. Por defecto. */
  v.literal('latest'),
  /** Por empresa, alfabéticamente; dentro de una empresa, por la última solicitud. */
  v.literal('company'),
  /** Quien más Replacement Requests ha enviado, primero. */
  v.literal('requests')
);

export type CustomerSort = Infer<typeof customerSortValidator>;

export const CUSTOMER_SORTS: readonly CustomerSort[] = ['latest', 'company', 'requests'];

export const DEFAULT_CUSTOMER_SORT: CustomerSort = 'latest';

/** Minúsculas, sin acentos y sin espacios alrededor. */
function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function matchesCompany(companyName: string, company: string | undefined): boolean {
  const wanted = company === undefined ? '' : foldForSearch(company);
  return wanted === '' || foldForSearch(companyName).includes(wanted);
}

const byLatest = (a: SupervisorCustomerRow, b: SupervisorCustomerRow) =>
  b.latestRequestAt - a.latestRequestAt;

const COMPARATORS: Record<
  CustomerSort,
  (a: SupervisorCustomerRow, b: SupervisorCustomerRow) => number
> = {
  latest: byLatest,
  company: (a, b) =>
    a.companyName.localeCompare(b.companyName, 'es', { sensitivity: 'base' }) || byLatest(a, b),
  requests: (a, b) => b.requestCount - a.requestCount || byLatest(a, b),
};

export function sortCustomers(
  rows: SupervisorCustomerRow[],
  sort: CustomerSort
): SupervisorCustomerRow[] {
  return [...rows].sort(COMPARATORS[sort]);
}
