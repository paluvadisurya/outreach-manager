import { parseVCF } from "@/features/contacts/lib/vcf";
import { contactsRepo } from "@/features/contacts/lib/repository";
import { categoriesRepo } from "@/features/categories/lib/repository";
import { templatesRepo } from "@/features/templates/lib/repository";

interface DemoCategory {
  name: string;
}
interface DemoTemplate {
  name: string;
  body: string;
}

/**
 * Populate the database from the demo seed files in `/public/seed`. Contacts go
 * through the real import pipeline (so duplicates merge and invalid records are
 * skipped). Every imported contact is added to the first category so a campaign
 * can be generated immediately for first-run testing.
 */
export async function loadDemoData(): Promise<void> {
  const [vcfText, categories, templates] = await Promise.all([
    fetch("/seed/demo-contacts.vcf").then((r) => r.text()),
    fetch("/seed/demo-categories.json").then(
      (r) => r.json() as Promise<DemoCategory[]>,
    ),
    fetch("/seed/demo-templates.json").then(
      (r) => r.json() as Promise<DemoTemplate[]>,
    ),
  ]);

  const cards = parseVCF(vcfText);
  const result = await contactsRepo.previewImport(cards);
  await contactsRepo.commitImport(result.upserts);

  const createdCategories = [];
  for (const c of categories) {
    createdCategories.push(await categoriesRepo.create(c.name));
  }

  for (const t of templates) {
    await templatesRepo.create(t.name, t.body);
  }

  // Seed a usable campaign source: drop everyone into "Property Buyers".
  const firstCategory = createdCategories[0];
  if (firstCategory) {
    const all = await contactsRepo.all();
    await contactsRepo.addToCategory(
      all.map((c) => c.id),
      firstCategory.id,
    );
  }
}
