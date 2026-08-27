'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

/**
 * El Markdown que escribe el modelo, pintado como lo que es.
 *
 * Se prefirió un renderizador a pedírselo al modelo en el system prompt: una
 * instrucción tiene que aguantar cada respuesta y cada cambio de modelo, y
 * cuando deja de aguantar nada falla ruidosamente — el Customer simplemente
 * vuelve a leer asteriscos. El renderizador es propiedad de la pantalla y se
 * cumple pase lo que pase del otro lado.
 *
 * Sin `rehype-raw`, y esto no es una preferencia de estilo: el texto que sale
 * de un modelo es dato, nunca marcado con privilegios. El HTML que venga
 * dentro se queda como texto y no llega a ser elementos. `react-markdown`
 * además sanea por defecto los `href`, así que un `javascript:` no queda
 * navegable.
 */
export function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div
      className="
        [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
        [&_p]:my-2
        [&_strong]:font-semibold
        [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5
        [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
        [&_li]:my-0.5
        [&_h1]:mt-3 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold
        [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold
        [&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold
        [&_a]:underline [&_a]:underline-offset-2
        [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]
        dark:[&_code]:bg-white/10
        [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/5 [&_pre]:p-3
        dark:[&_pre]:bg-white/10
        [&_pre_code]:bg-transparent [&_pre_code]:p-0
        [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3
        dark:[&_blockquote]:border-gray-700
        [&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto
        [&_th]:border [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left
        [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1
        dark:[&_th]:border-gray-800 dark:[&_td]:border-gray-800
      "
    >
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          // Un enlace que el modelo escribió se abre fuera, y sin dejarle
          // referencia a esta pestaña. `node` es del AST y no es un atributo
          // del DOM: si se cuela en el spread, React se queja por cada enlace.
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
