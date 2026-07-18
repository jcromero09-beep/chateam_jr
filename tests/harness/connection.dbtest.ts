import sequelize from "../../database";
import Company from "../../models/Company";
import { truncateAll } from "./dbHelpers";

describe("DB harness — conexión a chateam_test", () => {
  beforeAll(async () => { await sequelize.authenticate(); });
  afterAll(async () => { await sequelize.close(); });

  // Auto-aislado: trunca primero. Las suites comparten chateam_test y corren en orden arbitrario
  // (jest ordena por duración), así que NO se puede asumir DB vacía sin truncar aquí.
  it("conecta y, tras truncar, Companies está vacía (0)", async () => {
    await truncateAll();
    expect(await Company.count()).toBe(0);
  });
});
