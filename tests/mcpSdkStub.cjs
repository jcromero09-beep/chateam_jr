/**
 * Stub universal para `@modelcontextprotocol/sdk` y todos sus subpaths.
 *
 * ## Por qué
 *
 * El SDK es ESM puro (`"type": "module"`) y su cadena de carga hace un `import()`
 * dinámico. Bajo el vm CJS de jest eso revienta con
 * `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`, y no como un fallo de test
 * limpio: **tumba el worker entero** ("Jest worker encountered 4 child process
 * exceptions, exceeding retry limit"). El síntoma no apunta al SDK por ningún
 * lado, así que cuesta media hora encontrarlo.
 *
 * Lo arrastra un solo import de producción
 * (`services/AIAgentServices/MetaOfficialMCPClientService.ts:30-31`), pero por
 * transitividad se lleva por delante cualquier test que toque esa cadena — hoy
 * `tests/unit/meta-official-mcp.test.ts`, mañana cualquiera. Por eso el mapeo va
 * en la config y no como `jest.mock` dentro de un test.
 *
 * ## Qué NO cubre
 *
 * Esto NO permite testear la interacción real con el SDK: cualquier acceso
 * devuelve el mismo proxy. Sirve para los tests que verifican lo que pasa
 * **antes** de llegar al cliente MCP (p.ej. que sin token OAuth se lanza
 * `MCP_OFFICIAL_AUTH_REQUIRED` y no se construye cliente alguno). Si algún día
 * hace falta ejercitar el SDK de verdad, es un test de integración con ESM real,
 * no de esta suite.
 *
 * Mismo patrón que `tests/harness/__mocks__/baileysStub.cjs`, incluida la trampa
 * del thenable.
 */
const handler = {
  get(_target, prop) {
    if (prop === "__esModule") return true;
    // El Proxy NO debe parecer un thenable: si `then` devolviera el proxy
    // (callable), `await <valor-proxy>` invocaría then(resolve) y no resolvería
    // nunca → cuelgue infinito en vez de un fallo legible.
    if (prop === "then" || prop === "catch" || prop === "finally") return undefined;
    return proxy;
  },
  apply() {
    return proxy;
  },
  construct() {
    return proxy;
  }
};
const proxy = new Proxy(function mcpSdkStub() {}, handler);

module.exports = proxy;
