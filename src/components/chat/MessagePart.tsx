'use client';

import type { UIMessage } from 'ai';
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

  if (part.type?.startsWith('tool-') || part.type === 'dynamic-tool') {
    // En v6 el nombre está en `part.toolName` (dynamic-tool) o en el propio
    // tipo, `tool-${toolName}`. El `part.toolInvocation` de v4/v5 ya no existe,
    // y buscarlo sólo dejaba una part sin `state` viva de más.
    const toolName: string = part.toolName || part.type?.replace('tool-', '');

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
