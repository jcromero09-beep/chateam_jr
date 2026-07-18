// Harness de DB de test (chateam_test). Separado de jest.harness.config.cjs por *.dbtest.ts.
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/harness"],
  testMatch: ["**/*.dbtest.ts"],
  setupFiles: ["<rootDir>/tests/harness/dbEnv.cjs"],
  // Redis efímero (6399) para flujos que await-ean colas Bull (verifyQueue → UpdateTicketService).
  globalSetup: "<rootDir>/tests/harness/globalSetup.cjs",
  globalTeardown: "<rootDir>/tests/harness/globalTeardown.cjs",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true, diagnostics: false,
      astTransformers: { before: ["<rootDir>/tests/harness/esmCompatAst.cjs"] } }],
  },
  moduleFileExtensions: ["ts","tsx","js","jsx","json","node"],
  moduleNameMapper: {
    "^baileys(/.*)?$": "<rootDir>/tests/harness/__mocks__/baileysStub.cjs",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testTimeout: 30000,
  // Serial OBLIGATORIO: todos los *.dbtest comparten chateam_test + truncateAll en beforeEach.
  // En paralelo, un worker trunca los datos de otro (flaky) y el mock de fs se cruza (cuelgue).
  maxWorkers: 1,
};
