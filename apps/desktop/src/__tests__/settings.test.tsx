import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { EVENTS } from "@taskmint/contracts";
import { setBackend } from "@taskmint/client/backend";
import { asBackend, createFakeBackend, type FakeBackend } from "@taskmint/client/testing";
import { ServerSection } from "../settings/ServerSection";
import { UseLocalData } from "../settings/UseLocalData";
import type { ServerConnection } from "../server";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const notifications = vi.hoisted(() => ({ showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() }));
vi.mock("@taskmint/client/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@taskmint/client/ui")>()),
  useNotification: () => notifications,
}));

const mockInvoke = vi.mocked(invoke);

/** What each shell command answers; a function's error rejects the call. */
type Replies = Record<string, unknown>;

function answer(replies: Replies) {
  mockInvoke.mockImplementation(async (_dispatch, payload) => {
    const { command } = payload as { command: string };
    const reply = replies[command];
    if (typeof reply === "function") return reply();
    return reply;
  });
}

function sent(command: string) {
  return mockInvoke.mock.calls
    .map(([, payload]) => payload as { command: string; args: Record<string, unknown> })
    .filter(payload => payload.command === command)
    .map(payload => payload.args);
}

const bea: ServerConnection = {
  url: "http://localhost:8080",
  username: "bea",
  deviceName: "TaskMint on Bea's Mac",
  status: "connected",
  detail: null,
};

let backend: FakeBackend;

beforeEach(() => {
  vi.clearAllMocks();
  backend = createFakeBackend();
  setBackend(asBackend(backend));
});

function rejects(reason: string) {
  return () => Promise.reject(reason);
}

describe("the Server section, with the data on this computer", () => {
  it("connects to a server, then restarts to use it", async () => {
    answer({ get_server_connection: null, connect_server: bea, restart_app: undefined });
    render(<ServerSection />);
    expect(await screen.findByText(/Your data is on this computer/)).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();

    expect(screen.getByLabelText(/Server address/)).toHaveValue("http://localhost:8080");
    await userEvent.type(screen.getByLabelText(/Username/), "bea");
    await userEvent.type(screen.getByLabelText(/Password/), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByText(/TaskMint is restarting to use the server/)).toBeInTheDocument();
    expect(sent("connect_server")).toEqual([{ url: "http://localhost:8080", username: "bea", password: "secret" }]);
    expect(sent("restart_app")).toHaveLength(1);
  });

  it("says why connecting failed, and can try again", async () => {
    answer({ get_server_connection: null, connect_server: rejects("wrong username or password") });
    render(<ServerSection />);
    const address = await screen.findByLabelText(/Server address/);
    await userEvent.clear(address);
    await userEvent.type(address, "http://time.example.com");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText("Wrong username or password.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled();
    expect(sent("connect_server")[0].url).toBe("http://time.example.com");
    expect(sent("restart_app")).toEqual([]);

    // The link's news means nothing without a server
    act(() => backend.emit(EVENTS.SERVER_CONNECTION_CHANGED, { status: "unreachable", detail: "x" }));
    expect(screen.queryByText(/can't reach the server/i)).not.toBeInTheDocument();
  });

  it("says when the connection couldn't be read", async () => {
    answer({ get_server_connection: rejects("the keychain is locked") });
    render(<ServerSection />);
    expect(await screen.findByText("The keychain is locked.")).toBeInTheDocument();
  });
});

describe("the Server section, in server mode", () => {
  it("shows the server and its link as it changes", async () => {
    answer({ get_server_connection: bea });
    render(<ServerSection />);
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText(/Your data is on/)).toHaveTextContent(
      "Your data is on http://localhost:8080, signed in as bea from “TaskMint on Bea's Mac”.",
    );

    act(() =>
      backend.emit(EVENTS.SERVER_CONNECTION_CHANGED, { status: "unreachable", detail: "Connection refused" }),
    );
    expect(screen.getAllByText(/can't reach the server/i)).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("It keeps trying. Connection refused");

    act(() => backend.emit(EVENTS.SERVER_CONNECTION_CHANGED, { status: "connecting", detail: null }));
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });

  it("signs in again when the server signed this computer out", async () => {
    answer({ get_server_connection: { ...bea, status: "signedOut" }, connect_server: bea, restart_app: undefined });
    render(<ServerSection />);
    expect(await screen.findByText("Signed out")).toBeInTheDocument();
    expect(screen.getByLabelText(/Username/)).toHaveValue("bea");
    await userEvent.type(screen.getByLabelText(/Password/), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    await waitFor(() => expect(sent("restart_app")).toHaveLength(1));
    expect(sent("connect_server")).toEqual([{ url: bea.url, username: "bea", password: "secret" }]);
  });

  it("copies this computer's data to the server, once confirmed", async () => {
    answer({
      get_server_connection: bea,
      upload_local_data: {
        records: 4,
        restored: { sessionsRestored: 12, sessionsAlreadyPresent: 2 },
        warnings: ["1 saved session record(s) could not be read and were skipped."],
      },
    });
    render(<ServerSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Copy this computer's data here" }));
    expect(screen.getByText(/nothing there is replaced/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(notifications.showSuccess).toHaveBeenCalledWith(
        "Copied 12 session(s) and 4 kind(s) of records to the server (2 session(s) were there already).",
      ),
    );
    expect(notifications.showWarning).toHaveBeenCalledWith(
      "1 saved session record(s) could not be read and were skipped.",
    );
  });

  it("says why copying failed, and stays open to try again", async () => {
    answer({ get_server_connection: bea, upload_local_data: rejects("the request is too large") });
    render(<ServerSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Copy this computer's data here" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(notifications.showError).toHaveBeenCalledWith("The request is too large."));
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("disconnects and restarts on this computer's data", async () => {
    answer({ get_server_connection: bea, disconnect_server: { signedOut: true }, restart_app: undefined });
    render(<ServerSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    expect(screen.getByText(/The server keeps its data/)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(sent("restart_app")).toHaveLength(1));
    expect(notifications.showWarning).not.toHaveBeenCalled();
  });

  it("says when the server couldn't be told, or disconnecting failed", async () => {
    answer({ get_server_connection: bea, disconnect_server: { signedOut: false }, restart_app: undefined });
    const { unmount } = render(<ServerSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(notifications.showWarning).toHaveBeenCalledWith(expect.stringMatching(/revoke it there/)));
    unmount();

    answer({ get_server_connection: bea, disconnect_server: rejects("the keychain is locked") });
    render(<ServerSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(notifications.showError).toHaveBeenCalledWith("The keychain is locked."));
  });
});

describe("the startup error's way back", () => {
  it("disconnects and restarts on this computer's data", async () => {
    answer({ disconnect_server: { signedOut: false }, restart_app: undefined });
    render(<UseLocalData />);
    await userEvent.click(screen.getByRole("button", { name: "Disconnect and use this computer's data" }));
    await waitFor(() => expect(sent("restart_app")).toHaveLength(1));
  });

  it("says why it couldn't", async () => {
    answer({ disconnect_server: rejects("the keychain is locked") });
    render(<UseLocalData />);
    await userEvent.click(screen.getByRole("button", { name: "Disconnect and use this computer's data" }));
    expect(await screen.findByRole("status")).toHaveTextContent("The keychain is locked.");
  });
});
