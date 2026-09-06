import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { copy } from "../../lib/i18n";
import type { MobileBottomNav } from "../MobileBottomNav";
import type { SignedInSidebar } from "../SignedInSidebar";

const testState = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("aws-amplify/auth", () => ({
  getCurrentUser: testState.getCurrentUser,
}));

vi.mock("../../auth/amplifyClient", () => ({
  configureAmplifyAuth: () => true,
}));

vi.mock("../../auth/researchSession", () => ({
  currentAuthTokens: async () => ({}),
  syncResearchSession: async () => undefined,
}));

vi.mock("../../auth/researchClient", () => ({
  createAuthenticatedResearchClient: () => ({
    bootstrapSession: async () => undefined,
    listRuns: async () => [],
  }),
}));

vi.mock("../Header", () => ({
  Header: () => <header data-testid="landing-header" />,
}));

vi.mock("../LandingOfficePreview", () => ({
  LandingOfficePreview: () => <div data-testid="office-preview" />,
}));

vi.mock("../researchRoom/LandingResearchRoomPreview", () => ({
  LandingResearchRoomPreview: () => <div data-testid="room-preview" />,
}));

vi.mock("../LandingSections", () => ({
  LandingSections: () => <section data-testid="landing-sections" />,
  LandingFooter: () => <footer data-testid="landing-footer" />,
}));

vi.mock("../SearchConsole", () => ({
  SearchConsole: () => <div data-testid="search-console" />,
}));

vi.mock("../SignedInSidebar", () => ({
  SIGNED_IN_SIDEBAR_STORAGE_KEY: "test-sidebar-collapsed",
  SignedInSidebar: ({
    onSignedOut,
    collapsed,
    onCollapsedChange,
  }: ComponentProps<typeof SignedInSidebar>) => (
    <aside data-testid="signed-in-sidebar">
      <button type="button" onClick={onSignedOut}>
        Sign out
      </button>
      <button type="button" onClick={() => onCollapsedChange(!collapsed)}>
        Toggle sidebar
      </button>
    </aside>
  ),
}));

vi.mock("../MobileBottomNav", () => ({
  MobileBottomNav: ({ hidden }: ComponentProps<typeof MobileBottomNav>) => (
    <nav data-testid="mobile-nav" data-hidden={hidden} />
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/?lang=en");
  testState.getCurrentUser.mockRejectedValue(new Error("Signed out"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ completed: true, plans: [] })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const marketingTestIds = [
  "landing-header",
  "office-preview",
  "room-preview",
  "landing-sections",
  "landing-footer",
];

describe("home authentication branches", () => {
  it("preserves the signed-out marketing content and search", async () => {
    const { container } = render(<App initialLocale="en" />);

    await waitFor(() =>
      expect(testState.getCurrentUser).toHaveBeenCalledOnce(),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      `${copy.en.hero.titleLead} ${copy.en.hero.titleTail}`,
    );
    for (const testId of marketingTestIds)
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.getAllByTestId("search-console")).toHaveLength(1);
    expect(container.querySelector("#product .hero__proof")).toHaveTextContent(
      copy.en.hero.proof,
    );
    expect(screen.queryByTestId("signed-in-sidebar")).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-nav")).toHaveAttribute(
      "data-hidden",
      "false",
    );
  });

  it("shows the work home after sign-in and restores marketing after sign-out", async () => {
    testState.getCurrentUser.mockResolvedValue({ userId: "test-user" });
    const { container } = render(<App initialLocale="en" />);

    expect(
      await screen.findByRole("heading", { name: copy.en.home.title }),
    ).toBeVisible();
    expect(await screen.findByText(copy.en.home.emptyTitle)).toBeVisible();
    expect(screen.getAllByTestId("search-console")).toHaveLength(1);
    for (const testId of marketingTestIds)
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    expect(container.querySelector(".hero")).toBeNull();
    expect(screen.getByTestId("signed-in-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-nav")).toHaveAttribute(
      "data-hidden",
      "true",
    );
    expect(document.title).toBe(
      `${copy.en.hero.titleLead} ${copy.en.hero.titleTail} · Stocksembly`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    expect(screen.getByTestId("mobile-nav")).toHaveAttribute(
      "data-hidden",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      screen.queryByRole("heading", { name: copy.en.home.title }),
    ).not.toBeInTheDocument();
    for (const testId of marketingTestIds)
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.queryByTestId("signed-in-sidebar")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      `${copy.en.hero.titleLead} ${copy.en.hero.titleTail}`,
    );
  });
});
