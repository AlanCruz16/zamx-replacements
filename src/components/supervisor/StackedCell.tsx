/**
 * Una celda de las tablas del panel. En pantallas estrechas la tabla deja de
 * serlo y cada fila se apila: la celda lleva entonces su etiqueta delante, en
 * vez de obligar a desplazarse de lado.
 */
export function StackedCell({
  label,
  numeric = false,
  children,
}: {
  label: string;
  numeric?: boolean;
  children: React.ReactNode;
}) {
  return (
    <td
      className={`flex justify-between gap-4 py-1 md:table-cell md:py-3 md:pr-4 ${numeric ? 'md:text-right' : ''}`}
    >
      <span className="text-gray-500 md:hidden">{label}</span>
      <span>{children}</span>
    </td>
  );
}
