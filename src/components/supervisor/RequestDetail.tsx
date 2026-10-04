'use client';

import Link from 'next/link';
import { useConvexAuth, useQuery } from 'convex/react';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { SupervisorProduct } from '../../../convex/lib/supervisor_view';
import { OutcomeTag } from './OutcomeTag';
import { StackedCell } from './StackedCell';
import { formatCurrency, formatDateTime, SUPERVISOR_MESSAGES } from '@/lib/messages';

const t = SUPERVISOR_MESSAGES;

/**
 * Una Replacement Request entera, tal y como la ve el Supervisor: quién la
 * pidió, qué pidió, qué decidió Ventas y qué recibió el Customer. Sólo mira.
 *
 * Un precio ausente se dice con palabras, nunca con un cero: sin Suggested
 * Price es que ningún Model Prefix coincidió, y sin Confirmed Price es que
 * todavía no hay precio.
 */
export function RequestDetail({ requestId }: { requestId: string }) {
  // Como en la lista: sin el token en Convex todavía, `null` se leería como «no existe».
  const { isAuthenticated } = useConvexAuth();
  const request = useQuery(api.supervisor.requestDetail, isAuthenticated ? { requestId } : 'skip');

  return (
    <section className="space-y-6">
      <Link
        href="/supervisor/requests"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        {t.request.back}
      </Link>

      {request === undefined ? (
        <p className="text-sm text-gray-500">{t.request.loading}</p>
      ) : request === null ? (
        <p className="text-sm text-gray-500">{t.request.notFound}</p>
      ) : (
        <>
          <header>
            <h1 className="font-mono text-2xl font-semibold">{request.requestId}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t.request.receivedAt} {formatDateTime(request.receivedAt, 'es')}
            </p>
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title={t.request.customerHeading}>
              <Facts
                facts={[
                  [t.request.name, request.customer.fullName],
                  [t.request.company, request.customer.companyName],
                  [t.request.email, request.customer.email],
                  [t.request.phone, request.customer.phone ?? t.request.noPhone],
                ]}
              />
            </Card>

            <Card title={t.request.outcomeHeading}>
              <OutcomeTag outcome={request.outcome} />
              {request.outcome === 'blocked_pending_info' && (
                <p className="mt-2 text-sm text-orange-700 dark:text-orange-400">
                  {t.request.blockedCanChange}
                </p>
              )}
              {request.outcome !== undefined && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500">{t.request.approverWords}</p>
                  {request.approverExplanation ? (
                    <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-gray-200 dark:border-gray-800 pl-3 text-sm">
                      {request.approverExplanation}
                    </blockquote>
                  ) : (
                    <p className="mt-1 text-sm text-gray-500">{t.request.noApproverWords}</p>
                  )}
                </div>
              )}
            </Card>
          </div>

          <Card title={t.request.notificationsHeading}>
            <Facts
              facts={[
                [t.request.customerNotifiedAt, sentAtOrNotYet(request.customerNotifiedAt)],
                [t.request.quoteDocumentSentAt, sentAtOrNotYet(request.quoteDocumentSentAt)],
                [t.request.rejectionExplainedAt, sentAtOrNotYet(request.rejectionExplainedAt)],
                [
                  t.request.quoteDocument,
                  request.hasQuoteDocument ? t.request.hasQuoteDocument : t.request.noQuoteDocument,
                ],
              ]}
            />
          </Card>

          <Card title={t.request.partsHeading}>
            <PartsTable products={request.products} />
          </Card>
        </>
      )}
    </section>
  );
}

function sentAtOrNotYet(timestamp: number | undefined): string {
  return timestamp === undefined ? t.request.notYet : formatDateTime(timestamp, 'es');
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-500">{title}</h2>
      {children}
    </div>
  );
}

function Facts({ facts }: { facts: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-gray-500">{label}</dt>
          <dd className="break-words min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const COLUMNS = t.request.partColumns;

/** Una pieza por fila; en pantallas estrechas, cada una se apila. */
function PartsTable({ products }: { products: SupervisorProduct[] }) {
  return (
    <table className="block md:table w-full text-sm">
      <thead className="hidden md:table-header-group text-left text-gray-500">
        <tr className="border-b border-gray-200 dark:border-gray-800">
          <th className="py-2 pr-4 font-medium">{COLUMNS.partNumber}</th>
          <th className="py-2 pr-4 font-medium">{COLUMNS.model}</th>
          <th className="py-2 pr-4 font-medium text-right">{COLUMNS.quantity}</th>
          <th className="py-2 pr-4 font-medium">{COLUMNS.destination}</th>
          <th className="py-2 pr-4 font-medium text-right">{COLUMNS.suggestedPrice}</th>
          <th className="py-2 pr-4 font-medium text-right">{COLUMNS.confirmedPrice}</th>
          <th className="py-2 pr-4 font-medium">{COLUMNS.suggestedDelivery}</th>
          <th className="py-2 font-medium">{COLUMNS.confirmedDelivery}</th>
        </tr>
      </thead>
      <tbody className="block md:table-row-group space-y-3 md:space-y-0">
        {products.map((part, index) => (
          <tr
            key={index}
            className="block md:table-row rounded-lg border md:border-0 md:border-b border-gray-200 dark:border-gray-800 p-3 md:p-0"
          >
            <StackedCell label={COLUMNS.partNumber}>
              <span className="font-mono">{part.partNumber}</span>
            </StackedCell>
            <StackedCell label={COLUMNS.model}>{part.model}</StackedCell>
            <StackedCell label={COLUMNS.quantity} numeric>
              {part.quantity}
            </StackedCell>
            <StackedCell label={COLUMNS.destination}>{part.deliveryLocation}</StackedCell>
            <StackedCell label={COLUMNS.suggestedPrice} numeric>
              <Price value={part.suggestedPriceUSD} absent={t.request.noSuggestedPrice} />
            </StackedCell>
            <StackedCell label={COLUMNS.confirmedPrice} numeric>
              <Price value={part.confirmedPriceUSD} absent={t.request.noConfirmedPrice} />
            </StackedCell>
            <StackedCell label={COLUMNS.suggestedDelivery}>
              {t.request.weeks(part.suggestedDeliveryWeeksMin, part.suggestedDeliveryWeeksMax)}
            </StackedCell>
            <StackedCell label={COLUMNS.confirmedDelivery}>
              {part.confirmedDeliveryWeeksMin !== undefined &&
              part.confirmedDeliveryWeeksMax !== undefined ? (
                t.request.weeks(part.confirmedDeliveryWeeksMin, part.confirmedDeliveryWeeksMax)
              ) : (
                <span className="text-gray-500 italic">{t.request.noConfirmedDelivery}</span>
              )}
            </StackedCell>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Un precio, o la palabra que dice por qué no lo hay. `0` es un precio real. */
function Price({ value, absent }: { value: number | undefined; absent: string }) {
  return value === undefined ? (
    <span className="text-gray-500 italic">{absent}</span>
  ) : (
    <span className="tabular-nums">{formatCurrency(value, 'es')}</span>
  );
}
