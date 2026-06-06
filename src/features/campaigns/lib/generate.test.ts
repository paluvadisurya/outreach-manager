import { describe, it, expect } from "vitest";
import type { Contact } from "@/lib/types";
import { generateCampaignMessages } from "./generate";
import { buildSearchIndex } from "@/features/contacts/lib/merge";

function contact(partial: Partial<Contact> & { id: string }): Contact {
  const base = {
    phone: "+91 98765 43210",
    rawPhone: "",
    firstName: "",
    lastName: "",
    fullName: "",
    categoryIds: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Contact;
  return { ...base, searchIndex: buildSearchIndex(base) };
}

describe("generateCampaignMessages", () => {
  const contacts = [
    contact({ id: "+911", firstName: "Ramesh", fullName: "Ramesh Kumar", phone: "+911" }),
    contact({ id: "+912", firstName: "Anita", fullName: "Anita Sharma", phone: "+912" }),
  ];

  it("renders a frozen message per contact", () => {
    const msgs = generateCampaignMessages("camp1", contacts, "Hi {{first_name}}", "t1");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.message).toBe("Hi Ramesh");
    expect(msgs[1]!.message).toBe("Hi Anita");
  });

  it("assigns stable order and ids", () => {
    const msgs = generateCampaignMessages("camp1", contacts, "Hi", "t1");
    expect(msgs[0]!.order).toBe(0);
    expect(msgs[1]!.order).toBe(1);
    expect(msgs[0]!.id).toBe("camp1:+911");
  });

  it("stamps the template id on every message", () => {
    const msgs = generateCampaignMessages("camp1", contacts, "Hi", "t1");
    expect(msgs.every((m) => m.templateId === "t1")).toBe(true);
  });

  it("offsets order from startOrder when appending", () => {
    const msgs = generateCampaignMessages(
      "camp1",
      contacts,
      "Hi",
      "t1",
      Date.now(),
      undefined,
      5,
    );
    expect(msgs[0]!.order).toBe(5);
    expect(msgs[1]!.order).toBe(6);
  });

  it("starts every message pending", () => {
    const msgs = generateCampaignMessages("camp1", contacts, "Hi", "t1");
    expect(msgs.every((m) => m.status === "pending")).toBe(true);
  });

  it("snapshots the contact name and phone", () => {
    const [msg] = generateCampaignMessages("camp1", contacts, "Hi", "t1");
    expect(msg!.contactName).toBe("Ramesh Kumar");
    expect(msg!.phone).toBe("+911");
  });

  it("produces no messages for an empty contact list", () => {
    expect(generateCampaignMessages("camp1", [], "Hi", "t1")).toHaveLength(0);
  });

  it("trims multi-word first names at render time", () => {
    const multi = [
      contact({
        id: "+913",
        firstName: "Ayush Unni SusTech",
        fullName: "Ayush Unni SusTech Uber",
        phone: "+913",
      }),
    ];
    const [msg] = generateCampaignMessages(
      "camp1",
      multi,
      "Hello {{first_name}}",
      "t1",
    );
    expect(msg!.message).toBe("Hello Ayush");
    // The full name snapshot is preserved for display.
    expect(msg!.contactName).toBe("Ayush Unni SusTech Uber");
  });
});
