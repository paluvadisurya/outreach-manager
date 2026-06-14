import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next/navigation mock: capture router.push and serve mutable search params.
let currentParams = new URLSearchParams();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => currentParams,
  usePathname: () => "/campaigns/x",
}));
// window.confirm always accepts the destructive prompts under test.
vi.spyOn(window, "confirm").mockReturnValue(true);

// Replace window.location with a plain, writable stand-in so the Call button's
// `tel:` hand-off is captured instead of triggering jsdom's navigation error.
const realLocation = window.location;
beforeEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "" },
  });
});
afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

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

describe("Campaign page — deep-link focus", () => {
  beforeEach(() => {
    currentParams = new URLSearchParams();
    push.mockClear();
  });
  afterEach(() => cleanup());

  it("re-focuses the deep-linked person on entry, ignoring a stale stored index", async () => {
    const { campaign, messages } = await setup();
    const carol = messages[2]!;
    // Stored queue position points at the FIRST person while we arrive deep-linked
    // to the THIRD — the deep link must win.
    await campaignsRepo.setIndex(campaign.id, 0);

    currentParams = new URLSearchParams({ contact: carol.contactId });
    render(<SendingQueue campaignId={campaign.id} />);

    await screen.findByText(carol.contactName);
    expect(screen.queryByText(messages[0]!.contactName)).toBeNull();
  });
});

describe("Campaign page — Call button opens Call view", () => {
  beforeEach(() => {
    currentParams = new URLSearchParams();
    push.mockClear();
  });
  afterEach(() => cleanup());

  it("opens this person's call view and keeps them tracked on the call list", async () => {
    const { messages } = await setup();
    const first = messages[0]!; // resumeIndex lands on the first pending person
    expect(await callsRepo.get(first.contactId)).toBeUndefined();

    render(<SendingQueue campaignId={first.campaignId} />);
    await screen.findByText(first.contactName);

    await userEvent.click(
      screen.getByRole("checkbox", {
        name: new RegExp(`open call view for ${first.contactName}`, "i"),
      }),
    );

    // Deep-links to the call screen for THIS person…
    await waitFor(() => {
      const callPush = push.mock.calls
        .map((c) => String(c[0]))
        .find((u) => u.startsWith("/call?"));
      expect(callPush).toBeTruthy();
      const params = new URLSearchParams(
        callPush!.slice(callPush!.indexOf("?") + 1),
      );
      expect(params.get("contact")).toBe(first.contactId);
    });
    // …and they're on the call list so the Call section + analytics see them.
    await waitFor(async () =>
      expect(await callsRepo.get(first.contactId)).toBeTruthy(),
    );
  });
});

describe("Campaign page — Skip", () => {
  beforeEach(() => {
    currentParams = new URLSearchParams();
    push.mockClear();
  });
  afterEach(() => cleanup());

  it("marks the person skipped and advances to the next", async () => {
    const { messages } = await setup();
    const first = messages[0]!;
    render(<SendingQueue campaignId={first.campaignId} />);
    await screen.findByText(first.contactName);

    await userEvent.click(screen.getByRole("checkbox", { name: /^skip$/i }));

    // Advances to the next person…
    await screen.findByText(messages[1]!.contactName);
    // …and the first person's stored status is now skipped.
    await waitFor(async () => {
      const fresh = await campaignsRepo.messagesFor(first.campaignId);
      expect(fresh.find((m) => m.id === first.id)?.status).toBe("skipped");
    });
  });
});

describe("Campaign page — search", () => {
  beforeEach(() => {
    currentParams = new URLSearchParams();
    push.mockClear();
  });
  afterEach(() => cleanup());

  it("finds someone by name and jumps the queue to them", async () => {
    const { messages } = await setup();
    const carol = messages[2]!;
    render(<SendingQueue campaignId={messages[0]!.campaignId} />);
    await screen.findByText(messages[0]!.contactName);

    await userEvent.click(
      screen.getByRole("button", { name: /search this campaign/i }),
    );
    await userEvent.type(
      screen.getByPlaceholderText(/search name or number/i),
      "Carol",
    );
    await userEvent.click(screen.getByText(carol.contactName));

    // The card now shows Carol; the search sheet has closed.
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText(/search name or number/i),
      ).toBeNull(),
    );
    await screen.findByText(carol.phone);
  });
});
