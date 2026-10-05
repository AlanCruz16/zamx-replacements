import { CustomerList } from '@/components/supervisor/CustomerList';
import { requireSupervisorPage } from '@/lib/supervisor-access';

export default async function SupervisorCustomersPage() {
  await requireSupervisorPage();
  return <CustomerList />;
}
