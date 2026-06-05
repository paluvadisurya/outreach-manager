"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/types";
import { settingsRepo } from "../lib/repository";

/** Live-updating access to the persisted app settings. */
export function useSettings(): AppSettings {
  return useLiveQuery(() => settingsRepo.get(), []) ?? DEFAULT_SETTINGS;
}
