/**
 * Robustez del AST transformer: NO debe tocar strings ni comentarios. Este archivo contiene
 * el literal import.meta.url dentro de un string A PROPÓSITO — con el replace de texto anterior
 * rompía ("url is not defined"); con el transform AST el string queda intacto y el archivo
 * sin convertir se importa en verde.
 */
const marcador = "createRequire(import.meta.url) dentro de un string NO debe romperse";

describe("Transform esm-compat AST — no corrompe strings con el literal", () => {
  it("mantiene el string intacto y aún importa un archivo sin convertir", async () => {
    expect(marcador).toContain("import.meta.url");
    const mod = await import(
      "../../database/migrations/20210818102606-add-uuid-to-tickets"
    );
    const migration = (mod as any).default ?? mod;
    expect(typeof migration.up).toBe("function");
  });
});
