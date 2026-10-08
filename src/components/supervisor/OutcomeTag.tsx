import type { Outcome } from '../../../convex/lib/outcome';
import { cn } from '@/lib/utils';
import { SUPERVISOR_MESSAGES as t } from '@/lib/messages';

/**
 * El Outcome de una Replacement Request, o que sigue en revisión. A diferencia
 * de la insignia del Customer (`outcome-badge.ts`), aquí no se mezcla con la
 * notificación: el panel la enseña aparte, como el hecho independiente que es.
 */
const TONES: Record<Outcome | 'awaiting', string> = {
  awaiting:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/50',
  priced_as_suggested:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800/50',
  priced_differently:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800/50',
  oem_restricted:
    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/50',
  discontinued:
    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/50',
  blocked_pending_info:
    'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800/50',
};

export function OutcomeTag({ outcome }: { outcome?: Outcome }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONES[outcome ?? 'awaiting']
      )}
    >
      {outcome ? t.outcomes[outcome] : t.awaitingReview}
    </span>
  );
}
