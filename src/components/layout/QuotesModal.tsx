'use client';

import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import { confirmedQuoteLines } from '@/lib/confirmed-prices';
import { X, FileText, Clock, CheckCircle, AlertCircle, Calendar, Download } from 'lucide-react';

type Outcome = NonNullable<Doc<'quotes'>['outcome']>;

interface QuotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuotesModal({ isOpen, onClose }: QuotesModalProps) {
  const quotes = useQuery(api.quotes.getUserQuotes);

  if (!isOpen) return null;

  /**
   * El Outcome y la notificación al Customer son dos hechos independientes, así
   * que la insignia los lee por separado: qué decidió Ventas, y si ya se le avisó.
   * Conflarlos es lo que mostraba una pieza descontinuada como cotización
   * entregada.
   */
  const getOutcomeBadge = (outcome: Outcome | undefined, notified: boolean) => {
    if (outcome === undefined)
      return {
        label: 'En revisión por Ventas',
        bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/50',
        icon: <Clock size={14} className="mr-1" />,
      };

    switch (outcome) {
      case 'priced_as_suggested':
      case 'priced_differently':
        return notified
          ? {
              label: 'Enviada al correo',
              bg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800/50',
              icon: <CheckCircle size={14} className="mr-1" />,
            }
          : {
              label: 'Procesando envío...',
              bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
              icon: <CheckCircle size={14} className="mr-1" />,
            };
      case 'oem_restricted':
        return {
          label: 'Exclusiva del fabricante (OEM)',
          bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/50',
          icon: <AlertCircle size={14} className="mr-1" />,
        };
      case 'discontinued':
        return {
          label: 'Pieza descontinuada',
          bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/50',
          icon: <AlertCircle size={14} className="mr-1" />,
        };
      case 'blocked_pending_info':
        return {
          label: 'Requiere más información',
          bg: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800/50',
          icon: <AlertCircle size={14} className="mr-1" />,
        };
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-black/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--color-brand-blue)]/10 flex items-center justify-center text-[var(--color-brand-blue)]">
              <FileText size={18} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Mis Cotizaciones
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {quotes === undefined ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
              <div className="w-8 h-8 border-2 border-[var(--color-brand-blue)] border-t-transparent rounded-full animate-spin" />
              <p>Cargando historial...</p>
            </div>
          ) : quotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-400 mb-4">
                <FileText size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                No tienes cotizaciones
              </h3>
              <p className="text-sm text-gray-500 max-w-sm">
                Cuando solicites cotizaciones a través del chatbot, aparecerán aquí para que puedas
                darles seguimiento.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {quotes.map((quote) => {
                const badge = getOutcomeBadge(quote.outcome, !!quote.customerNotifiedAt);
                // Sólo los Confirmed Prices llegan al Customer, y un precio
                // ausente significa que no hay precio: el total se calla entero
                // hasta que todas las piezas tienen uno. Misma regla que el Quote
                // Document, mismo módulo.
                const lines = confirmedQuoteLines(quote.products);
                const date = new Date(quote._creationTime).toLocaleDateString('es-MX', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={quote._id}
                    className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-[var(--color-brand-blue)]/30 hover:shadow-md transition-all bg-white dark:bg-[#111111] group"
                  >
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2 justify-between sm:justify-start">
                        <span className="font-semibold text-gray-900 dark:text-white text-base">
                          {quote.requestId}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badge.bg}`}
                        >
                          {badge.icon}
                          {badge.label}
                        </span>
                      </div>

                      <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                        <Calendar size={14} className="text-gray-400" />
                        {date}
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-800/60">
                        {quote.products.map((p, idx) => (
                          <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="text-gray-700 dark:text-gray-300 font-medium">
                              {p.quantity}x <span className="text-gray-500">{p.partNumber}</span>
                            </span>
                            {p.confirmedPriceUSD !== undefined && (
                              <span className="text-gray-500">
                                {formatCurrency(p.confirmedPriceUSD * p.quantity)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-row sm:flex-col justify-between sm:justify-end items-center sm:items-end pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-800 gap-2">
                      <div className="text-right">
                        <div className="text-sm text-gray-500 sm:mb-1">Total (c/ IVA)</div>
                        <div className="font-bold text-lg text-gray-900 dark:text-white">
                          {lines === null ? '--' : formatCurrency(lines.totals.totalUSD)}
                        </div>
                      </div>

                      {/* Un Quote Document existe sólo cuando todas las piezas
                          tienen Confirmed Price; haber avisado al Customer no
                          basta, porque también se le avisa de un rechazo. */}
                      {!!quote.customerNotifiedAt && lines !== null && (
                        <a
                          href={`/api/download-quote?quoteId=${quote.requestId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-lg text-sm font-medium transition-colors border border-blue-200 dark:border-blue-800/50"
                        >
                          <Download size={14} />
                          Ver PDF
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
