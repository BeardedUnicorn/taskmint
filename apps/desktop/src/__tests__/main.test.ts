import { describe, it, expect, vi } from "vitest";
import { startClient } from "@taskmint/client/start";
import { createTauriBackend } from "../tauriBackend";

vi.mock("@taskmint/client/start", () => ({ startClient: vi.fn(async () => undefined) }));
vi.mock("../tauriBackend", () => ({ createTauriBackend: vi.fn(() => ({ name: "tauri" })) }));

describe("the desktop entry", () => {
  it("starts the client in #root against the Tauri backend", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);

    await import("../main");

    expect(createTauriBackend).toHaveBeenCalledTimes(1);
    expect(startClient).toHaveBeenCalledWith(root, {
      backend: { name: "tauri" },
      extensions: {},
      // Tests run as a development build
      importLegacyRecords: false,
    });
  });
});
