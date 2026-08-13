import { z } from "zod";

const AgentViewSchema = z
  .object({
    agent: z.enum(["market", "company", "financial", "risk"]),
    stance: z.enum(["positive", "negative", "watch", "neutral"]),
    headline: z.string().min(4).max(140),
    detail: z.string().min(10).max(500),
  })
  .strict();

const LocalizedSignalSchema = z
  .object({
    id: z.string().min(1).max(200),
    title: z.string().min(3).max(180),
    detail: z.string().min(8).max(650),
    investmentMeaning: z.string().min(8).max(500),
  })
  .strict();

const UpcomingEventSchema = z
  .object({
    scheduledAt: z.string().datetime(),
    name: z.string().min(2).max(160),
    whyItMatters: z.string().min(8).max(400),
    certainty: z.enum(["confirmed", "estimated"]),
  })
  .strict();

const IsoMarketDateSchema = z.iso.date();

const DecisionCheckSchema = z
  .object({
    horizon: z.enum(["today", "next_catalyst"]),
    title: z.string().min(4).max(140),
    timing: z.string().min(2).max(100),
    metric: z.string().min(6).max(240),
    confirmation: z.string().min(8).max(280),
    ifConfirmed: z.string().min(8).max(280),
    ifUnclear: z.string().min(8).max(280),
    ifFailed: z.string().min(8).max(280),
  })
  .strict()
  .superRefine((check, context) => {
    if (
      check.horizon === "next_catalyst" &&
      !IsoMarketDateSchema.safeParse(check.timing).success
    ) {
      context.addIssue({
        code: "custom",
        path: ["timing"],
        message: "Next-catalyst timing must be a YYYY-MM-DD market date.",
      });
    }
  });

const DecisionChecksSchema = z
  .array(DecisionCheckSchema)
  .min(1)
  .max(3)
  .refine(
    (checks) =>
      new Set(
        checks.map((check) =>
          [check.horizon, check.title, check.metric]
            .map((value) => value.trim().toLocaleLowerCase())
            .join("\u0000"),
        ),
      ).size === checks.length,
    { message: "Decision checks must be distinct." },
  );

export const BriefingDraftSchema = z
  .object({
    headline: z.string().min(6).max(180),
    summary: z.string().min(20).max(700),
    materialChanges: z.array(LocalizedSignalSchema).max(5),
    agentViews: z
      .array(AgentViewSchema)
      .min(1)
      .max(3)
      .refine(
        (views) =>
          new Set(views.map((view) => view.agent)).size === views.length,
      ),
    bullCase: z.string().min(10).max(500),
    bearCase: z.string().min(10).max(500),
    upcomingEvents: z.array(UpcomingEventSchema).max(3),
    todayChecks: DecisionChecksSchema,
    changedSincePrevious: z.string().min(8).max(450).nullable(),
    stillWatching: z.string().min(8).max(350).nullable(),
  })
  .strict()
  .superRefine((draft, context) => {
    const eventDates = new Set(
      draft.upcomingEvents.map((event) => event.scheduledAt.slice(0, 10)),
    );
    draft.todayChecks.forEach((check, index) => {
      if (check.horizon === "next_catalyst" && !eventDates.has(check.timing)) {
        context.addIssue({
          code: "custom",
          path: ["todayChecks", index, "timing"],
          message:
            "Next-catalyst timing must match an upcoming-event market date.",
        });
      }
    });
  });

export type BriefingDraft = z.infer<typeof BriefingDraftSchema>;
