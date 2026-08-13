import type { Locale } from "../../lib/i18n";
import type {
  BriefingAgentView,
  BriefingSourceSnapshot,
} from "../domain/contracts";
import { companyFinancialPhrases } from "./briefingFallbackFormatting";

function namesEveryFocus(
  view: BriefingAgentView,
  focuses: readonly string[],
): boolean {
  const text = `${view.headline} ${view.detail}`.toLocaleLowerCase();
  return focuses.every((focus) => text.includes(focus.toLocaleLowerCase()));
}

export function companySpecificAgentViews(input: {
  readonly locale: Locale;
  readonly snapshot: BriefingSourceSnapshot;
  readonly model: readonly BriefingAgentView[];
  readonly fallback: readonly BriefingAgentView[];
}): readonly BriefingAgentView[] {
  const focuses = companyFinancialPhrases(input.locale, input.snapshot);
  if (
    focuses.length === 0 ||
    input.model.some((view) => namesEveryFocus(view, focuses))
  ) {
    return input.model;
  }
  const evidenceView = input.fallback.find(
    (view) =>
      (view.agent === "financial" || view.agent === "company") &&
      namesEveryFocus(view, focuses),
  );
  if (evidenceView === undefined) return input.model;

  const views = [...input.model];
  const sameAgent = views.findIndex(
    (view) => view.agent === evidenceView.agent,
  );
  if (sameAgent >= 0) {
    views[sameAgent] = evidenceView;
    return Object.freeze(views.slice(0, 3));
  }
  if (views.length < 3) return Object.freeze([...views, evidenceView]);

  const genericCompanyView = views.findIndex(
    (view) => view.agent === "financial" || view.agent === "company",
  );
  views[genericCompanyView >= 0 ? genericCompanyView : views.length - 1] =
    evidenceView;
  return Object.freeze(views);
}
