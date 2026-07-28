export async function retryRejectedCommit<
  Result extends { readonly kind: string },
>(commit: () => Promise<Result>): Promise<Result> {
  const first = await commit();
  return first.kind === "rejected" ? await commit() : first;
}
