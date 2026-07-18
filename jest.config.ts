import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: [
    "**/*.test.ts",
    "**/*.spec.ts"
  ],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      // isolatedModules evita type-checking completo → mucho más rápido y menos RAM
      isolatedModules: true,
      // No verificar tipos en tests (ya lo hace tsc --noEmit)
      diagnostics: false
    }]
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  coverageDirectory: "coverage",
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/tests/"
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/dist/",
    "<rootDir>/node_modules/.cache/"
  ],
  // tests/harness/ usa su propia config (jest.harness.config.cjs) con AST transform +
  // moduleNameMapper (baileys/.js) para importar el monolito. NO deben correr aquí.
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/tests/harness/"
  ],
  // Solo transformar archivos de test, no todo node_modules
  transformIgnorePatterns: ["/node_modules/"],
  // Timeout de 30s para tests con mocks
  testTimeout: 30000,
  verbose: true
};

export default config;
