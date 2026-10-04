import { SUPERVISOR_MESSAGES as t } from '@/lib/messages';

/** Una sección del panel que todavía no tiene contenido. */
export function EmptySection({ title }: { title: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">{t.comingSoon}</p>
    </section>
  );
}
