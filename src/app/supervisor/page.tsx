import { Dashboard } from '@/components/supervisor/Dashboard';
import { requireSupervisorPage } from '@/lib/supervisor-access';

export default async function SupervisorDashboardPage() {
  await requireSupervisorPage();
  return <Dashboard />;
}
