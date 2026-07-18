import sequelize from "../../database";
import Contact from "../../models/Contact";
import { truncateAll, seedTenant } from "./dbHelpers";

describe("DB harness — seed de tenant + aislamiento", () => {
  beforeAll(async () => { await sequelize.authenticate(); });
  afterAll(async () => { await sequelize.close(); });
  beforeEach(async () => { await truncateAll(); });

  it("siembra el grafo mínimo y persiste", async () => {
    const { company, contact } = await seedTenant();
    expect((company as any).id).toBeGreaterThan(0);
    const found = await Contact.findOne({ where: { number: "593999999999", companyId: (company as any).id } });
    expect(found).not.toBeNull();
    expect((found as any).name).toBe("Cliente");
  });

  it("truncateAll deja la DB vacía entre tests (aislamiento)", async () => {
    expect(await Contact.count()).toBe(0);
  });
});
