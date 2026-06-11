import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next/navigation mock: a mutable searchParams we can swap between renders to
// simulate a fresh deep link arriving on the (cached/reused) Call screen.
let currentParams = new URLSearchParams();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => currentParams,
  usePathname: () => "/call",
}));

import { getDB, _resetDBForTests } from "@/lib/db/db";
import { parseVCF } from "@/features/contacts/lib/vcf";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { callsRepo } from "@/features/calls/lib/repository";
import { CallManager } from "./CallManager";

const PEOPLE = [
  "BEGIN:VCARD\nFN:Alice Anderson\nTEL:9000000001\nEND:VCARD",
  "BEGIN:VCARD\nFN:Bob Brown\nTEL:9000000002\nEND:VCARD",
].join("\n");

async function setup() {
  await getDB().delete();
  _resetDBForTests();
  const r = await contactsRepo.previewImport(parseVCF(PEOPLE));
  await contactsRepo.commitImport(r.upserts);
  const [alice, bob] = await contactsRepo.all();
  // Both are on the call list (mirrors the campaign having added them).
  await callsRepo.addContacts([alice!.id, bob!.id]);
  return { alice: alice!, bob: bob! };
}

/** The name shown inside the open call-detail dialog (empty when none is open). */
function openDetailName(): string {
  const dialog = screen.queryByRole("dialog");
  if (!dialog) return "";
  return within(dialog).getByRole("heading", { level: 2 }).textContent ?? "";
}

describe("Call screen honors the campaign deep link (nonce-keyed)", () => {
  beforeEach(() => {
    currentParams = new URLSearchParams();
    push.mockClear();
  });
  afterEach(() => cleanup());

  it("opens the deep-linked person's detail", async () => {
    const { bob } = await setup();
    currentParams = new URLSearchParams({ contact: bob.id, t: "n1" });
    render(<CallManager />);
    await waitFor(() => expect(openDetailName()).toContain("Bob"));
  });

  it("reopens the SAME person after close when a new nonce arrives", async () => {
    const { bob } = await setup();
    currentParams = new URLSearchParams({ contact: bob.id, t: "n1" });
    const { rerender } = render(<CallManager />);
    await waitFor(() => expect(openDetailName()).toContain("Bob"));

    // Close the sheet (Escape), then a fresh tap arrives for the same person.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    currentParams = new URLSearchParams({ contact: bob.id, t: "n2" });
    rerender(<CallManager />);
    await waitFor(() => expect(openDetailName()).toContain("Bob"));
  });

  it("switches to a different deep-linked person, never the stale one", async () => {
    const { alice, bob } = await setup();
    currentParams = new URLSearchParams({ contact: alice.id, t: "n1" });
    const { rerender } = render(<CallManager />);
    await waitFor(() => expect(openDetailName()).toContain("Alice"));

    // A new deep link targets Bob — the sheet must follow, not stay on Alice.
    currentParams = new URLSearchParams({ contact: bob.id, t: "n2" });
    rerender(<CallManager />);
    await waitFor(() => expect(openDetailName()).toContain("Bob"));
    expect(openDetailName()).not.toContain("Alice");
  });
});
