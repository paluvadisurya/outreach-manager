import { describe, it, expect } from "vitest";
import type { Contact } from "@/lib/types";
import {
  renderTemplate,
  extractVariables,
  tidyMessage,
} from "./render";

const contact: Partial<Contact> = {
  firstName: "Ramesh",
  lastName: "Kumar",
  fullName: "Ramesh Kumar",
  phone: "+91 98765 43210",
  email: "ramesh@example.com",
  company: "Kumar Estates",
  designation: "Director",
};

describe("renderTemplate", () => {
  it("replaces variables with contact values", () => {
    const { text } = renderTemplate("Hi {{first_name}} from {{company}}", contact);
    expect(text).toBe("Hi Ramesh from Kumar Estates");
  });

  it("supports all documented variables", () => {
    const body =
      "{{first_name}}|{{last_name}}|{{full_name}}|{{phone}}|{{email}}|{{company}}|{{designation}}";
    const { text } = renderTemplate(body, contact);
    expect(text).toBe(
      "Ramesh|Kumar|Ramesh Kumar|+91 98765 43210|ramesh@example.com|Kumar Estates|Director",
    );
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("Hi {{ first_name }}", contact).text).toBe("Hi Ramesh");
  });

  it("reports variables that are empty for the contact", () => {
    const { text, missing } = renderTemplate("Hi {{first_name}} {{company}}", {
      firstName: "Ramesh",
    });
    expect(text).toBe("Hi Ramesh ");
    expect(missing).toEqual(["company"]);
  });

  it("leaves unknown tokens untouched so typos are visible", () => {
    const { text } = renderTemplate("Hi {{frist_name}}", contact);
    expect(text).toBe("Hi {{frist_name}}");
  });

  it("does not mutate when there are no tokens", () => {
    expect(renderTemplate("Plain message", contact).text).toBe("Plain message");
  });
});

describe("extractVariables", () => {
  it("returns distinct, valid variables used in a body", () => {
    const vars = extractVariables(
      "Hi {{first_name}}, {{first_name}} {{company}} {{bogus}}",
    );
    expect(vars.sort()).toEqual(["company", "first_name"]);
  });
});

describe("tidyMessage", () => {
  it("collapses whitespace left by empty variables", () => {
    expect(tidyMessage("Hi   there\n\n\n\nbye  ")).toBe("Hi there\n\nbye");
  });
});
