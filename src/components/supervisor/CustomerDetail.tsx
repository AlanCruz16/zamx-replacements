'use client';

import Link from 'next/link';
import { useConvexAuth, useQuery } from 'convex/react';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import { Card, Facts } from './Card';
import { RequestTable } from './RequestTable';
import { listViewHref } from '@/lib/supervisor-list-url';
import { formatDate, SUPERVISOR_MESSAGES } from '@/lib/messages';

const t = SUPERVISOR_MESSAGES;

/** Un Customer: cómo contactarlo y todo lo que ha pedido. Sólo mira. */
export function CustomerDetail({ customerId }: { customerId: string }) {
  // Como en las demás pantallas: sin el token en Convex todavía, `null` se leería como «no existe».
  const { isAuthenticated } = useConvexAuth();
  const customer = useQuery(
    api.supervisor.customerDetail,
    isAuthenticated ? { customerId } : 'skip'
  );

  return (
    <section className="space-y-6">
      <Link
        href="/supervisor/customers"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        {t.customer.back}
      </Link>

      {customer === undefined ? (
        <p className="text-sm text-gray-500">{t.customer.loading}</p>
      ) : customer === null ? (
        <p className="text-sm text-gray-500">{t.customer.notFound}</p>
      ) : (
        <>
          <header>
            <h1 className="text-2xl font-semibold">{customer.fullName}</h1>
            <p className="mt-1 text-sm text-gray-500">{customer.companyName}</p>
          </header>

          <Card title={t.customer.contactHeading}>
            <Facts
              facts={[
                [t.customer.company, customer.companyName],
                [t.customer.email, customer.email],
                [t.customer.phone, customer.phone ?? t.customer.noPhone],
                [t.customer.language, t.customer.languages[customer.preferredLanguage]],
                [t.customer.signedUpAt, formatDate(customer.signedUpAt, 'es')],
              ]}
            />
          </Card>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {t.customer.requestsHeading(customer.requests.length)}
              </h2>
              {customer.requests.length > 0 && (
                // Todo el historial: sin preajuste la lista se quedaría en los últimos 30 días.
                <Link
                  href={listViewHref({ preset: 'all', filters: { customerId: customer._id } })}
                  className="text-sm text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)] hover:underline"
                >
                  {t.customer.openInList}
                </Link>
              )}
            </div>
            {customer.requests.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">{t.customer.noRequests}</p>
            ) : (
              <div className="mt-3">
                <RequestTable rows={customer.requests} />
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
