'use client';

import React, { useEffect, useId, useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { quoteDocumentLines } from '@/lib/quote-document';
import { outcomeBadge, type BadgeTone } from '@/lib/outcome-badge';
import { formatCurrency, formatDateTime, messagesFor, resolveLanguage } from '@/lib/messages';
import { X, FileText, Clock, CheckCircle, AlertCircle, Calendar, Download } from 'lucide-react';
import { TOUCH_TARGET } from '@/lib/touch-target';

/** La pintura de cada tono. La decisión de qué tono toca vive en `outcomeBadge`. */
const TONE_STYLES: Record<BadgeTone, { bg: string; icon: React.ReactNode }> = {
  awaiting: {
    bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/50',
    icon: <Clock size={14} className="mr-1" />,
  },
  sending: {
    bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
    icon: <CheckCircle size={14} className="mr-1" />,
  },
  sent: {
    bg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800/50',
    icon: <CheckCircle size={14} className="mr-1" />,
  },
  rejected: {
    bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/50',
    icon: <AlertCircle size={14} className="mr-1" />,
  },
  blocked: {
    bg: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800/50',
    icon: <AlertCircle size={14} className="mr-1" />,
  },
};

interface QuotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuotesModal({ isOpen, onClose }: QuotesModalProps) {
  const quotes = useQuery(api.quotes.getUserQuotes);
  const user = useQuery(api.users.current);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape cierra, como en cualquier otro diálogo. Va en el documento y no en el
  // panel porque el foco puede estar en el velo o en nada.
  useEffect(() => {
    if (!isOpen) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [isOpen, onClose]);

  // La página de detrás se queda quieta mientras el panel está abierto: sin
  // esto, al llegar al final de la lista el desplazamiento seguía en el
  // documento y el Customer perdía el sitio de la pantalla que había dejado
  // atrás. Se guarda lo que hubiera puesto para devolverlo tal cual.
  useEffect(() => {
    if (!isOpen) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
  }, [isOpen]);

  // El foco entra al panel al abrirse y vuelve a donde venía al cerrarse, que
  // en la práctica es la pestaña de la barra que lo abrió.
  useEffect(() => {
    if (!isOpen) return;
    const venia = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => venia?.focus?.();
  }, [isOpen]);

  // El idioma del Customer manda también aquí: las fechas y la puntuación de
  // los importes van con él, no con un `es-MX` fijo (ticket 20). La divisa no
  // —los precios de ZAMX son en USD lea quien lea la lista.
  const language = resolveLanguage(user?.preferredLanguage);
  const t = messagesFor(language).quotes;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))] pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] sm:pt-[calc(1.5rem+var(--safe-top))] sm:pb-[calc(1.5rem+var(--safe-bottom))] sm:pl-[calc(1.5rem+var(--safe-left))] sm:pr-[calc(1.5rem+var(--safe-right))]">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-black/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--color-brand-blue)]/10 flex items-center justify-center text-[var(--color-brand-blue)]">
              <FileText size={18} />
            </div>
            <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">
              {t.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t.close}
            /* Se dibuja a 36×36 y se pulsa a 44×44: el redondel del `hover` es
               el que era, y lo que llega al mínimo es el área. */
            className={`${TOUCH_TARGET} p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6">
          {quotes === undefined ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
              <div className="w-8 h-8 border-2 border-[var(--color-brand-blue)] border-t-transparent rounded-full animate-spin" />
              <p>{t.loading}</p>
            </div>
          ) : quotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-400 mb-4">
                <FileText size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                {t.emptyTitle}
              </h3>
              <p className="text-sm text-gray-500 max-w-sm">{t.emptyBody}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {quotes.map((quote) => {
                const badge = outcomeBadge(quote.outcome, !!quote.customerNotifiedAt, language);
                const tone = TONE_STYLES[badge.tone];
                // El total y el enlace al PDF son la misma pregunta que se hace
                // el servidor — ¿existe un Quote Document? — resuelta con el
                // mismo módulo. Ocultar el enlace no es la defensa; la ruta lo
                // vuelve a comprobar.
                const lines = quoteDocumentLines(quote);
                const date = formatDateTime(quote._creationTime, language);

                return (
                  <div
                    key={quote._id}
                    className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-[var(--color-brand-blue)]/30 hover:shadow-md transition-all bg-white dark:bg-[#111111] group"
                  >
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2 justify-between sm:justify-start">
                        <span className="font-semibold text-gray-900 dark:text-white text-base">
                          {quote.requestId}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${tone.bg}`}
                        >
                          {tone.icon}
                          {badge.label}
                        </span>
                      </div>

                      <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                        <Calendar size={14} className="text-gray-400" />
                        {date}
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-800/60">
                        {quote.products.map((p, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between items-baseline gap-3 text-sm"
                          >
                            <span className="min-w-0 break-words text-gray-700 dark:text-gray-300 font-medium">
                              {p.quantity}x <span className="text-gray-500">{p.partNumber}</span>
                            </span>
                            {/* La línea se calla por la misma razón que el total:
                                una pieza que no se puede vender no lleva precio
                                aunque tenga uno guardado. */}
                            {lines !== null && (
                              <span className="shrink-0 whitespace-nowrap text-gray-500">
                                {formatCurrency(lines.products[idx].subtotalUSD, language)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-row sm:flex-col justify-between sm:justify-end items-center sm:items-end pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-800 gap-2">
                      <div className="text-right">
                        <div className="text-sm text-gray-500 sm:mb-1">{t.totalLabel}</div>
                        <div className="font-bold text-lg text-gray-900 dark:text-white">
                          {lines === null ? '--' : formatCurrency(lines.totals.totalUSD, language)}
                        </div>
                      </div>

                      {/* Haber avisado al Customer no basta para ofrecer el PDF,
                          porque también se le avisa de un rechazo: lo que manda
                          es que la Replacement Request tenga Quote Document. */}
                      {lines !== null && (
                        <a
                          href={`/api/download-quote?quoteId=${quote.requestId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          /* El enlace mide 32px de alto y no puede crecer sin
                             desequilibrar la fila del total; el área sí. */
                          className={`${TOUCH_TARGET} flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-lg text-sm font-medium transition-colors border border-blue-200 dark:border-blue-800/50`}
                        >
                          <Download size={14} />
                          {t.viewPdf}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
