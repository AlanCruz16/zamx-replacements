'use client';

import { messagesFor, type Language } from '@/lib/messages';

/** El fichero que se pinta, nombrado una vez: lo lee la pantalla y lo lee su prueba. */
export const GUIDE_SRC = '/images/dataplate-guide.jpg';

/**
 * Las medidas de ese fichero, para que el hueco exista antes que la imagen
 * (ticket 08 de «usable-on-a-phone»).
 *
 * Sin ellas el navegador no sabe qué alto va a ocupar y le da cero hasta que
 * termina de descargarla: la conversación pega un salto justo cuando el
 * Customer está leyendo el texto de arriba, que es lo peor que puede pasar. Con
 * `width`/`height` y el `w-full h-auto` de la clase, el navegador deriva la
 * proporción y reserva el alto desde el primer pintado, sin haber descargado
 * nada.
 *
 * Son una copia de algo que ya está escrito en el propio JPEG, y una copia que
 * nadie obliga a coincidir es exactamente el defecto que esta pantalla lleva
 * dos tickets arreglando. Aquí no se puede derivar en tiempo de ejecución —el
 * navegador tendría que descargar la imagen para saberlo, que es justo lo que
 * hay que evitar—, así que se deriva en la prueba: `DataplateGuidePart.test.tsx`
 * abre el fichero de `public/` y falla si estos dos números dejan de ser los
 * suyos. Manda el fichero; esto es su eco, y hay quien vigila que no se
 * desafine.
 */
export const GUIDE_WIDTH = 713;
export const GUIDE_HEIGHT = 208;

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
          src={GUIDE_SRC}
          alt={t.dataplateImageAlt}
          width={GUIDE_WIDTH}
          height={GUIDE_HEIGHT}
          className="w-full h-auto object-contain"
        />
      </div>
    </div>
  );
}
