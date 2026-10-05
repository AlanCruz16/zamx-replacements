/** Un bloque con título de las pantallas de detalle del panel. */
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-500">{title}</h2>
      {children}
    </div>
  );
}

/** Pares etiqueta–valor, en dos columnas. */
export function Facts({ facts }: { facts: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-gray-500">{label}</dt>
          <dd className="break-words min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
