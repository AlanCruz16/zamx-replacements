'use client';

import type { UIMessage } from 'ai';
import { toolNameOfPart } from '../../../convex/lib/chat';
import { SubmitQuoteRequestPart } from './SubmitQuoteRequestPart';
import { AssistantMarkdown } from './AssistantMarkdown';
import { DataplateGuidePart } from './DataplateGuidePart';

/**
 * Qué se pinta por cada part de un mensaje.
 *
 * Vive fuera de `page.tsx` porque es lo único de esa pantalla que hay que poder
 * montar en una prueba: el resto arrastra Convex, Clerk y una superficie de
 * three.js.
 */
export function MessagePart({
  part,
  role,
  isEs,
}: {
  // El AI SDK v6 no exporta un tipo cerrado para las parts de herramienta con
  // salida propia; se estrecha aquí abajo por `type`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  part: any;
  role: UIMessage['role'];
  isEs: boolean;
}) {
  if (part.type === 'text') {
    // Sólo lo que escribe el modelo se interpreta como Markdown. Lo que escribe
    // el Customer es su propio texto y se respeta literal, sin convertirle en
    // énfasis los asteriscos o guiones bajos que él no puso ahí — y cualquier
    // otro rol se trata igual de literal, que es lo conservador.
    return role === 'assistant' ? (
      <AssistantMarkdown text={part.text} />
    ) : (
      <p className="whitespace-pre-wrap">{part.text}</p>
    );
  }

  // En v6 el nombre está en `part.toolName` (dynamic-tool) o en el propio tipo,
  // `tool-${toolName}`. La regla se importa en vez de reescribirse: el servidor
  // decide con ella si la conversación ya envió su Replacement Request, y dos
  // copias que se separaran harían que la pantalla y el servidor discreparan
  // sobre qué herramienta disparó.
  const toolName = toolNameOfPart(part);

  if (toolName !== undefined) {
    if (toolName === 'show_dataplate_guide') {
      return <DataplateGuidePart isEs={isEs} />;
    }

    if (toolName === 'submit_quote_request') {
      return <SubmitQuoteRequestPart state={part.state} output={part.output} isEs={isEs} />;
    }

    // Una herramienta que no reconocemos no es asunto del Customer: no se pinta
    // nada.
    return null;
  }

  return null;
}
