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
  moduleNameMapper: {
    // @modelcontextprotocol/sdk es ESM puro con import() dinámico: bajo el vm CJS
    // de jest no falla como un test rojo, TUMBA EL WORKER. Ver tests/mcpSdkStub.cjs.
    "^@modelcontextprotocol/sdk(/.*)?$": "<rootDir>/tests/mcpSdkStub.cjs"
  },
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
  //
  // tests/e2e/ es de Playwright (`testDir: './tests/e2e'` en playwright.config.ts y
  // en playwright.live.config.ts). El `**/*.spec.ts` de testMatch los recogía y los
  // 4 fallaban en CADA corrida con "Playwright Test did not expect test() to be
  // called here". Eso no era cosmético: una suite que sale siempre con 4-5 rojos
  // entrena a leer el rojo como normal, y ahí es donde se cuela un rojo de verdad.
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/tests/harness/",
    "<rootDir>/tests/e2e/"
  ],
  // Solo transformar archivos de test, no todo node_modules
  transformIgnorePatterns: ["/node_modules/"],
  // Timeout de 30s para tests con mocks
  testTimeout: 30000,
  verbose: true
};

export default config;
