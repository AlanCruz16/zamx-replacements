import { EmptySection } from '@/components/supervisor/EmptySection';
import { SUPERVISOR_MESSAGES as t } from '@/lib/messages';
import { requireSupervisorPage } from '@/lib/supervisor-access';

export default async function SupervisorCustomersPage() {
  await requireSupervisorPage();
  return <EmptySection title={t.nav.customers} />;
}
