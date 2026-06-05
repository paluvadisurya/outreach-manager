"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "@/lib/storage/persist";

/**
 * Registers the service worker that makes the app installable and
 * offline-capable, and asks the browser to keep our IndexedDB data durable.
 * SW registration only runs in production so it never interferes with the dev
 * server's hot-module reloading; the persistence request runs everywhere.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Keep the local database from being evicted under storage pressure.
    void requestPersistentStorage();

    if (
      process.env.NODE_ENV !== "production" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    const onLoad = () =>
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
