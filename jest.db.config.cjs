// Harness de DB de test (chateam_test). Separado de jest.harness.config.cjs por *.dbtest.ts.
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/harness"],
  testMatch: ["**/*.dbtest.ts"],
  setupFiles: ["<rootDir>/tests/harness/dbEnv.cjs"],
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
};
