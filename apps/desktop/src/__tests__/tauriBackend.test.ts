import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import { CORE_ERRORS } from "@taskmint/contracts";
import { createTauriBackend } from "../tauriBackend";

const { EXPORT_CANCELLED, IMPORT_CANCELLED } = CORE_ERRORS;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);
const backend = createTauriBackend({ runtime: "desktop", dataLocation: "local" });
const { platform } = backend;

/** The commands dispatch was asked to run, with their args. */
function dispatched() {
  return mockInvoke.mock.calls.map(([name, payload]) => {
    expect(name).toBe("dispatch");
    const { command, args } = payload as { command: string; args: Record<string, unknown> };
    return Object.keys(args).length === 0 ? [command] : [command, args];
  });
}

describe("createTauriBackend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue("result");
  });

  it("is the desktop the Rust side reported", () => {
    expect(backend.capabilities).toEqual({ runtime: "desktop", dataLocation: "local" });
    expect(createTauriBackend({ runtime: "desktop", dataLocation: "server" }).capabilities.dataLocation).toBe("server");
  });

  it("runs data commands by name through dispatch", async () => {
    await expect(backend.call("start_task", { taskId: "t1", taskName: "Annotation" })).resolves.toBe("result");
    await backend.call("get_sessions");
    expect(mockInvoke).toHaveBeenCalledWith("dispatch", {
      command: "start_task",
      args: { taskId: "t1", taskName: "Annotation" },
    });
    expect(dispatched()).toEqual([["start_task", { taskId: "t1", taskName: "Annotation" }], ["get_sessions"]]);
  });

  it("rejects with the command's reason", async () => {
    mockInvoke.mockRejectedValue("inactive session");
    await expect(backend.call("start_timer_instance", { instanceId: "i1" })).rejects.toBe("inactive session");
  });

  describe("subscribe", () => {
    it("hands over each event's payload until unsubscribed", async () => {
      const stop = vi.fn();
      let deliver: (event: Event<unknown>) => void = () => {};
      mockListen.mockImplementation(async (_event, handler) => {
        deliver = handler as typeof deliver;
        return stop;
      });
      const handler = vi.fn();

      const unsubscribe = backend.subscribe("sessions-changed", handler);
      await vi.waitFor(() => expect(mockListen).toHaveBeenCalledWith("sessions-changed", expect.any(Function)));
      deliver({ event: "sessions-changed", id: 1, payload: { reason: "rename" } });
      await Promise.resolve();
      unsubscribe();

      expect(handler).toHaveBeenCalledWith({ reason: "rename" });
      expect(stop).toHaveBeenCalledTimes(1);
    });

    it("removes a listener that registers after unsubscribing", async () => {
      const stop = vi.fn();
      let registered: (stop: () => void) => void = () => {};
      mockListen.mockReturnValue(new Promise(resolve => (registered = resolve)));

      const unsubscribe = backend.subscribe("idle-returned", vi.fn());
      unsubscribe();
      registered(stop);

      await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
    });

    it("logs a listener Tauri refused", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      mockListen.mockRejectedValue("no event plugin");

      backend.subscribe("idle-returned", vi.fn())();

      await vi.waitFor(() =>
        expect(error).toHaveBeenCalledWith("Failed to listen for idle-returned:", "no event plugin"),
      );
      error.mockRestore();
    });
  });

  describe("files", () => {
    it("saves a CSV through the Save dialog", async () => {
      mockInvoke.mockResolvedValue("/Users/me/entries.csv");

      await expect(platform.files.save({ contents: "a,b", suggestedName: "entries.csv", format: "csv" })).resolves.toEqual({
        kind: "path",
        path: "/Users/me/entries.csv",
      });
      expect(dispatched()).toEqual([["export_csv_file", { csv: "a,b", suggestedFilename: "entries.csv" }]]);
    });

    it("saves a JSON export through the Save dialog", async () => {
      mockInvoke.mockResolvedValue("/Users/me/export.json");

      await expect(platform.files.save({ contents: "{}", suggestedName: "export.json", format: "json" })).resolves.toEqual({
        kind: "path",
        path: "/Users/me/export.json",
      });
      expect(dispatched()).toEqual([["export_data_to_file", { dataJson: "{}", suggestedFilename: "export.json" }]]);
    });

    it("is null when the Save dialog is dismissed, and rejects on a real failure", async () => {
      mockInvoke.mockRejectedValueOnce(EXPORT_CANCELLED);
      await expect(platform.files.save({ contents: "a", suggestedName: "a.csv", format: "csv" })).resolves.toBeNull();

      mockInvoke.mockRejectedValueOnce("Failed to write export file: disk full");
      await expect(platform.files.save({ contents: "a", suggestedName: "a.csv", format: "csv" })).rejects.toBe(
        "Failed to write export file: disk full",
      );
    });

    it("opens a JSON file, null when the Open dialog is dismissed", async () => {
      mockInvoke.mockResolvedValueOnce('{"version":"2"}');
      await expect(platform.files.openJson()).resolves.toBe('{"version":"2"}');
      expect(dispatched()).toEqual([["import_data_from_file"]]);

      mockInvoke.mockRejectedValueOnce(IMPORT_CANCELLED);
      await expect(platform.files.openJson()).resolves.toBeNull();
    });
  });

  it("shows OS notifications and applies their preferences in Rust", async () => {
    mockInvoke.mockResolvedValue(true);
    await expect(platform.notifications.show("longRun", "Still working?", "4h")).resolves.toBe(true);
    const prefs = { enabled: true } as never;
    await platform.notifications.setPreferences!(prefs);

    expect(dispatched()).toEqual([
      ["show_desktop_notification", { kind: "longRun", title: "Still working?", body: "4h" }],
      ["set_notification_preferences", { prefs }],
    ]);
  });

  it("reaches the idle monitor", async () => {
    const idle = platform.idle!;
    await idle.isSupported();
    await idle.setSettings({ enabled: true, thresholdMinutes: 10, longRunHours: 4 });
    await idle.getPending();
    await idle.resolve("keepResume");

    expect(dispatched()).toEqual([
      ["get_idle_support"],
      ["set_idle_settings", { settings: { enabled: true, thresholdMinutes: 10, longRunHours: 4 } }],
      ["get_idle_pause"],
      ["resolve_idle_pause", { choice: "keepResume" }],
    ]);
  });

  describe("folder backups", () => {
    const folders = platform.folderBackups!;

    it("default to a folder Rust names, and pick one with its folder dialog", async () => {
      mockInvoke.mockResolvedValueOnce("/Users/me/Documents/TaskMint Backups");
      await expect(folders.defaultFolder()).resolves.toBe("/Users/me/Documents/TaskMint Backups");
      mockInvoke.mockResolvedValueOnce(null);
      await expect(folders.pickFolder()).resolves.toBeNull();

      expect(dispatched()).toEqual([["default_backup_dir"], ["pick_backup_dir"]]);
    });

    it("validate and write through Rust", async () => {
      await folders.validateFolder("/Users/me/Backups");
      await folders.write({ folder: "/Users/me/Backups", contents: "{}", maxBackups: 10 });

      expect(dispatched()).toEqual([
        ["validate_backup_path", { path: "/Users/me/Backups" }],
        ["perform_automatic_backup", { backupPath: "/Users/me/Backups", currentDataJson: "{}", maxBackups: 10 }],
      ]);
    });
  });

  it("reveals files and reports the capture server", async () => {
    await platform.reveal!("/Users/me/export.json");
    await platform.captureStatus!();

    expect(dispatched()).toEqual([["reveal_path", { path: "/Users/me/export.json" }], ["get_capture_server_status"]]);
  });
});
