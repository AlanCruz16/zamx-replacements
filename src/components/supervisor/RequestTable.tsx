'use client';

import Link from 'next/link';
import type { Id } from '../../../convex/_generated/dataModel';
import type { SupervisorRequestRow } from '../../../convex/lib/supervisor_view';
import { OutcomeTag } from './OutcomeTag';
import { StackedCell } from './StackedCell';
import { formatDateTime, SUPERVISOR_MESSAGES } from '@/lib/messages';

const t = SUPERVISOR_MESSAGES;

/**
 * Las filas de Replacement Requests, igual en la lista y en el detalle de un
 * Customer. Cada fila entera abre su detalle.
 *
 * En pantallas estrechas la tabla deja de serlo: cada fila se apila como una
 * tarjeta con la etiqueta de cada dato delante, en vez de desplazarse de lado.
 */
export function RequestTable({
  rows,
  onFilterCustomer,
}: {
  rows: SupervisorRequestRow[];
  /** Si se da, el nombre del Customer filtra la lista por él en vez de abrir la fila. */
  onFilterCustomer?: (customerId: Id<'users'>) => void;
}) {
  return (
    <table className="block md:table w-full text-sm">
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
        {rows.map((row) => (
          <tr
            key={row._id}
            className="relative block md:table-row rounded-lg border md:border-0 md:border-b border-gray-200 dark:border-gray-800 p-3 md:p-0 hover:bg-gray-50 dark:hover:bg-gray-900/50"
          >
            <StackedCell label={t.requests.columns.requestId}>
              {/* El enlace cubre la fila entera: toda ella abre el detalle. */}
              <Link
                href={`/supervisor/requests/${row.requestId}`}
                className="whitespace-nowrap font-mono font-medium text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)] after:absolute after:inset-0"
              >
                {row.requestId}
              </Link>
            </StackedCell>
            <StackedCell label={t.requests.columns.receivedAt}>
              {formatDateTime(row.receivedAt, 'es')}
            </StackedCell>
            <StackedCell label={t.requests.columns.customer}>
              {onFilterCustomer ? (
                // Por encima del enlace de la fila: filtra en vez de abrir.
                <button
                  type="button"
                  onClick={() => onFilterCustomer(row.customerId)}
                  title={t.requests.filters.onlyCustomer(row.customerName)}
                  aria-label={t.requests.filters.onlyCustomer(row.customerName)}
                  className="relative z-10 text-left hover:underline"
                >
                  {row.customerName}
                </button>
              ) : (
                row.customerName
              )}
            </StackedCell>
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
  );
}
