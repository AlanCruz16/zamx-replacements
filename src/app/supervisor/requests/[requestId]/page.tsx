import { RequestDetail } from '@/components/supervisor/RequestDetail';
import { requireSupervisorPage } from '@/lib/supervisor-access';

export default async function SupervisorRequestPage(
  props: PageProps<'/supervisor/requests/[requestId]'>
) {
  await requireSupervisorPage();
  const { requestId } = await props.params;
  return <RequestDetail requestId={requestId} />;
}
