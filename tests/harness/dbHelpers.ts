/**
 * Helpers del harness de DB de test (chateam_test). truncateAll aísla entre tests;
 * seedTenant crea el grafo mínimo (Plan→Company→User→Whatsapp→Queue→Contact) que
 * necesita el flujo de ingesta de mensajes. Solo corre contra chateam_test.
 */
import sequelize from "../../database";
import Plan from "../../models/Plan";
import Company from "../../models/Company";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import Contact from "../../models/Contact";
import CompaniesSettings from "../../models/CompaniesSettings";

export async function truncateAll(): Promise<void> {
  await sequelize.query(`DO $$ DECLARE r RECORD; BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'SequelizeMeta')
    LOOP EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" RESTART IDENTITY CASCADE'; END LOOP;
  END $$;`);
}

export async function seedTenant() {
  const plan = await Plan.create({ name: "Test Plan" } as any);
  const company = await Company.create({ name: "Test Co", planId: (plan as any).id } as any);
  const cid = (company as any).id;
  const user = await User.create({ name: "Agente", email: "agente@test.local", passwordHash: "x", companyId: cid } as any);
  const whatsapp = await Whatsapp.create({ name: "wa-test", companyId: cid } as any);
  const queue = await Queue.create({ name: "Soporte", color: "#00AABB", companyId: cid } as any);
  await CompaniesSettings.create({ companyId: cid } as any);
  const contact = await Contact.create({ name: "Cliente", number: "593999999999", companyId: cid } as any);
  return { plan, company, user, whatsapp, queue, contact };
}

/**
 * Siembra N colas para una empresa (verifyQueue/menú necesita ≥2). Prep para la
 * characterization de verifyQueue (Tier 10) en sesión fresca.
 */
export async function seedQueues(
  companyId: number,
  defs: Array<{ name: string; color: string; greetingMessage?: string }>
) {
  const created: any[] = [];
  for (const d of defs) {
    created.push(
      await Queue.create({
        name: d.name,
        color: d.color,
        greetingMessage: d.greetingMessage ?? null,
        companyId,
      } as any)
    );
  }
  return created;
}
