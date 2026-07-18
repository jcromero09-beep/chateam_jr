// Config de harness AISLADA: ts-jest con el AST transformer esm-compat, para importar
// archivos con createRequire/import.meta SIN convertir la fuente. No toca jest.config.ts.
// (Cuando se adopte para todo el monolito, mover el astTransformers a jest.config.ts.)
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/harness"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        isolatedModules: true,
        diagnostics: false,
        astTransformers: { before: ["<rootDir>/tests/harness/esmCompatAst.cjs"] },
      },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    // baileys y subpaths son ESM-only en node_modules → stub para characterization tests.
    "^baileys(/.*)?$": "<rootDir>/tests/harness/__mocks__/baileysStub.cjs",
    // Imports relativos con extensión .js explícita (idioma ESM/NodeNext) → resolver el .ts.
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testTimeout: 30000,
};
