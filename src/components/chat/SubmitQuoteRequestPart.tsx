import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';

/**
 * Los estados por los que pasa una tool part del AI SDK v6 (ver
 * `AI_SDK_V6_GUIDE.md`, sección «Tool part states»).
 */
export type ToolPartState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error';

/** Estados en los que la herramienta aún no ha dado salida. */
const SIN_SALIDA_TODAVIA: ToolPartState[] = [
  'input-streaming',
  'input-available',
  'approval-requested',
  'approval-responded',
];

/** Lo que devuelve `execute` de `submit_quote_request` en `api/chat/route.ts`. */
export type SubmitQuoteRequestOutput = {
  success?: boolean;
  message?: string;
  quoteId?: string;
  requestId?: string;
};

type Props = {
  /** Puede llegar indefinido si la part no trae estado; ver más abajo. */
  state?: ToolPartState;
  output?: SubmitQuoteRequestOutput;
  isEs: boolean;
};

/**
 * El envío de la Replacement Request, tal y como lo ve el Customer.
 *
 * Se ramifica sobre `state` porque la mera existencia de la part no dice nada:
 * llega en el primer frame y se queda. Si el spinner se pintara sin mirar el
 * estado, giraría para siempre y el Customer no sabría si su Replacement
 * Request llegó.
 *
 * Por eso cada rama exige un estado conocido, en vez de dejar un `else` que lo
 * recoja todo: un estado que no reconocemos no pinta nada, que es lo único
 * honesto — ni un spinner eterno ni una afirmación que no podemos sostener.
 *
 * La confirmación nombra el folio `REQ-` y nada más: a esta altura ya existe un
 * Suggested Price, y ni él ni la entrega pueden llegarle al Customer.
 */
export function SubmitQuoteRequestPart({ state, output, isEs }: Props) {
  if (state && SIN_SALIDA_TODAVIA.includes(state)) {
    return (
      <div className="flex flex-col gap-3 mt-3">
        <div className="flex items-center gap-2 text-[var(--color-brand-light)] font-semibold pb-2">
          <Loader2 className="animate-spin" size={16} />
          {isEs
            ? 'Enviando tu solicitud de reemplazo...'
            : 'Submitting your replacement request...'}
        </div>
      </div>
    );
  }

  if (state === 'output-error' || (state === 'output-available' && !output?.success)) {
    return (
      <div className="flex flex-col gap-2 mt-3 p-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold">
          <TriangleAlert size={16} />
          {isEs ? 'Tu solicitud no se envió' : 'Your replacement request was not submitted'}
        </div>
        <p className="text-sm text-red-700/90 dark:text-red-300/90">
          {isEs
            ? 'No pudimos registrarla. Por favor intenta de nuevo.'
            : 'We could not record it. Please try again.'}
        </p>
      </div>
    );
  }

  if (state === 'output-available') {
    // El folio se pinta sólo si viene. Un envío que salió bien salió bien
    // aunque falte el código: la Replacement Request ya quedó registrada y el
    // Approver ya recibió su correo, así que mandar al Customer a reintentar le
    // costaría un duplicado.
    const requestId = output?.requestId;

    return (
      <div className="flex flex-col gap-2 mt-3 p-3 rounded-xl border border-[var(--color-brand-blue)]/20 bg-white/50 dark:bg-black/20">
        <div className="flex items-center gap-2 text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)] font-semibold">
          <CheckCircle2 size={16} />
          {isEs ? 'Solicitud enviada' : 'Request submitted'}
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {requestId && (
            <>
              {isEs ? 'Tu folio es ' : 'Your reference number is '}
              <span className="font-bold">{requestId}</span>
              {'. '}
            </>
          )}
          {isEs
            ? 'Un vendedor la revisará y se pondrá en contacto contigo.'
            : 'A salesperson will review it and get back to you.'}
        </p>
      </div>
    );
  }

  return null;
}
