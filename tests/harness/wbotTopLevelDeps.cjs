/**
 * wbotTopLevelDeps.cjs — mide el CONTRATO de un conjunto de FUNCIONES TOP-LEVEL
 * antes de moverlas a otro módulo.
 *
 * Los dos hermanos existentes miden hacia DENTRO de una función:
 *   - wbotClosureFreeVars.cjs → closures ya nombradas dentro de una función.
 *   - wbotRegionContract.cjs  → un rango de líneas dentro de una función.
 * Éste mide hacia FUERA: qué necesita del resto del módulo un grupo de funciones
 * top-level que se quiere sacar a un fichero aparte.
 *
 * Reporta:
 *   - imports    : símbolos importados que el bloque usa → se copian al módulo nuevo.
 *   - localDeps  : declaraciones top-level del MISMO fichero que el bloque usa.
 *                  Para cada una: líneas, si está exportada, y cuántos usos le
 *                  quedan FUERA del bloque. Ésta es la decisión del refactor:
 *                    · usosFuera = 0  → se mueve CON el bloque, el ciclo desaparece.
 *                    · usosFuera > 0  → o se re-importa (ciclo → lazy) o se queda.
 *   - callers    : quién llama a las funciones del bloque desde fuera de él.
 *   - unknown    : identificadores sin origen conocido → scope no contemplado.
 *
 * Uso:
 *   node tests/harness/wbotTopLevelDeps.cjs <archivo> <fn1,fn2,...>
 *
 * Análisis LÉXICO con el AST sintáctico de TypeScript (sin type-checker → sin OOM),
 * con pila de scopes real: un `const` interno que shadowea NO cuenta como dep.
 */
const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const FILE =
  process.argv[2] ||
  path.join(__dirname, "../../services/WbotServices/wbotMessageListener.ts");
const SELECTED = (process.argv[3] || "").split(",").map(s => s.trim()).filter(Boolean);

if (!SELECTED.length) {
  console.error("Uso: node wbotTopLevelDeps.cjs <archivo> <fn1,fn2,...>");
  process.exit(2);
}

const src = fs.readFileSync(FILE, "utf8");
const sf = ts.createSourceFile(FILE, src, ts.ScriptTarget.Latest, true);
const lineOf = pos => sf.getLineAndCharacterOfPosition(pos).line + 1;

// Type-refs ambient (namespaces de @types/*) usados SOLO en posición de tipo: no
// existen en runtime y no son dep de nadie. Mismo filtro que wbotClosureFreeVars.
const TYPE_REFS = new Set(["Express", "File", "Multer", "NodeJS", "Buffer", "Chai", "jest"]);
const JS_GLOBALS = new Set([
  "console","Object","Array","JSON","Math","Date","Promise","Number","String",
  "Boolean","Set","Map","WeakMap","WeakSet","Symbol","Error","TypeError","RegExp",
  "parseInt","parseFloat","isNaN","isFinite","undefined","NaN","Infinity","Buffer",
  "process","require","module","exports","setTimeout","setInterval","clearTimeout",
  "clearInterval","setImmediate","globalThis","arguments","Uint8Array","BigInt",
  "encodeURIComponent","decodeURIComponent","URL","URLSearchParams","AbortController",
  "TextEncoder","TextDecoder","structuredClone","queueMicrotask","fetch","Intl",
  "any","string","number","boolean","void","unknown","never","object","null",
  "Function","Record","Partial","Promise","Array","Awaited","Omit","Pick","Exclude"
]);

// ---------------------------------------------------------------- top-level index
const topDecls = new Map(); // nombre -> {kind, start, end, exported}
const importedNames = new Map(); // nombre -> módulo

const addTop = (name, node, kind) => {
  if (!name) return;
  const exported = !!(node.modifiers || []).find(m => m.kind === ts.SyntaxKind.ExportKeyword);
  topDecls.set(name, {
    kind,
    start: lineOf(node.getStart(sf)),
    end: lineOf(node.getEnd()),
    exported
  });
};

const bindingNames = (name, out) => {
  if (!name) return;
  if (ts.isIdentifier(name)) out.push(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    name.elements.forEach(el => {
      if (ts.isOmittedExpression(el)) return;
      bindingNames(el.name, out);
    });
  }
};

sf.statements.forEach(st => {
  if (ts.isImportDeclaration(st)) {
    const mod = st.moduleSpecifier.text;
    const cl = st.importClause;
    if (!cl) return;
    if (cl.name) importedNames.set(cl.name.text, mod);
    if (cl.namedBindings) {
      if (ts.isNamespaceImport(cl.namedBindings)) importedNames.set(cl.namedBindings.name.text, mod);
      else cl.namedBindings.elements.forEach(e => importedNames.set(e.name.text, mod));
    }
  } else if (ts.isFunctionDeclaration(st)) {
    addTop(st.name && st.name.text, st, "function");
  } else if (ts.isVariableStatement(st)) {
    st.declarationList.declarations.forEach(d => {
      const names = [];
      bindingNames(d.name, names);
      names.forEach(n => addTop(n, st, "const"));
    });
  } else if (ts.isClassDeclaration(st)) {
    addTop(st.name && st.name.text, st, "class");
  } else if (ts.isInterfaceDeclaration(st)) {
    addTop(st.name.text, st, "interface");
  } else if (ts.isTypeAliasDeclaration(st)) {
    addTop(st.name.text, st, "type");
  } else if (ts.isEnumDeclaration(st)) {
    addTop(st.name.text, st, "enum");
  }
});

const missing = SELECTED.filter(n => !topDecls.has(n));
if (missing.length) {
  console.error("No son declaraciones top-level de este fichero: " + missing.join(", "));
  process.exit(2);
}

// Rangos (líneas) del bloque seleccionado — para "usos fuera".
const ranges = SELECTED.map(n => [topDecls.get(n).start, topDecls.get(n).end]);
const insideBlock = line => ranges.some(([a, b]) => line >= a && line <= b);

// ---------------------------------------------------------------- scope walker
const isRefIdentifier = node => {
  const p = node.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if (ts.isQualifiedName(p) && p.right === node) return false;
  if (ts.isPropertyAssignment(p) && p.name === node) return false;
  if (ts.isPropertySignature(p) && p.name === node) return false;
  if (ts.isMethodSignature(p) && p.name === node) return false;
  if (ts.isMethodDeclaration(p) && p.name === node) return false;
  if (ts.isPropertyDeclaration(p) && p.name === node) return false;
  if (ts.isEnumMember(p) && p.name === node) return false;
  if (ts.isBindingElement(p) && p.propertyName === node) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
  if (ts.isParameter(p) && p.name === node) return false;
  if (ts.isVariableDeclaration(p) && p.name === node) return false;
  if (ts.isFunctionDeclaration(p) && p.name === node) return false;
  if (ts.isClassDeclaration(p) && p.name === node) return false;
  if (ts.isInterfaceDeclaration(p) && p.name === node) return false;
  if (ts.isTypeAliasDeclaration(p) && p.name === node) return false;
  if (ts.isTypeParameterDeclaration(p) && p.name === node) return false;
  if (ts.isLabeledStatement(p) && p.label === node) return false;
  if (ts.isBreakOrContinueStatement(p)) return false;
  return true;
};

const createsScope = node =>
  ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) || ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node) || ts.isBlock(node) ||
  ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) ||
  ts.isCatchClause(node) || ts.isCaseBlock(node) || ts.isClassDeclaration(node) ||
  ts.isClassExpression(node) || ts.isModuleBlock(node);

/** Declara en `scope` todo lo que el nodo `node` introduce directamente (sin bajar a scopes hijos). */
const declareIn = (node, scope) => {
  const push = n => { if (n) scope.add(n); };
  const params = fn => (fn.parameters || []).forEach(p => {
    const names = []; bindingNames(p.name, names); names.forEach(push);
  });

  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) || ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) {
    params(node);
    if (node.name && ts.isIdentifier(node.name)) push(node.name.text);
    (node.typeParameters || []).forEach(tp => push(tp.name.text));
  }
  if (ts.isCatchClause(node) && node.variableDeclaration) {
    const names = []; bindingNames(node.variableDeclaration.name, names); names.forEach(push);
  }
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    if (node.name) push(node.name.text);
    (node.typeParameters || []).forEach(tp => push(tp.name.text));
  }
  if (ts.isForStatement(node) && node.initializer && ts.isVariableDeclarationList(node.initializer)) {
    node.initializer.declarations.forEach(d => { const n = []; bindingNames(d.name, n); n.forEach(push); });
  }
  if ((ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
      ts.isVariableDeclarationList(node.initializer)) {
    node.initializer.declarations.forEach(d => { const n = []; bindingNames(d.name, n); n.forEach(push); });
  }
};

/** Registra en `scope` las declaraciones de las sentencias de un cuerpo (hoisting del scope). */
const hoistStatements = (statements, scope) => {
  statements.forEach(st => {
    if (ts.isVariableStatement(st)) {
      st.declarationList.declarations.forEach(d => {
        const n = []; bindingNames(d.name, n); n.forEach(x => scope.add(x));
      });
    } else if (ts.isFunctionDeclaration(st) && st.name) scope.add(st.name.text);
    else if (ts.isClassDeclaration(st) && st.name) scope.add(st.name.text);
    else if (ts.isInterfaceDeclaration(st)) scope.add(st.name.text);
    else if (ts.isTypeAliasDeclaration(st)) scope.add(st.name.text);
    else if (ts.isEnumDeclaration(st)) scope.add(st.name.text);
  });
};

const refs = new Map(); // nombre -> {count, lines:Set}
const noteRef = node => {
  const name = node.text;
  if (!refs.has(name)) refs.set(name, { count: 0, lines: new Set() });
  const r = refs.get(name);
  r.count++;
  if (r.lines.size < 6) r.lines.add(lineOf(node.getStart(sf)));
};

const walk = (node, scopes) => {
  let stack = scopes;
  if (createsScope(node)) {
    const scope = new Set();
    declareIn(node, scope);
    if (ts.isBlock(node) || ts.isModuleBlock(node)) hoistStatements(node.statements, scope);
    if (ts.isCaseBlock(node)) node.clauses.forEach(c => hoistStatements(c.statements, scope));
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
         ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) &&
        node.body && ts.isBlock(node.body)) {
      // el Block hijo abrirá su propio scope; los params ya están aquí.
    }
    stack = scopes.concat([scope]);
  }
  if (ts.isIdentifier(node) && isRefIdentifier(node)) {
    const name = node.text;
    const bound = stack.some(s => s.has(name));
    if (!bound) noteRef(node);
  }
  node.forEachChild(c => walk(c, stack));
};

SELECTED.forEach(name => {
  const d = topDecls.get(name);
  const stmt = sf.statements.find(st =>
    lineOf(st.getStart(sf)) === d.start && lineOf(st.getEnd()) === d.end);
  if (!stmt) throw new Error("no localizo la sentencia de " + name);
  walk(stmt, [new Set()]);
});

// ---------------------------------------------------------------- clasificación
const usedImports = new Map();
const localDeps = new Map();
const unknown = new Map();
const selfRefs = new Set(SELECTED);

for (const [name, info] of refs) {
  if (selfRefs.has(name)) continue;
  if (JS_GLOBALS.has(name)) continue;
  if (importedNames.has(name)) {
    const mod = importedNames.get(name);
    if (!usedImports.has(mod)) usedImports.set(mod, []);
    usedImports.get(mod).push(name);
  } else if (topDecls.has(name)) {
    localDeps.set(name, info);
  } else {
    unknown.set(name, info);
  }
}

// usos fuera del bloque, por dep local
const countOutside = name => {
  let n = 0;
  const rx = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
  src.split("\n").forEach((line, i) => {
    const ln = i + 1;
    if (insideBlock(ln)) return;
    const d = topDecls.get(name);
    if (d && ln >= d.start && ln <= d.end) return; // su propia declaración
    if (rx.test(line)) n++;
  });
  return n;
};

// callers de las funciones seleccionadas, fuera del bloque
const callers = [];
src.split("\n").forEach((line, i) => {
  const ln = i + 1;
  if (insideBlock(ln)) return;
  SELECTED.forEach(fn => {
    if (new RegExp("\\b" + fn + "\\s*\\(").test(line)) callers.push(`${ln}: ${line.trim().slice(0, 90)}`);
  });
});

// ---------------------------------------------------------------- salida
const totalLines = ranges.reduce((a, [x, y]) => a + (y - x + 1), 0);
console.log(`\n=== ${path.basename(FILE)} · bloque {${SELECTED.join(", ")}} · ${totalLines} L ===`);
ranges.forEach(([a, b], i) => console.log(`  ${SELECTED[i].padEnd(28)} L${a}-${b} (${b - a + 1})`));

console.log(`\n--- imports que el bloque necesita (${[...usedImports.values()].flat().length} símbolos / ${usedImports.size} módulos) ---`);
[...usedImports.entries()].sort().forEach(([mod, names]) =>
  console.log(`  ${mod}\n      ${[...new Set(names)].sort().join(", ")}`));

console.log(`\n--- deps locales del mismo fichero (${localDeps.size}) ---`);
if (!localDeps.size) console.log("  (ninguna — el bloque es autónomo)");
[...localDeps.entries()]
  .map(([n, i]) => ({ n, i, d: topDecls.get(n), out: countOutside(n) }))
  .sort((a, b) => a.out - b.out || a.n.localeCompare(b.n))
  .forEach(({ n, i, d, out }) => {
    const veredicto = out === 0 ? "MUEVE CON EL BLOQUE (0 usos fuera)" : `${out} usos fuera → import/ciclo`;
    console.log(`  ${n.padEnd(30)} ${String(d.end - d.start + 1).padStart(4)} L  L${d.start}-${d.end}` +
      `  ${d.exported ? "exportada" : "privada  "}  ${String(i.count).padStart(3)} usos dentro  → ${veredicto}`);
  });

console.log(`\n--- callers fuera del bloque (${callers.length}) ---`);
callers.forEach(c => console.log("  " + c));

console.log(`\n--- unknown (${unknown.size}) ---`);
if (!unknown.size) console.log("  []");
[...unknown.entries()].forEach(([n, i]) =>
  console.log(`  ${n.padEnd(30)} ${i.count} usos, líneas ${[...i.lines].join(",")}`));
console.log("");
