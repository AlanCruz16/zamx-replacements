'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import Navbar from '@/components/layout/Navbar';
import { GooeyText } from '@/components/ui/gooey-text-morphing';
import { BotMessageSquare, Wrench, Clock, Send, User, Loader2 } from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';

export default function Dashboard() {
  const user = useQuery(api.users.current);
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // eslint-disable-next-line react-hooks/refs
  const { messages, status, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({
        data: {
          userName: userRef.current?.fullName,
          language: userRef.current?.preferredLanguage,
          clerkId: userRef.current?.clerkId,
        },
      }),
    }),
    onError: (error) => {
      console.error('useChat onError:', error);
    },
  });

  const [inputValue, setInputValue] = useState('');
  const isLoading = status === 'streaming' || status === 'submitted';

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    sendMessage({ text: inputValue });
    setInputValue('');
  };

  const append = (text: string) => {
    sendMessage({ text });
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const isEs = user.preferredLanguage === 'es';

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] selection:bg-[var(--color-brand-blue)] selection:text-white">
      <Navbar />

      <main className="flex-1 flex flex-col pt-4 md:pt-8 px-4 pb-36 max-w-4xl mx-auto w-full">
        {messages.length === 0 ? (
          /* Welcome Section - Only visible when no messages exist */
          <div className="flex-1 flex flex-col items-center justify-center pt-8 md:pt-16">
            <div
              className="text-center space-y-4 mb-12 opacity-0"
              style={{ animation: 'fadeIn 0.6s ease-out forwards' }}
            >
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">
                {isEs ? 'Hola,' : 'Hello,'}{' '}
                <span className="text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)]">
                  {user.fullName.split(' ')[0]}
                </span>
              </h1>

              <div className="flex flex-col items-center justify-center pt-2">
                <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 font-medium">
                  {isEs ? 'Cotiza aquí tu' : 'Quote here your'}
                </p>
                <div className="h-[80px] md:h-[100px] flex items-center justify-center w-full -mt-2">
                  <GooeyText
                    texts={isEs
                      ? ["ventilador", "reemplazo", "refacción", "equipo"]
                      : ["fan", "replacement", "spare part", "equipment"]}
                    morphTime={1}
                    cooldownTime={0.60}
                    className="font-bold w-full"
                    textClassName="text-4xl md:text-5xl text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)]"
                  />
                </div>
              </div>
            </div>

            {/* Quick Action Chips */}
            <div
              className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl w-full opacity-0"
              style={{ animation: 'fadeIn 0.6s ease-out 0.2s forwards' }}
            >
              <button
                onClick={() =>
                  append(
                    isEs
                      ? 'Quiero cotizar un ventilador de reemplazo.'
                      : 'I want to quote a replacement fan.'
                  )
                }
                className="flex flex-col items-start p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#111111]/50 backdrop-blur-sm hover:border-[var(--color-brand-blue)]/50 hover:shadow-lg transition-all duration-300 text-left group"
              >
                <Wrench className="text-gray-400 group-hover:text-[var(--color-brand-blue)] mb-3 transition-colors" />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {isEs ? 'Cotizar un reemplazo' : 'Quote a replacement'}
                </h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  {isEs
                    ? 'Inicia el flujo para cotizar uno o varios equipos.'
                    : 'Start the flow to quote one or more items.'}
                </p>
              </button>
              <button
                onClick={() =>
                  append(
                    isEs
                      ? 'No encuentro mi número de parte, ¿cómo lo busco?'
                      : "I can't find my part number, where is it?"
                  )
                }
                className="flex flex-col items-start p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#111111]/50 backdrop-blur-sm hover:border-[var(--color-brand-blue)]/50 hover:shadow-lg transition-all duration-300 text-left group"
              >
                <Clock className="text-gray-400 group-hover:text-[var(--color-brand-blue)] mb-3 transition-colors" />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {isEs ? 'Ayuda con la placa de datos' : 'Help with data plate'}
                </h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  {isEs
                    ? 'Descubre dónde localizar el modelo y número de parte.'
                    : 'Find out where to locate the model and part number.'}
                </p>
              </button>
            </div>
          </div>
        ) : (
          /* Chat Interface */
          <div className="flex-1 flex flex-col gap-6 w-full pb-8">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-4 w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role !== 'user' && (
                  <div className="w-10 h-10 rounded-full bg-[var(--color-brand-blue)] flex items-center justify-center text-white shrink-0 mt-1 shadow-sm">
                    <BotMessageSquare size={20} />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-[15px] md:text-[16px] leading-relaxed shadow-sm
                    ${m.role === 'user'
                      ? 'bg-[var(--color-brand-blue)] text-white'
                      : 'bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200'
                    }`}
                >
                  {/* Handling tool invocations */}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {m.parts.some(
                    (p: any) => p.type?.startsWith('tool-') || p.type === 'dynamic-tool'
                  ) ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-[var(--color-brand-light)] font-semibold border-b border-gray-100 dark:border-gray-800 pb-2">
                        <Loader2 className="animate-spin" size={16} />
                        {isEs ? 'Procesando Cotización...' : 'Processing Quote...'}
                      </div>
                      <div className="text-sm font-medium text-gray-500">
                        {isEs ? 'Datos enviados a ZIEHL-ABEGG:' : 'Data sent to ZIEHL-ABEGG:'}
                      </div>
                      <pre className="text-xs bg-gray-50 dark:bg-black/50 p-3 rounded-xl overflow-x-auto text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 shadow-inner">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {JSON.stringify(
                          (
                            m.parts.find(
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              (p: any) => p.type?.startsWith('tool-') || p.type === 'dynamic-tool'
                            ) as any
                          )?.input,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">
                      {m.parts
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .filter((p: any) => p.type === 'text')
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .map((p: any) => p.text)
                        .join('')}
                    </p>
                  )}
                </div>

                {m.role === 'user' && (
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400 shrink-0 mt-1 shadow-sm overflow-hidden border border-gray-300 dark:border-gray-700">
                    <User size={20} />
                  </div>
                )}
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-4 w-full justify-start">
                <div className="w-10 h-10 rounded-full bg-[var(--color-brand-blue)] flex items-center justify-center text-white shrink-0 mt-1 shadow-sm">
                  <BotMessageSquare size={20} />
                </div>
                <div className="bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-2xl px-5 py-4 shadow-sm flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Floating Input */}
      <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pt-20 pb-8 px-4 pointer-events-none">
        <div className="max-w-4xl mx-auto pointer-events-auto relative">
          <form onSubmit={handleSubmit} className="relative flex items-center group">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder={
                isEs
                  ? 'Escribe un mensaje, modelo o número de parte...'
                  : 'Type a message, model, or part number...'
              }
              className="w-full pl-6 pr-16 py-4 rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-[#111111]/90 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-blue)]/50 focus:border-transparent text-gray-900 dark:text-gray-100 transition-all text-[16px] md:text-lg disabled:opacity-50"
              disabled={isLoading}
            />
            <div className="absolute inset-y-0 right-2 flex items-center">
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="p-3 bg-[var(--color-brand-blue)] hover:bg-[var(--color-brand-light)] text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center justify-center"
              >
                <Send size={18} className="ml-0.5" />
              </button>
            </div>
          </form>
          <p className="text-center text-xs text-gray-400 mt-4 font-medium tracking-wide">
            ZAMX Replacements MVP v0.1 • Gemini 2.5 Flash
          </p>
        </div>
      </div>
    </div>
  );
}
