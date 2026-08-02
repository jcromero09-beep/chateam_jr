/**
 * El cordón que impide escribir en la base de producción desde desarrollo.
 *
 * Se fija aquí porque un guard sin test se borra el día que estorba, y este en
 * concreto solo molesta cuando estás a punto de hacer algo que ya salió mal una vez:
 * en julio de 2026 un guardado lanzado desde el repo de desarrollo cifró los tokens
 * de la API —producción no sabía descifrarlos— y dejó fuera a todos los clientes con
 * integraciones durante seis días.
 *
 * Lo que se comprueba no es solo que bloquee. Es sobre todo que NO bloquee los tres
 * caminos normales: si corta la app, los scripts de operación o los tests, alguien lo
 * quitará en diez minutos y con razón.
 */
import { assertNotProductionDb } from "../../helpers/prodDbGuard";

const entornoOriginal = { ...process.env };

afterEach(() => {
  process.env = { ...entornoOriginal };
});

/** El guard lee el entorno al llamarse, así que basta con prepararlo antes. */
function conEntorno(vars: Record<string, string | undefined>) {
  Object.entries(vars).forEach(([k, v]) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });
}

describe("prodDbGuard — bloquea", () => {
  it("un proceso sin NODE_ENV que apunta a la base de producción", () => {
    conEntorno({ NODE_ENV: undefined, ALLOW_PROD_DB: undefined });
    expect(() => assertNotProductionDb("chateamjr")).toThrow(/BLOQUEADO/);
  });

  it("y el mensaje dice cómo seguir, no solo que no", () => {
    conEntorno({ NODE_ENV: "development", ALLOW_PROD_DB: undefined });
    // Un error que solo dice "no" obliga a leer el código para desbloquearse, y ahí
    // es donde la gente decide borrar el guard en vez de entenderlo.
    expect(() => assertNotProductionDb("chateamjr")).toThrow(/withPm2Env/);
    expect(() => assertNotProductionDb("chateamjr")).toThrow(/ALLOW_PROD_DB=1/);
  });
});

describe("prodDbGuard — deja pasar", () => {
  it("la app en producción (NODE_ENV=production), que es quien debe estar ahí", () => {
    conEntorno({ NODE_ENV: "production", ALLOW_PROD_DB: undefined });
    expect(() => assertNotProductionDb("chateamjr")).not.toThrow();
  });

  it("los tests, que van a otra base", () => {
    conEntorno({ NODE_ENV: "test", ALLOW_PROD_DB: undefined });
    expect(() => assertNotProductionDb("chateam_test")).not.toThrow();
  });

  it("cualquier base que no sea la de producción", () => {
    conEntorno({ NODE_ENV: undefined, ALLOW_PROD_DB: undefined });
    expect(() => assertNotProductionDb("chateam_local")).not.toThrow();
    expect(() => assertNotProductionDb(undefined)).not.toThrow();
    expect(() => assertNotProductionDb("")).not.toThrow();
  });

  it("la escotilla explícita ALLOW_PROD_DB=1", () => {
    conEntorno({ NODE_ENV: undefined, ALLOW_PROD_DB: "1" });
    expect(() => assertNotProductionDb("chateamjr")).not.toThrow();
  });
});

describe("prodDbGuard — configuración", () => {
  it("respeta PROD_DB_NAME si el despliegue cambia de base", () => {
    // El módulo lee PROD_DB_NAME al cargarse, así que hay que reimportarlo.
    jest.resetModules();
    process.env.PROD_DB_NAME = "otra_prod";
    process.env.NODE_ENV = "";
    delete process.env.ALLOW_PROD_DB;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { assertNotProductionDb: guard } = require("../../helpers/prodDbGuard");

    expect(() => guard("otra_prod")).toThrow(/BLOQUEADO/);
    // Y la de antes deja de estar protegida, que es justo lo que se pidió.
    expect(() => guard("chateamjr")).not.toThrow();
  });
});
