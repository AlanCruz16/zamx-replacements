'use client';

/** La guía de la placa de datos, tal cual la pedía `show_dataplate_guide`. */
export function DataplateGuidePart({ isEs }: { isEs: boolean }) {
  return (
    <div className="flex flex-col gap-4 mt-3 mb-2 bg-white/50 dark:bg-black/20 p-4 rounded-xl border border-[var(--color-brand-blue)]/20 shadow-sm">
      <p className="font-semibold text-[var(--color-brand-blue)] dark:text-[var(--color-brand-light)]">
        {isEs
          ? 'Información importante sobre la placa de datos'
          : 'Important information about the data plate'}
      </p>
      <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
        <p>
          {isEs ? 'El ' : 'The '}
          <span className="font-bold" style={{ color: '#c59b27' }}>
            {isEs ? 'número de parte' : 'part number'}
          </span>
          {isEs
            ? ' de un producto ZIEHL-ABEGG es necesario para identificar el reemplazo correcto. Generalmente es un número de 6 dígitos que comienza con un 1 o un 2.'
            : ' of a ZIEHL-ABEGG product is necessary to identify the correct replacement. It is generally a 6-digit number starting with a 1 or a 2.'}
        </p>
        <p>
          {isEs ? 'El ' : 'The '}
          <span className="font-bold" style={{ color: '#005b9f' }}>
            {isEs ? 'modelo' : 'fan model'}
          </span>
          {isEs
            ? ' del ventilador es necesario para confirmar que el número de pieza suministrado coincide con el diseño de la unidad solicitado.'
            : ' is necessary to confirm that the supplied part number matches the requested unit design.'}
        </p>
      </div>
      <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/dataplate-guide.jpg"
          alt="Guía de placa de datos ZIEHL-ABEGG"
          className="w-full h-auto object-contain"
        />
      </div>
    </div>
  );
}
