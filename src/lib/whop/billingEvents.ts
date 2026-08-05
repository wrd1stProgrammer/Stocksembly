export const BILLING_CHANGED_EVENT = "stocksembly:billing-changed";

export function notifyBillingChanged(): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(BILLING_CHANGED_EVENT));
}
