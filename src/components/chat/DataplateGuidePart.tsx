'use client';

import { messagesFor, type Language } from '@/lib/messages';

/** La guía de la placa de datos, tal cual la pedía `show_dataplate_guide`. */
export function DataplateGuidePart({ language }: { language: Language }) {
  const t = messagesFor(language).chat;

  return (
    <div className="flex flex-col gap-4 mt-3 mb-2 bg-white/50 dark:bg-black/20 p-4 rounded-xl border border-[var(--color-brand-blue)]/20 shadow-sm">
      <p className="font-semibold text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)]">
        {t.dataplateTitle}
      </p>
      <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
        <p>
          {t.dataplateArticle}
          <span className="font-bold" style={{ color: '#c59b27' }}>
            {t.dataplatePartNumber}
          </span>
          {t.dataplatePartNumberBody}
        </p>
        <p>
          {t.dataplateArticle}
          <span className="font-bold" style={{ color: '#005b9f' }}>
            {t.dataplateModel}
          </span>
          {t.dataplateModelBody}
        </p>
      </div>
      <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/dataplate-guide.jpg"
          alt={t.dataplateImageAlt}
          className="w-full h-auto object-contain"
        />
      </div>
    </div>
  );
}
