import sequelize from "../../database";
import Company from "../../models/Company";

describe("DB harness — conexión a chateam_test", () => {
  beforeAll(async () => { await sequelize.authenticate(); });
  afterAll(async () => { await sequelize.close(); });

  it("conecta y Companies está vacía (0)", async () => {
    expect(await Company.count()).toBe(0);
  });
});
