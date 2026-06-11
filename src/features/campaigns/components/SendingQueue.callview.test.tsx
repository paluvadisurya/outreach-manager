import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next/navigation mock: capture router.push and serve empty search params.
let currentParams = new URLSearchParams();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => currentParams,
  usePathname: () => "/campaigns/x",
}));
// window.confirm always accepts (the "add to call list?" prompt).
vi.spyOn(window, "confirm").mockReturnValue(true);

import { getDB, _resetDBForTests } from "@/lib/db/db";
import { parseVCF } from "@/features/contacts/lib/vcf";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { templatesRepo } from "@/features/templates/lib/repository";
import { campaignsRepo } from "@/features/campaigns/lib/repository";
import { callsRepo } from "@/features/calls/lib/repository";
import { SendingQueue } from "./SendingQueue";

const PEOPLE = [
  "BEGIN:VCARD\nFN:Alice Anderson\nTEL:9000000001\nEND:VCARD",
  "BEGIN:VCARD\nFN:Bob Brown\nTEL:9000000002\nEND:VCARD",
  "BEGIN:VCARD\nFN:Carol Clark\nTEL:9000000003\nEND:VCARD",
].join("\n");

async function setup() {
  await getDB().delete();
  _resetDBForTests();
  const r = await contactsRepo.previewImport(parseVCF(PEOPLE));
  await contactsRepo.commitImport(r.upserts);
  const contacts = await contactsRepo.all();
  const cat = await categoriesRepo.create("All");
  await contactsRepo.addToCategory(contacts.map((c) => c.id), cat.id);
  const t = await templatesRepo.create("T", "Hi {{first_name}}");
  const campaign = await campaignsRepo.create({
    name: "C",
    categoryId: cat.id,
    templateId: t.id,
  });
  const messages = await campaignsRepo.messagesFor(campaign.id);
  return { campaign, contacts, messages };
}

/** The most recent /call?… push url. */
function lastCallPush(): string | null {
  const calls = push.mock.calls.map((c) => String(c[0]));
  return [...calls].reverse().find((u) => u.startsWith("/call?")) ?? null;
}

/** The contact id encoded into the most recent /call?contact=… push. */
function pushedContactId(): string | null {
  const last = lastCallPush();
  if (!last) return null;
  return new URLSearchParams(last.slice(last.indexOf("?") + 1)).get("contact");
}

/** The contact id carried in the return origin (`from`) of that push. */
function returnFocusContactId(): string | null {
  const last = lastCallPush();
  if (!last) return null;
  const from = new URLSearchParams(last.slice(last.indexOf("?") + 1)).get("from");
  if (!from) return null;
  return new URLSearchParams(from.slice(from.indexOf("?") + 1)).get("contact");
}

/**
 * Open the visible person's call view through the single smart button. When
 * they're not on the call list yet the button reads "Add to call view" (a first
 * tap adds them and flips it); once on the list it reads "Call view" and opens.
 */
async function openVisibleCallView() {
  const add = screen.queryByRole("button", {
    name: /add this person to the call list/i,
  });
  if (add) {
    await userEvent.click(add);
    // Wait for the live call list to flip the button into its open state.
    await screen.findByRole("button", {
      name: /open this person's call view/i,
    });
  }
  await userEvent.click(
    screen.getByRole("button", { name: /open this person's call view/i }),
  );
}

describe("Campaigns 'Call view' targets the person on screen", () => {
  beforeEach(() => {
    currentParams = new URLSearchParams();
    push.mockClear();
  });
  afterEach(() => cleanup());

  it("pushes the visible person's id (no add needed when already listed)", async () => {
    const { messages } = await setup();
    const first = messages[0]!; // resumeIndex lands on the first pending person
    // Pre-add the visible person so 'Call view' skips the confirm and just opens.
    await callsRepo.addContacts([first.contactId]);

    render(<SendingQueue campaignId={messages[0]!.campaignId} />);
    await screen.findByText(first.contactName);

    await openVisibleCallView();

    await waitFor(() => expect(pushedContactId()).toBe(first.contactId));
  });

  it("adds the NEW person then opens THAT same person (the reported flow)", async () => {
    const { messages } = await setup();
    const first = messages[0]!;
    // first is NOT on the call list yet → the button adds, flips, then opens them.
    expect(await callsRepo.get(first.contactId)).toBeUndefined();

    render(<SendingQueue campaignId={messages[0]!.campaignId} />);
    await screen.findByText(first.contactName);

    await openVisibleCallView();

    // The newly-added call entry and the deep-link target are the SAME person.
    await waitFor(async () => {
      expect(await callsRepo.get(first.contactId)).toBeTruthy();
      expect(pushedContactId()).toBe(first.contactId);
    });
  });

  it("after navigating the queue, opens the now-visible person — not a neighbour", async () => {
    const { messages } = await setup();
    render(<SendingQueue campaignId={messages[0]!.campaignId} />);
    await screen.findByText(messages[0]!.contactName);

    // Step forward to the 2nd person via the Next chevron.
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText(messages[1]!.contactName);

    await openVisibleCallView();

    await waitFor(() => expect(pushedContactId()).toBe(messages[1]!.contactId));
    // And never the neighbour we moved away from.
    expect(pushedContactId()).not.toBe(messages[0]!.contactId);
  });

  it("carries the SAME person in the return origin (stable round-trip)", async () => {
    const { messages } = await setup();
    const first = messages[0]!;
    await callsRepo.addContacts([first.contactId]);

    render(<SendingQueue campaignId={messages[0]!.campaignId} />);
    await screen.findByText(first.contactName);
    await openVisibleCallView();

    // Closing the call view returns to /campaigns/X?contact=<this person>, so the
    // queue re-focuses them by identity rather than a stale numeric index.
    await waitFor(() => expect(returnFocusContactId()).toBe(first.contactId));
  });

  it("re-focuses the deep-linked person on return, ignoring a stale stored index", async () => {
    const { campaign, messages } = await setup();
    const carol = messages[2]!;
    // Simulate the stored queue position pointing at the FIRST person, while the
    // user is returning from the call view focused on the THIRD person.
    await campaignsRepo.setIndex(campaign.id, 0);

    currentParams = new URLSearchParams({ contact: carol.contactId });
    render(<SendingQueue campaignId={campaign.id} />);

    // The card must show Carol (the deep-link target), not Alice (stored index 0).
    await screen.findByText(carol.contactName);
    expect(screen.queryByText(messages[0]!.contactName)).toBeNull();
  });
});
