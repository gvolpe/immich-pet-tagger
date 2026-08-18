import { apiResult } from "./api-client.js";
import { el } from "./dom.js";
import { matchResultAsync } from "./fp.js";
import type { VersionResponse } from "./types.js";

function isDisplayableVersion(version: string): boolean {
  return version.trim() !== "" && version !== "unknown";
}

export async function initVersionLabel(): Promise<void> {
  const label = el("versionLabel");
  const current = await apiResult<VersionResponse>("/api/version");
  await matchResultAsync(current, {
    err: () => Promise.resolve(),
    ok: async ({ version }) => {
      if (!isDisplayableVersion(version)) {
        label.hidden = true;
        label.textContent = "";
        return;
      }

      label.hidden = false;
      label.textContent = version;
    },
  });
}
