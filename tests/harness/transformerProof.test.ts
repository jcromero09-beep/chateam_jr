/**
 * Prueba del transform esm-compat: importar un archivo que TODAVÍA tiene
 * `createRequire(import.meta.url)` (sin convertir la fuente) debe cargar en verde
 * cuando corre bajo jest.harness.config.cjs. Si pasa, el transform desbloquea los
 * ~120 archivos import.meta de una, con 0 cambios en producción.
 */
describe("Transform esm-compat — importa createRequire/import.meta sin convertir", () => {
  it("carga una migración con el idioma ESM createRequire, sin convertir, vía el transform", async () => {
    const mod = await import(
      "../../database/migrations/20210818102606-add-uuid-to-tickets"
    );
    expect(mod).toBeDefined();
    const migration = (mod as any).default ?? mod;
    expect(typeof migration.up).toBe("function");
    expect(typeof migration.down).toBe("function");
  });
});
