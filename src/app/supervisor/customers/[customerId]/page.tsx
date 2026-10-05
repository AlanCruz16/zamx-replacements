import { CustomerDetail } from '@/components/supervisor/CustomerDetail';
import { requireSupervisorPage } from '@/lib/supervisor-access';

export default async function SupervisorCustomerPage(
  props: PageProps<'/supervisor/customers/[customerId]'>
) {
  await requireSupervisorPage();
  const { customerId } = await props.params;
  return <CustomerDetail customerId={customerId} />;
}
