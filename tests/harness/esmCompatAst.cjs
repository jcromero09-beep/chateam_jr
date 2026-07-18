/**
 * AST transformer (ts-jest, SOLO test) que neutraliza los dos idiomas ESM que rompen la
 * importación bajo el vm CJS de jest, operando sobre el AST — NO toca strings ni comentarios
 * (a diferencia de un replace de texto, que corrompía cadenas con el literal):
 *
 *   - `import.meta`                          → ({ url: require("url").pathToFileURL(__filename).href })
 *   - `const require = createRequire(...)`   → renombra el binding a __esmRequireUnused
 *                                              (los call sites usan el require nativo de CJS)
 *
 * Producción (tsx/ESM) queda intacta: esto solo corre dentro de jest. Reversible: quitar la
 * entrada astTransformers de la config del harness.
 */
const ts = require("typescript");

// ({ url: require("url").pathToFileURL(__filename).href })
function importMetaReplacement() {
  const requireUrl = ts.factory.createCallExpression(
    ts.factory.createIdentifier("require"),
    undefined,
    [ts.factory.createStringLiteral("url")]
  );
  const pathToFileURL = ts.factory.createCallExpression(
    ts.factory.createPropertyAccessExpression(requireUrl, "pathToFileURL"),
    undefined,
    [ts.factory.createIdentifier("__filename")]
  );
  const href = ts.factory.createPropertyAccessExpression(pathToFileURL, "href");
  const obj = ts.factory.createObjectLiteralExpression(
    [ts.factory.createPropertyAssignment("url", href)],
    false
  );
  return ts.factory.createParenthesizedExpression(obj);
}

function factory(_compilerInstance, _options) {
  return (context) => {
    const visitor = (node) => {
      // import.meta (MetaProperty con keyword `import`)
      if (
        node.kind === ts.SyntaxKind.MetaProperty &&
        node.keywordToken === ts.SyntaxKind.ImportKeyword
      ) {
        return importMetaReplacement();
      }
      // const/let/var require = createRequire(...)  → renombrar el binding
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "require" &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === "createRequire"
      ) {
        return ts.factory.updateVariableDeclaration(
          node,
          ts.factory.createIdentifier("__esmRequireUnused"),
          node.exclamationToken,
          node.type,
          ts.visitNode(node.initializer, visitor)
        );
      }
      return ts.visitEachChild(node, visitor, context);
    };
    return (sourceFile) => ts.visitNode(sourceFile, visitor);
  };
}

module.exports = { name: "esm-compat-ast", version: 1, factory };
