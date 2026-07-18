// [Fase A] Config de tests de INTEGRACIÓN.
// Faltaba este archivo → `npm run test:integration` (y los jobs de CI/deploy que dependen de él)
// fallaban con "Can't find config". Espeja jest.config.ts pero acota a tests/integration/.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integration"],
  testMatch: ["**/*.test.ts", "**/*.spec.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        // Igual que jest.config.ts: sin type-check completo (más rápido, menos RAM)
        isolatedModules: true,
        diagnostics: false
      }
    ]
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testTimeout: 30000,
  modulePathIgnorePatterns: ["<rootDir>/dist/", "<rootDir>/node_modules/.cache/"]
};
