import type { AppSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { getDB, SETTINGS_KEY } from "@/lib/db/db";

export const settingsRepo = {
  /** Read persisted settings, falling back to defaults for any missing keys. */
  async get(): Promise<AppSettings> {
    const row = await getDB().settings.get(SETTINGS_KEY);
    if (!row) return { ...DEFAULT_SETTINGS };
    const { id: _id, ...settings } = row;
    return { ...DEFAULT_SETTINGS, ...settings };
  },

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.get();
    const next = { ...current, ...patch };
    await getDB().settings.put({ id: SETTINGS_KEY, ...next });
    return next;
  },
};
