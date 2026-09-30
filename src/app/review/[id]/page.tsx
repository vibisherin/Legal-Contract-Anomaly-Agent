import { ContractReviewDesk } from "@/components/contract-review";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ContractReviewDesk contractId={id} />;
}
