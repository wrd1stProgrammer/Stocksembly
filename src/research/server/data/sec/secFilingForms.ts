export const REGISTRATION_FINANCIAL_FORMS = [
  "S-1",
  "S-1/A",
  "424B4",
] as const;

export const COMPANY_FACT_FILING_FORMS = [
  "10-K",
  "10-K/A",
  "10-Q",
  "10-Q/A",
  ...REGISTRATION_FINANCIAL_FORMS,
] as const;

export function isRegistrationFinancialForm(form: string): boolean {
  return REGISTRATION_FINANCIAL_FORMS.includes(
    form as (typeof REGISTRATION_FINANCIAL_FORMS)[number],
  );
}
