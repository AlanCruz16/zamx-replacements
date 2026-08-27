'use client';

import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { messagesFor, type Language } from '@/lib/messages';

type Props = {
  /**
   * El idioma del Customer. Llega como prop y no de una consulta porque la
   * frontera está *por encima* de las consultas: preguntarle a la misma pieza
   * que puede caerse dejaría el mensaje de error a merced del fallo que está
   * explicando.
   */
  language: Language;
  /**
   * Lo que la frontera vigila para volver sola. Cuando cambia —típicamente que
   * el handshake terminó y ya hay credenciales—, el fallo se da por caducado y
   * los hijos se vuelven a pintar sin que el Customer pulse nada.
   */
  resetKeys?: readonly unknown[];
  children: ReactNode;
};

type State = {
  failed: boolean;
  /**
   * Cuántas veces se ha reintentado. Es la `key` del subárbol, así que
   * reintentar lo desmonta y lo vuelve a montar entero: los hooks arrancan de
   * cero y las consultas se vuelven a suscribir. Sin eso, «reintentar» sería
   * repintar lo mismo con el mismo estado y no le daría a nada una segunda
   * oportunidad de verdad.
   */
  attempt: number;
};

function sameKeys(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

/**
 * El cinturón de la pantalla de chat (ticket 02 de «usable-on-a-phone»).
 *
 * No arregla ningún fallo concreto: cambia lo que cuesta cualquiera de ellos.
 * Hasta ahora una excepción lanzada dentro de un render —la que lanzaba
 * `currentConversation` sin identidad, y la que lance la próxima consulta— se
 * llevaba la pantalla entera y para siempre, porque no había nada que la
 * recogiera. El Customer veía la página de error del navegador y tenía que
 * saber que recargar ayudaría.
 *
 * Con la frontera puesta, ese mismo fallo cuesta un mensaje: se dice qué pasó,
 * se ofrece reintentar, y si la causa era pasajera la pantalla vuelve sola.
 *
 * Es una clase porque React no ofrece fronteras de error con hooks: es la única
 * pieza del proyecto que tiene que serlo.
 */
export class ChatErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Pick<State, 'failed'> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Al Customer se le dice lo que puede hacer; el detalle es para quien
    // tenga que arreglarlo después.
    console.error('ChatErrorBoundary:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && !sameKeys(prev.resetKeys, this.props.resetKeys)) {
      this.setState({ failed: false });
    }
  }

  /** Volver a intentarlo es volver a montar: si la causa se despejó, se ve. */
  private retry = () => {
    this.setState((state) => ({ failed: false, attempt: state.attempt + 1 }));
  };

  render() {
    if (!this.state.failed)
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;

    const t = messagesFor(this.props.language).chat;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] px-4">
        <div
          role="alert"
          className="flex w-full max-w-md flex-col items-start gap-3 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-5 py-5 text-[15px] leading-relaxed text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold">{t.errorTitle}</h2>
              <p className="mt-1">{t.errorBody}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={this.retry}
            className="mt-2 flex min-h-11 items-center justify-center gap-2 self-stretch rounded-2xl bg-[var(--color-brand-blue)] px-5 py-3 font-medium text-white transition-colors hover:bg-[var(--color-brand-light)]"
          >
            <RotateCcw size={18} />
            {t.errorRetry}
          </button>
        </div>
      </div>
    );
  }
}
