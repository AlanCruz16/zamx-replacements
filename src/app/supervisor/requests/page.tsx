import { RequestList } from '@/components/supervisor/RequestList';
import { requireSupervisorPage } from '@/lib/supervisor-access';

export default async function SupervisorRequestsPage() {
  await requireSupervisorPage();
  return <RequestList />;
}
