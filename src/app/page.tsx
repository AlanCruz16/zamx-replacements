'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import Navbar from '@/components/layout/Navbar';
import { BotMessageSquare, Wrench, Clock, FileText } from 'lucide-react';

export default function Dashboard() {
  const user = useQuery(api.users.current);

  // Still loading Convex data
  if (user === undefined) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--background)]">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-800"></div>
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
          </div>
        </main>
      </div>
    );
  }

  // Not logged in (middleware protects it, but just in case)
  if (user === null) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] selection:bg-[var(--color-brand-blue)] selection:text-white">
      <Navbar />

      <main className="flex-1 flex flex-col items-center pt-16 md:pt-24 px-4 pb-32">
        {/* Welcome Section */}
        <div
          className="text-center space-y-4 mb-12 opacity-0"
          style={{ animation: 'fadeIn 0.6s ease-out forwards' }}
        >
          <div className="mx-auto w-16 h-16 bg-[var(--color-brand-blue)]/10 text-[var(--color-brand-blue)] rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-[var(--color-brand-blue)]/20">
            <BotMessageSquare size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
            {user.preferredLanguage === 'es' ? 'Hola,' : 'Hello,'}{' '}
            <span className="text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)]">
              {user.fullName.split(' ')[0]}
            </span>
          </h1>
          <p className="text-lg md:text-xl text-gray-500 dark:text-gray-400 max-w-xl font-medium">
            {user.preferredLanguage === 'es'
              ? '¿En qué te puedo ayudar hoy con tus reemplazos ZIEHL-ABEGG?'
              : 'How can I help you today with your ZIEHL-ABEGG replacements?'}
          </p>
        </div>

        {/* Quick Action Chips */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl w-full opacity-0"
          style={{ animation: 'fadeIn 0.6s ease-out 0.2s forwards' }}
        >
          <button className="flex flex-col items-start p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#111111]/50 backdrop-blur-sm hover:border-[var(--color-brand-blue)]/50 hover:shadow-lg transition-all duration-300 text-left group">
            <Wrench className="text-gray-400 group-hover:text-[var(--color-brand-blue)] mb-3 transition-colors" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {user.preferredLanguage === 'es' ? 'Cotizar serie GR' : 'Quote GR series'}
            </h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              {user.preferredLanguage === 'es'
                ? 'Ingresa el modelo para un reemplazo exacto.'
                : 'Enter the model for an exact replacement.'}
            </p>
          </button>
          <button className="flex flex-col items-start p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#111111]/50 backdrop-blur-sm hover:border-[var(--color-brand-blue)]/50 hover:shadow-lg transition-all duration-300 text-left group">
            <Clock className="text-gray-400 group-hover:text-[var(--color-brand-blue)] mb-3 transition-colors" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {user.preferredLanguage === 'es' ? 'Tiempos de entrega' : 'Delivery times'}
            </h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              {user.preferredLanguage === 'es'
                ? 'Verifica disponibilidad por temporada.'
                : 'Check availability by season.'}
            </p>
          </button>
          <button className="flex flex-col items-start p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#111111]/50 backdrop-blur-sm hover:border-[var(--color-brand-blue)]/50 hover:shadow-lg transition-all duration-300 text-left group">
            <FileText className="text-gray-400 group-hover:text-[var(--color-brand-blue)] mb-3 transition-colors" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {user.preferredLanguage === 'es' ? 'Ver cotizaciones' : 'View quotes'}
            </h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              {user.preferredLanguage === 'es'
                ? 'Historial de solicitudes en PDF.'
                : 'PDF request history.'}
            </p>
          </button>
        </div>
      </main>

      {/* Floating Input Placeholder */}
      <div
        className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pt-20 pb-8 px-4 pointer-events-none opacity-0"
        style={{ animation: 'fadeIn 0.6s ease-out 0.4s forwards' }}
      >
        <div className="max-w-3xl mx-auto pointer-events-auto relative">
          <div className="relative flex items-center group">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-[var(--color-brand-blue)] transition-colors">
              <BotMessageSquare size={22} />
            </div>
            <input
              type="text"
              placeholder={
                user.preferredLanguage === 'es'
                  ? 'Escribe un modelo o número de parte...'
                  : 'Type a model or part number...'
              }
              className="w-full pl-14 pr-16 py-4 rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-[#111111]/90 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-blue)]/50 focus:border-transparent text-gray-900 dark:text-gray-100 transition-all text-[16px] md:text-lg"
              disabled
            />
            <div className="absolute inset-y-0 right-2 flex items-center">
              <button className="p-2.5 bg-[var(--color-brand-blue)] hover:bg-[var(--color-brand-light)] text-white rounded-full transition-colors cursor-not-allowed opacity-50 shadow-md">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 mt-4 font-medium tracking-wide">
            ZAMX Replacements MVP v0.1 •{' '}
            {user.preferredLanguage === 'es' ? 'IA en construcción 🚧' : 'AI under construction 🚧'}
          </p>
        </div>
      </div>
    </div>
  );
}
