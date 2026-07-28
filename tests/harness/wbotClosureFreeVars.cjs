/**
 * wbotClosureFreeVars.cjs — Herramienta de caracterización para el refactor de
 * verifyQueue (Ola 4). Análisis LÉXICO de variables libres (AST sintáctico de
 * TypeScript, sin type-checker → sin OOM). Para cada closure (botText/botList/
 * botButton) calcula, de forma robusta y CONSERVADORA:
 *   - ctx: locales del scope de verifyQueue que la closure usa → deben pasarse.
 *   - unknown: identificadores usados que NO son módulo, ni globals JS, ni locales
 *     de verifyQueue, ni declarados en la closure → SEÑAL de scope no contemplado
 *     (posible bug si se extrae sin incluirlos).
 *
 * Uso doble:
 *   1) ANTES de extraer: obtener el ctx exacto por closure.
 *   2) DESPUÉS de extraer (verificación): correr sobre la función ya extraída;
 *      su ctx debe ser subconjunto del ctx destructurado y `unknown` vacío.
 *
 * Ejecutar: node tests/harness/wbotClosureFreeVars.cjs
 */
const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const FILE =
  process.argv[2] ||
  path.join(__dirname, "../../services/WbotServices/wbotMessageListener.ts");
const OUTER_FN = process.argv[3] || "verifyQueue";
const CLOSURES = (process.argv[4] || "botText,botList,botButton").split(",");

const src = fs.readFileSync(FILE, "utf8");
const sf = ts.createSourceFile(FILE, src, ts.ScriptTarget.Latest, true);

// Type-refs ambient (namespaces de @types/*) usados solo en posición de tipo → se borran en runtime.
const TYPE_REFS = new Set(["Express","File","Multer","Buffer"]);
const JS_GLOBALS = new Set([
  "console","Object","Array","JSON","Math","Date","Promise","Number","String",
  "Boolean","Set","Map","Symbol","Error","RegExp","parseInt","parseFloat",
  "isNaN","isFinite","undefined","null","true","false","NaN","Infinity","Buffer",
  "process","require","module","exports","setTimeout","setInterval","clearTimeout",
  "clearInterval","globalThis","this","arguments","void","typeof","new","await",
  "Uint8Array","BigInt","encodeURIComponent","decodeURIComponent"
]);

// 1) nombres a nivel de módulo (imports + decls top-level del archivo)
function moduleNames() {
  const names = new Set();
  sf.statements.forEach(st => {
    if (ts.isImportDeclaration(st) && st.importClause) {
      const ic = st.importClause;
      if (ic.name) names.add(ic.name.text);
      if (ic.namedBindings) {
        if (ts.isNamespaceImport(ic.namedBindings)) names.add(ic.namedBindings.name.text);
        else ic.namedBindings.elements.forEach(e => names.add(e.name.text));
      }
    }
    if (ts.isVariableStatement(st))
      st.declarationList.declarations.forEach(d => collectBinding(d.name, names));
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name)
      names.add(st.name.text);
    if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) names.add(st.name.text);
  });
  return names;
}

function findVarInit(node, name) {
  let found = null;
  (function w(n) {
    if (ts.isVariableDeclaration(n) && n.name && ts.isIdentifier(n.name) &&
        n.name.text === name && n.initializer) found = n.initializer;
    ts.forEachChild(n, w);
  })(node);
  return found;
}

// 2) locales propios del scope de la función externa (params + var/const/fn cuyo
//    ancestro función más cercano es la propia función externa)
function ownScopeNames(fnNode) {
  const names = new Set();
  const body = fnNode.body;
  fnNode.parameters.forEach(p => collectBinding(p.name, names));
  (function w(n, depth) {
    // no descender a funciones anidadas para las DECLARACIONES
    const isFn = ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
                 ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);
    if (isFn && n !== fnNode) return; // corta: sus decls son de otro scope
    if (ts.isVariableDeclaration(n)) collectBinding(n.name, names);
    if (ts.isFunctionDeclaration(n) && n.name) names.add(n.name.text);
    ts.forEachChild(n, c => w(c, depth));
  })(body, 0);
  return names;
}

function collectBinding(name, set) {
  if (!name) return;
  if (ts.isIdentifier(name)) set.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
    name.elements.forEach(el => el.name && collectBinding(el.name, set));
}

// identificadores usados (posición de expresión) en un nodo
function usedNames(node) {
  const u = new Set();
  (function w(n) {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isProp = p && ts.isPropertyAccessExpression(p) && p.name === n;
      const isKey = p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === n;
      const isDecl = p && (ts.isVariableDeclaration(p) || ts.isParameter(p)) && p.name === n;
      const isBindEl = p && ts.isBindingElement(p) && p.name === n;
      if (!isProp && !isKey && !isDecl && !isBindEl) u.add(n.text);
    }
    ts.forEachChild(n, w);
  })(node);
  return u;
}

// nombres declarados en el TOP-scope de la closure (params + var/const/fn no anidados)
function closureTopDecls(clos) {
  const names = new Set();
  if (clos.parameters) clos.parameters.forEach(p => collectBinding(p.name, names));
  return ownScopeNames(clos); // reutiliza: params + decls propias (no anidadas)
}

// TODAS las bindings declaradas en cualquier scope dentro de la closure (para unknown)
function closureAllDecls(clos) {
  const names = new Set();
  (function w(n) {
    if (ts.isParameter(n)) collectBinding(n.name, names);
    if (ts.isVariableDeclaration(n)) collectBinding(n.name, names);
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && n.name) names.add(n.name.text);
    if (ts.isBindingElement(n) && n.name) collectBinding(n.name, names);
    ts.forEachChild(n, w);
  })(clos);
  return names;
}

const MOD = moduleNames();
const vq = findVarInit(sf, OUTER_FN) ||
  (function () { let f = null; (function w(n){ if((ts.isFunctionDeclaration(n))&&n.name&&n.name.text===OUTER_FN) f=n; ts.forEachChild(n,w);})(sf); return f; })();
if (!vq) { console.error(`No se encontró ${OUTER_FN}`); process.exit(1); }
const OWN = ownScopeNames(vq);

console.log(`Función externa: ${OUTER_FN} — ${OWN.size} locales de scope propio`);
let anyUnknown = false;
for (const cname of CLOSURES) {
  const clos = findVarInit(vq, cname);
  if (!clos) { console.log(`\n${cname}: NO ENCONTRADA`); continue; }
  const used = usedNames(clos);
  const closDecls = closureTopDecls(clos);
  const ctx = [...used].filter(v => OWN.has(v) && !closDecls.has(v)).sort();
  const allDecls = closureAllDecls(clos);
  const unknown = [...used].filter(
    v => !OWN.has(v) && !MOD.has(v) && !JS_GLOBALS.has(v) && !allDecls.has(v) && !TYPE_REFS.has(v)
  ).sort();
  console.log(`\n=== ${cname} ===`);
  console.log(`  ctx (${ctx.length}): [${ctx.join(", ")}]`);
  if (unknown.length) {
    anyUnknown = true;
    console.log(`  ⚠ UNKNOWN (revisar — no módulo/global/local/ctx): [${unknown.join(", ")}]`);
  } else {
    console.log(`  unknown: [] (OK, todo identificador cae en ctx/módulo/global/local)`);
  }
}
process.exit(anyUnknown ? 2 : 0);
