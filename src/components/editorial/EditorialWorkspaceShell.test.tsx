import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorialWorkspaceShell } from "./EditorialWorkspaceShell";

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../Brand", () => ({
  Brand: () => <span data-testid="editorial-masthead-brand">Stocksembly</span>,
}));
vi.mock("../SignedInSidebar", () => ({
  SignedInSidebar: (props: {
    readonly activeItem: string;
    readonly collapsed: boolean;
  }) => (
    <aside
      data-active-item={props.activeItem}
      data-collapsed={String(props.collapsed)}
    />
  ),
}));
vi.mock("../SiteAtmosphere", () => ({
  SiteAtmosphere: () => <div data-testid="site-atmosphere" />,
}));

const localePaths = {
  en: "/en/blog",
  ko: "/ko/blog",
  ja: "/ja/blog",
  "zh-TW": "/zh-TW/blog",
  es: "/es/blog",
  "pt-BR": "/pt-BR/blog",
  de: "/de/blog",
  fr: "/fr/blog",
} as const;

beforeEach(() => router.replace.mockReset());

describe("EditorialWorkspaceShell", () => {
  it("renders the home atmosphere behind every editorial surface", () => {
    render(
      <EditorialWorkspaceShell
        access={{ authenticated: false, tier: "free" }}
        activeItem="glossary"
        locale="ko"
        localePaths={localePaths}
      >
        <main>Glossary library</main>
      </EditorialWorkspaceShell>,
    );

    expect(screen.getByTestId("site-atmosphere")).toBeInTheDocument();
  });

  it("keeps the authenticated workspace sidebar collapsed on entry", () => {
    render(
      <EditorialWorkspaceShell
        access={{ authenticated: true, tier: "paid" }}
        activeItem="blog"
        locale="ko"
        localePaths={localePaths}
      >
        <main>Article library</main>
      </EditorialWorkspaceShell>,
    );

    const sidebar = screen.getByRole("complementary");
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(sidebar).toHaveAttribute("data-active-item", "blog");
    expect(screen.queryByTestId("editorial-masthead-brand")).toBeNull();
  });

  it("shows only the quiet brand masthead to anonymous readers", () => {
    render(
      <EditorialWorkspaceShell
        access={{ authenticated: false, tier: "free" }}
        activeItem="blog"
        locale="ko"
        localePaths={localePaths}
      >
        <main>Article library</main>
      </EditorialWorkspaceShell>,
    );

    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByTestId("editorial-masthead-brand")).toBeInTheDocument();
  });
});
