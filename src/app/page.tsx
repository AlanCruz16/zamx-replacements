'use client';

import { useQuery, useConvexAuth, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Doc } from '../../convex/_generated/dataModel';
import { findSubmission } from '../../convex/lib/chat';
import Navbar from '@/components/layout/Navbar';
import { GooeyText } from '@/components/ui/gooey-text-morphing';
import { DottedSurface } from '@/components/ui/dotted-surface';
import {
  BotMessageSquare,
  Wrench,
  Clock,
  Send,
  User,
  AlertCircle,
  MessageSquarePlus,
} from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { MessagePart } from '@/components/chat/MessagePart';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { messagesFor, resolveLanguage, type Language } from '@/lib/messages';
import { lastKnownLanguage, rememberLanguage } from '@/lib/language-preference';
import { ChatErrorBoundary } from '@/components/chat/ChatErrorBoundary';

/**
 * Lo que se pinta mientras Convex contesta quién es el Customer y qué decía —y
 * también mientras Clerk termina el handshake, que es cuando las consultas
 * contestan nada por no haber todavía a quién contestarle.
 */
function Loading() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[var(--background)]">
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

/**
 * La pantalla, con su cinturón puesto (ticket 02 de «usable-on-a-phone»).
 *
 * Lo único que vive aquí arriba es lo que la frontera necesita y no puede
 * pedirle a lo que protege: el idioma en el que redactar el mensaje si algo se
 * cae, y la señal por la que darlo por caducado. Esa señal es el handshake:
 * cuando `isAuthenticated` cambia, las credenciales acaban de llegar, que es
 * exactamente la causa pasajera de la que un teléfono se ha de recuperar solo.
 *
 * El idioma se recibe de la propia pantalla en cuanto lo sabe. Leerlo aquí de
 * la consulta del Customer dejaría el mensaje de error colgando de una consulta
 * —la misma clase de pieza cuya caída la frontera existe para recoger—. Mientras
 * la pantalla no lo diga se usa el último que se le conoció al Customer, porque
 * el caso que más importa es justo el que la pantalla no llega a contar: si se
 * cae en su primer render, el efecto que lo diría no ha corrido todavía, y un
 * Customer que eligió inglés leería el error en español.
 */
export default function Dashboard() {
  const { isAuthenticated } = useConvexAuth();
  const [language, setLanguage] = useState<Language>(lastKnownLanguage);

  return (
    <ChatErrorBoundary language={language} resetKeys={[isAuthenticated]}>
      <ChatScreen onLanguage={setLanguage} />
    </ChatErrorBoundary>
  );
}

/**
 * La pantalla espera a tener la conversación guardada antes de montar el chat
 * (ticket 21).
 *
 * `useChat` toma sus mensajes iniciales una sola vez, al montarse: si se montara
 * con la conversación todavía en vuelo, arrancaría vacío y la conversación
 * reanudada no aparecería nunca. Por eso el chat vive en un componente aparte y
 * aquí sólo se decide cuándo montarlo.
 */
function ChatScreen({ onLanguage }: { onLanguage: (language: Language) => void }) {
  const user = useQuery(api.users.current);
  const conversation = useQuery(api.chat.currentConversation);
  /**
   * Quién distingue «todavía no sabemos» de «no hay sesión». Las consultas ya
   * no lo dicen: desde ticket 01 ambas contestan nada en los dos casos, que es
   * justo lo que impide que un render se caiga, y por lo mismo deja de servir
   * para decidir qué pintar.
   */
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();

  // El idioma que ha de usar la frontera de error si la pantalla se cae. Se le
  // dice en cuanto se sabe, y no cuando ya haga falta: para entonces no habría
  // pantalla a la que preguntárselo. Sólo cuando se sabe de verdad: sin Customer
  // esto es el idioma por defecto, y anunciarlo pisaría el que se le conoció en
  // la visita anterior.
  const language = resolveLanguage(user?.preferredLanguage);
  useEffect(() => {
    if (!user) return;
    onLanguage(language);
    rememberLanguage(language);
  }, [user, language, onLanguage]);

  // Onboarding loop check
  useEffect(() => {
    if (user && user.companyName === 'Pendiente') {
      router.push('/onboarding');
    }
  }, [user, router]);

  // La espera: el handshake de Clerk todavía en vuelo, o alguna de las dos
  // consultas sin contestar por primera vez.
  if (authLoading || user === undefined || conversation === undefined) {
    return <Loading />;
  }

  // Sin sesión, y ya sabiéndolo. El middleware lo impide; esto es el cinturón.
  if (!isAuthenticated) {
    return null;
  }

  // Con sesión pero sin Customer todavía: la fila no ha aterrizado por el
  // webhook. Es el otro instante frío y también es una espera — antes caía en
  // la rama de arriba y dejaba al Customer mirando una página en blanco.
  if (user === null) {
    return <Loading />;
  }

  // Sin `key`: el chat se monta una vez y `useChat` lee estos mensajes sólo al
  // montarse. A partir de ahí manda `useChat` — la consulta es reactiva y sigue
  // devolviendo lo guardado, y re-sembrar con ello pisaría lo que el Customer
  // esté diciendo ahora mismo.
  return (
    <ChatDashboard
      user={user}
      language={language}
      initialMessages={(conversation?.messages ?? []) as UIMessage[]}
    />
  );
}

function ChatDashboard({
  user,
  language,
  initialMessages,
}: {
  user: Doc<'users'>;
  language: Language;
  initialMessages: UIMessage[];
}) {
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const { messages, status, error, sendMessage, setMessages } = useChat({
    messages: initialMessages,
    // eslint-disable-next-line react-hooks/refs
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => {
        const current = userRef.current;
        return {
          data: {
            userName: current?.fullName,
            language: current?.preferredLanguage,
            clerkId: current?.clerkId,
          },
        };
      },
    }),
    onError: (error) => {
      console.error('useChat onError:', error);
    },
  });

  const [inputValue, setInputValue] = useState('');
  const abandonConversation = useMutation(api.chat.abandonCurrentConversation);
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

  // Toda la copia de la pantalla sale del mismo módulo y del mismo idioma que
  // el chatbot, el Quote Document y los correos (ticket 20). Antes cada frase
  // llevaba su propio condicional incrustado en el JSX, así que traducir la
  // pantalla era acordarse de cada uno. El idioma lo resuelve quien monta esta
  // pieza, que es también quien se lo dice a la frontera de error.
  const t = messagesFor(language).chat;

  /**
   * La conversación ya produjo su Replacement Request, así que no admite más
   * mensajes: el servidor rechaza el turno siguiente para que
   * `submit_quote_request` no dispare dos veces por las mismas piezas. La
   * pantalla lo dice antes de que el Customer escriba, en vez de dejarle
   * teclear para contestarle que no.
   */
  const isSubmitted = findSubmission(messages) !== undefined;

  /**
   * Empezar de cero: la conversación que hubiera a medias se abandona y la
   * pantalla se vacía. Lo dicho hasta aquí sigue guardado, sólo deja de ser la
   * conversación actual.
   *
   * Primero el servidor y después la pantalla, no al revés. Vaciar antes de que
   * la conversación deje de ser la actual sería enseñarle al Customer una
   * pantalla limpia que la siguiente carga desharía: la consulta la resiembra
   * (ticket 21), y volvería a estar dentro de la que creía haber dejado.
   *
   * Después de un envío no hay nada abierto que abandonar y la mutación no hace
   * nada, que es lo que permite que sea el mismo camino para «Inicio» y para
   * «nueva conversación» en vez de dos que hay que mantener de acuerdo.
   */
  const startNewConversation = async () => {
    await abandonConversation({});
    setMessages([]);
    setInputValue('');
  };

  return (
    <div className="min-h-[100dvh] flex flex-col selection:bg-[var(--color-brand-blue)] selection:text-white relative z-0">
      <DottedSurface className="opacity-50 dark:opacity-30" />
      <Navbar onHome={startNewConversation} />

      <main className="flex-1 flex flex-col pt-4 md:pt-8 pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] pb-[calc(9rem+var(--safe-bottom))] max-w-4xl mx-auto w-full">
        {messages.length === 0 ? (
          /* Welcome Section - Only visible when no messages exist */
          <div className="flex-1 flex flex-col items-center justify-center pt-8 md:pt-16">
            <div
              className="text-center space-y-4 mb-12 opacity-0"
              style={{ animation: 'fadeIn 0.6s ease-out forwards' }}
            >
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">
                {t.greeting}{' '}
                <span className="text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)]">
                  {user.fullName.split(' ')[0]}
                </span>
              </h1>

              <div className="flex flex-col items-center justify-center pt-2">
                <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 font-medium">
                  {t.quoteHere}
                </p>
                <div className="h-[80px] md:h-[100px] flex items-center justify-center w-full -mt-2">
                  <GooeyText
                    texts={t.morphingWords}
                    morphTime={1}
                    cooldownTime={0.6}
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
                onClick={() => append(t.quoteReplacementPrompt)}
                className="flex flex-col items-start p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#111111]/50 backdrop-blur-sm hover:border-[var(--color-brand-blue)]/50 hover:shadow-lg transition-all duration-300 text-left group"
              >
                <Wrench className="text-gray-400 group-hover:text-[var(--color-brand-blue)] mb-3 transition-colors" />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {t.quoteReplacementTitle}
                </h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  {t.quoteReplacementBody}
                </p>
              </button>
              <button
                onClick={() => append(t.dataplateHelpPrompt)}
                className="flex flex-col items-start p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#111111]/50 backdrop-blur-sm hover:border-[var(--color-brand-blue)]/50 hover:shadow-lg transition-all duration-300 text-left group"
              >
                <Clock className="text-gray-400 group-hover:text-[var(--color-brand-blue)] mb-3 transition-colors" />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {t.dataplateHelpTitle}
                </h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{t.dataplateHelpBody}</p>
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
                    ${
                      m.role === 'user'
                        ? 'bg-[var(--color-brand-blue)] text-white'
                        : 'bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200'
                    }`}
                >
                  {/* Handling message parts */}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {m.parts.map((part: any, index: number) => (
                    <MessagePart key={index} part={part} role={m.role} language={language} />
                  ))}
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

        {/*
          Lo que el servidor contestó cuando no atendió la petición. El
          transporte del AI SDK pone el cuerpo de la respuesta no-2xx en
          `error.message`, así que la frase del techo de peticiones —«has
          enviado demasiados mensajes, vuelve en unos N minutos»— llega hasta
          aquí tal cual. Sin esto el Customer sólo veía que no pasaba nada.
        */}
        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-5 py-3.5 text-[15px] leading-relaxed text-amber-900 dark:text-amber-200"
          >
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <p>{error.message || t.genericError}</p>
          </div>
        )}
      </main>

      {/* Floating Input */}
      <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pt-20 pb-[calc(2rem+var(--safe-bottom))] pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] pointer-events-none">
        <div className="max-w-4xl mx-auto pointer-events-auto relative">
          {isSubmitted ? (
            /*
              La conversación terminó donde tenía que terminar: su Replacement
              Request ya está enviada. En vez de un campo que el servidor va a
              rechazar, se le ofrece la única acción que queda.
            */
            <button
              type="button"
              onClick={startNewConversation}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-[#111111]/90 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] text-[16px] md:text-lg font-medium text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)] hover:border-[var(--color-brand-blue)]/50 transition-all"
            >
              <MessageSquarePlus size={20} />
              {t.startNewConversation}
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="relative flex items-center group">
              <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                placeholder={t.inputPlaceholder}
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
          )}
          <p className="text-center text-xs text-gray-400 mt-4 font-medium tracking-wide">
            {t.copyright}
          </p>
        </div>
      </div>
    </div>
  );
}
