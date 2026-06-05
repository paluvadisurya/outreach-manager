import type { Template } from "@/lib/types";
import { getDB } from "@/lib/db/db";
import { uid } from "@/lib/id";

export const templatesRepo = {
  async all(): Promise<Template[]> {
    return getDB().templates.orderBy("updatedAt").reverse().toArray();
  },

  async get(id: string): Promise<Template | undefined> {
    return getDB().templates.get(id);
  },

  async create(name: string, body: string): Promise<Template> {
    const now = Date.now();
    const template: Template = {
      id: uid(),
      name: name.trim(),
      body,
      createdAt: now,
      updatedAt: now,
    };
    await getDB().templates.add(template);
    return template;
  },

  async update(
    id: string,
    patch: Partial<Pick<Template, "name" | "body">>,
  ): Promise<void> {
    await getDB().templates.update(id, { ...patch, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    await getDB().templates.delete(id);
  },
};
