/**
 * wbotRegionContract.cjs — mide el CONTRATO de un RANGO DE LÍNEAS dentro de una
 * función, antes de extraerlo a un helper.
 *
 * Hermano de `wbotClosureFreeVars.cjs`: aquél analiza closures ya nombradas; éste
 * analiza una región arbitraria (una "fase" de una función monolítica, que es lo
 * que hay dentro de handleMessageInner).
 *
 * Reporta, con el AST sintáctico de TypeScript (sin type-checker → sin OOM):
 *   - inputs     : locales del scope de la función externa que la región LEE y que
 *                  NO declara → parámetros del helper.
 *   - outputs    : declaraciones de la región que el resto del cuerpo consume →
 *                  valor de retorno del helper.
 *   - reassigned : de los outputs, cuáles se REASIGNAN aguas abajo → si hay alguno,
 *                  el destructure no puede ser `const`.
 *   - mutates    : locales externos que la región REASIGNA → el helper tendría que
 *                  devolverlos (o la extracción no es verbatim).
 *   - returns    : `return` que pertenecen a la función externa (no a closures
 *                  anidadas). Cada uno debe convertirse en señal.
 *   - unknown    : identificadores sin origen conocido → scope no contemplado.
 *
 * Uso:
 *   node tests/harness/wbotRegionContract.cjs <archivo> <fnExterna> <lineaIni> <lineaFin>
 *
 * Las líneas son 1-based e INCLUSIVAS, como las muestra un editor.
 *
 * Gate post-extracción: correrlo sobre el rango del helper ya extraído debe dar
 * `unknown: []` y `mutates: []`.
 */
const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const FILE =
  process.argv[2] ||
  path.join(__dirname, "../../services/WbotServices/wbotMessageListener.ts");
const OUTER_FN = process.argv[3] || "handleMessageInner";
const LINE_START = Number(process.argv[4]);
const LINE_END = Number(process.argv[5]);

if (!Number.isFinite(LINE_START) || !Number.isFinite(LINE_END)) {
  console.error(
    "Uso: node tests/harness/wbotRegionContract.cjs <archivo> <fnExterna> <lineaIni> <lineaFin>"
  );
  process.exit(1);
}

const src = fs.readFileSync(FILE, "utf8");
const sf = ts.createSourceFile(FILE, src, ts.ScriptTarget.Latest, true);

const TYPE_REFS = new Set(["Express", "File", "Multer", "Buffer", "NodeJS"]);
const JS_GLOBALS = new Set([
  "console","Object","Array","JSON","Math","Date","Promise","Number","String",
  "Boolean","Set","Map","Symbol","Error","RegExp","parseInt","parseFloat",
  "isNaN","isFinite","undefined","null","true","false","NaN","Infinity","Buffer",
  "process","require","module","exports","setTimeout","setInterval","clearTimeout",
  "clearInterval","globalThis","this","arguments","void","typeof","new","await",
  "Uint8Array","BigInt","encodeURIComponent","decodeURIComponent"
]);

const lineOf = pos => sf.getLineAndCharacterOfPosition(pos).line + 1;
const inRegion = node => {
  const l = lineOf(node.getStart(sf));
  return l >= LINE_START && l <= LINE_END;
};

function collectBinding(name, set) {
  if (!name) return;
  if (ts.isIdentifier(name)) set.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
    name.elements.forEach(el => el.name && collectBinding(el.name, set));
}

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

const isFnNode = n =>
  ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
  ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);

/**
 * Declaraciones cuyo scope de función más cercano es `fnNode` (no baja a anidadas).
 * Devuelve nombre -> [líneas de declaración]. Una entrada con >1 línea significa
 * que el nombre se declara en bloques hermanos (p.ej. dos `catch (e)`): para ese
 * nombre el análisis por-nombre es AMBIGUO y se reporta aparte.
 *
 * Las variables de `catch (e)` se EXCLUYEN: son de scope de bloque, nunca de
 * función, así que nunca son input ni output de una región.
 */
function ownScopeDecls(fnNode) {
  const names = new Map(); // nombre -> [líneas]
  const add = (name, line) => {
    const s = new Set();
    collectBinding(name, s);
    s.forEach(n => names.set(n, [...(names.get(n) || []), line]));
  };
  fnNode.parameters.forEach(p => add(p.name, lineOf(p.getStart(sf))));
  (function w(n) {
    if (isFnNode(n) && n !== fnNode) return;
    if (ts.isCatchClause(n)) { ts.forEachChild(n.block, w); return; } // salta la binding del catch
    if (ts.isVariableDeclaration(n)) add(n.name, lineOf(n.getStart(sf)));
    if (ts.isFunctionDeclaration(n) && n.name) add(n.name, lineOf(n.getStart(sf)));
    ts.forEachChild(n, w);
  })(fnNode.body);
  return names;
}

/** Identificadores en posición de expresión (no propiedades, no claves, no declaraciones). */
function usedNames(node, filterFn) {
  const u = new Set();
  (function w(n) {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isProp = p && ts.isPropertyAccessExpression(p) && p.name === n;
      const isKey = p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === n;
      const isDecl = p && (ts.isVariableDeclaration(p) || ts.isParameter(p)) && p.name === n;
      const isBindEl = p && ts.isBindingElement(p) && p.name === n;
      const isShorthand = p && ts.isShorthandPropertyAssignment(p) && p.name === n;
      if (!isProp && !isKey && !isDecl && !isBindEl && (!filterFn || filterFn(n))) {
        // shorthand ({ x }) SÍ es un uso del identificador
        if (!isShorthand || true) u.add(n.text);
      }
    }
    ts.forEachChild(n, w);
  })(node);
  return u;
}

/** Todas las bindings declaradas en cualquier scope anidado dentro del nodo. */
function allDeclsIn(node, pred) {
  const names = new Set();
  (function w(n) {
    if (!pred || pred(n)) {
      if (ts.isParameter(n)) collectBinding(n.name, names);
      if (ts.isVariableDeclaration(n)) collectBinding(n.name, names);
      if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && n.name)
        names.add(n.name.text);
      if (ts.isBindingElement(n) && n.name) collectBinding(n.name, names);
      if (ts.isCatchClause(n) && n.variableDeclaration)
        collectBinding(n.variableDeclaration.name, names);
    }
    ts.forEachChild(n, w);
  })(node);
  return names;
}

/** Identificadores que son destino de una asignación (=, +=, ++, --). */
function assignedNames(node, pred) {
  const names = new Set();
  (function w(n) {
    if (!pred || pred(n)) {
      if (ts.isBinaryExpression(n) &&
          n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        if (ts.isIdentifier(n.left)) names.add(n.left.text);
      }
      if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
          (n.operator === ts.SyntaxKind.PlusPlusToken ||
           n.operator === ts.SyntaxKind.MinusMinusToken) &&
          ts.isIdentifier(n.operand)) names.add(n.operand.text);
    }
    ts.forEachChild(n, w);
  })(node);
  return names;
}

const MOD = moduleNames();

let outer = null;
(function w(n) {
  if (ts.isFunctionDeclaration(n) && n.name && n.name.text === OUTER_FN) outer = n;
  if (ts.isVariableDeclaration(n) && n.name && ts.isIdentifier(n.name) &&
      n.name.text === OUTER_FN && n.initializer && isFnNode(n.initializer)) {
    outer = n.initializer;
    outer.parameters = n.initializer.parameters;
  }
  ts.forEachChild(n, w);
})(sf);
if (!outer) { console.error(`No se encontró ${OUTER_FN}`); process.exit(1); }

const OWN = ownScopeDecls(outer); // Map nombre -> [líneas]
const ownDeclaredInRegion = new Set(
  [...OWN.entries()]
    .filter(([, lines]) => lines.some(l => l >= LINE_START && l <= LINE_END))
    .map(([n]) => n)
);
// Nombres declarados en más de un sitio del cuerpo (bloques hermanos): para ellos
// el análisis por-nombre no distingue declaraciones → hay que mirarlos a mano.
const ambiguous = [...OWN.entries()]
  .filter(([, lines]) => lines.length > 1)
  .filter(([n]) => ownDeclaredInRegion.has(n))
  .map(([n, lines]) => `${n} (líneas ${lines.join(", ")})`);

// Nodos de la región / del resto del cuerpo
const regionNodes = [];
const outsideNodes = [];
outer.body.statements.forEach(st => {
  const a = lineOf(st.getStart(sf));
  const b = lineOf(st.getEnd());
  if (a >= LINE_START && b <= LINE_END) regionNodes.push(st);
  else if (b < LINE_START || a > LINE_END) outsideNodes.push(st);
  else {
    // statement que cruza la frontera: descender un nivel (try/if que envuelve todo el cuerpo)
    (function descend(node) {
      ts.forEachChild(node, c => {
        const ca = lineOf(c.getStart(sf));
        const cb = lineOf(c.getEnd());
        if (ca >= LINE_START && cb <= LINE_END) regionNodes.push(c);
        else if (cb < LINE_START || ca > LINE_END) outsideNodes.push(c);
        else descend(c);
      });
    })(st);
  }
});

if (!regionNodes.length) {
  console.error(`La región ${LINE_START}-${LINE_END} no contiene sentencias completas de ${OUTER_FN}`);
  process.exit(1);
}

const usedInRegion = new Set();
const declsInRegionAnyScope = new Set();
const assignedInRegion = new Set();
regionNodes.forEach(n => {
  usedNames(n).forEach(v => usedInRegion.add(v));
  allDeclsIn(n).forEach(v => declsInRegionAnyScope.add(v));
  assignedNames(n).forEach(v => assignedInRegion.add(v));
});

const usedOutside = new Set();
const assignedOutside = new Set();
outsideNodes.forEach(n => {
  usedNames(n).forEach(v => usedOutside.add(v));
  assignedNames(n).forEach(v => assignedOutside.add(v));
});

const inputs = [...usedInRegion]
  .filter(v => OWN.has(v) && !ownDeclaredInRegion.has(v))
  .sort();

const outputs = [...ownDeclaredInRegion].filter(v => usedOutside.has(v)).sort();
const reassignedDownstream = outputs.filter(v => assignedOutside.has(v));
const mutates = [...assignedInRegion]
  .filter(v => OWN.has(v) && !ownDeclaredInRegion.has(v))
  .sort();
const unknown = [...usedInRegion]
  .filter(v => !OWN.has(v) && !MOD.has(v) && !JS_GLOBALS.has(v) &&
               !declsInRegionAnyScope.has(v) && !TYPE_REFS.has(v))
  .sort();

// `return` que pertenecen a la función externa (no a closures anidadas)
const returns = [];
regionNodes.forEach(root => {
  (function w(n) {
    if (isFnNode(n)) return; // los return de una closure anidada no son de la fn externa
    if (ts.isReturnStatement(n)) {
      returns.push({ line: lineOf(n.getStart(sf)), hasValue: Boolean(n.expression) });
    }
    ts.forEachChild(n, w);
  })(root);
});

const regionLines = LINE_END - LINE_START + 1;
console.log(`Archivo: ${path.relative(process.cwd(), FILE)}`);
console.log(`Función: ${OUTER_FN}  ·  región ${LINE_START}-${LINE_END} (${regionLines} líneas, ${regionNodes.length} sentencias)`);
console.log(`\ninputs (${inputs.length}) — parámetros del helper:\n  [${inputs.join(", ")}]`);
console.log(`\noutputs (${outputs.length}) — lo que el resto del cuerpo consume:\n  [${outputs.join(", ")}]`);
console.log(`  declarados en la región y NO consumidos fuera: [${[...ownDeclaredInRegion].filter(v => !usedOutside.has(v)).sort().join(", ")}]`);
console.log(`  reasignados aguas abajo (⇒ no pueden ser const): [${reassignedDownstream.join(", ")}]`);
console.log(`\nmutates (${mutates.length}) — locales externos que la región REASIGNA:\n  [${mutates.join(", ")}]`);
console.log(`\nreturns propios de ${OUTER_FN} en la región: ${returns.length}`);
returns.forEach(r => console.log(`  línea ${r.line}${r.hasValue ? " (con valor)" : " (return; → señal)"}`));
if (ambiguous.length) {
  console.log(`\n⚠ AMBIGUOS (${ambiguous.length}) — mismo nombre declarado en bloques hermanos, revisar a mano:`);
  ambiguous.forEach(a => console.log(`  ${a}`));
}
if (unknown.length) {
  console.log(`\n⚠ UNKNOWN (${unknown.length}) — sin origen conocido: [${unknown.join(", ")}]`);
} else {
  console.log(`\nunknown: [] (todo identificador cae en input/módulo/global/local de la región)`);
}

process.exit(unknown.length ? 2 : 0);
