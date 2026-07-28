import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingOfficePreview } from "./LandingOfficePreview";

const state = vi.hoisted(() => {
  let resolveRenderer: (() => void) | undefined;
  const controller = {
    destroy: vi.fn(),
    inspect: vi.fn(),
    renderSnapshot: vi.fn(),
    setCameraMode: vi.fn(),
    setPaused: vi.fn(),
  };
  const createOfficeSnapshotRenderer = vi.fn(
    async ({ host }: { readonly host: HTMLDivElement }) => {
      host.appendChild(document.createElement("canvas"));
      await new Promise<void>((resolve) => {
        resolveRenderer = resolve;
      });
      return controller;
    },
  );

  return {
    controller,
    createOfficeSnapshotRenderer,
    resolve: () => resolveRenderer?.(),
  };
});

vi.mock("../research/officeGame", () => ({
  createOfficeSnapshotRenderer: state.createOfficeSnapshotRenderer,
}));

describe("LandingOfficePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a stable DotsRing loader visible until the first projected office frame is ready", async () => {
    // Given
    const { container } = render(<LandingOfficePreview locale="en" />);
    const world = container.querySelector(".landing-office-live__world");
    if (!(world instanceof HTMLDivElement)) {
      throw new TypeError("office world missing");
    }

    // Then
    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparing the research office",
    );
    expect(world).not.toHaveAttribute("data-office-ready");

    // When
    await waitFor(() =>
      expect(state.createOfficeSnapshotRenderer).toHaveBeenCalledOnce(),
    );
    await act(async () => state.resolve());

    // Then
    await waitFor(() =>
      expect(world).toHaveAttribute("data-office-ready", "true"),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(state.controller.renderSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      { cameraMode: "overview" },
    );
  });
});
