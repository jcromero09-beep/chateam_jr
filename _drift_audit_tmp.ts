import sequelize from "./database";
async function main() {
  await sequelize.authenticate();
  // UNA sola consulta: todas las columnas de todas las tablas
  const [rows]: any = await sequelize.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`
  );
  const byTable: Record<string, Set<string>> = {};
  for (const r of rows) { (byTable[r.table_name] ||= new Set()).add(r.column_name); }

  const models = sequelize.models;
  const names = Object.keys(models).sort();
  let conFalta = 0, totalCols = 0, noTabla = 0;
  const rep: string[] = [];
  for (const name of names) {
    const model: any = models[name];
    const t = model.getTableName();
    const tn = typeof t === "string" ? t : t.tableName;
    const expected = Object.values(model.rawAttributes as Record<string, any>).map((a: any) => a.field || a.fieldName).filter(Boolean);
    const actual = byTable[tn];
    if (!actual) { noTabla++; rep.push(`  ❌ TABLA_NO_EXISTE ${name} (${tn})`); continue; }
    const faltan = expected.filter((c: string) => !actual.has(c));
    if (faltan.length) { conFalta++; totalCols += faltan.length; rep.push(`  🔴 ${name} (${tn}) FALTAN: ${faltan.join(", ")}`); }
  }
  console.log(`\n=== DERIVA modelo->BD ===`);
  console.log(`Modelos: ${names.length} | con faltantes: ${conFalta} (${totalCols} cols) | tablas inexistentes: ${noTabla}\n`);
  rep.forEach(r=>console.log(r));
  if(!rep.length) console.log("  OK sin deriva");
  await sequelize.close();
}
main().catch(e=>{console.error("ERROR:",e.message);process.exit(1);});
