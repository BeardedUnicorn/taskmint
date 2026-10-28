import type { AppExtensions } from "@taskmint/client/start";
import type { Capabilities } from "@taskmint/client/backend";
import { ServerSection } from "./settings/ServerSection";
import { UseLocalData } from "./settings/UseLocalData";

/** The desktop's own parts of the client: the Server section, and in server mode a way back to local data. */
export function desktopExtensions({ dataLocation }: Capabilities): AppExtensions {
  return {
    settingsSections: [{ id: "server", label: "Server", Section: ServerSection }],
    ...(dataLocation === "server" ? { StartupErrorActions: UseLocalData } : {}),
  };
}
