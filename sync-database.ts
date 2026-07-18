// Script para sincronizar la base de datos con los modelos de Sequelize
import sequelize from "./database";
import { QueryTypes } from "sequelize";

async function syncDatabase() {
  try {
    console.log("🔄 Iniciando sincronización de base de datos...");
    console.log(`📊 Base de datos: ${process.env.DB_NAME}`);
    console.log(`🏠 Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`👤 Usuario: ${process.env.DB_USER}`);

    // Verificar conexión
    await sequelize.authenticate();
    console.log("✅ Conexión a la base de datos establecida correctamente.");

    // Sincronizar modelos (crear tablas)
    console.log("\n📝 Sincronizando modelos...");
    console.log("✨ Creando/actualizando tablas (alter: true)...");
    // Usar alter: true para crear tablas nuevas y agregar columnas faltantes
    // sin perder datos existentes
    await sequelize.sync({ alter: true });

    console.log("\n✅ ¡Sincronización completada exitosamente!");
    console.log("\n📋 Tablas creadas:");

    // Listar tablas creadas
    const tables = await sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      { type: QueryTypes.SELECT }
    );

    tables.forEach((table: any, index: number) => {
      console.log(`   ${index + 1}. ${table.tablename}`);
    });

    console.log(`\n📊 Total de tablas: ${tables.length}`);

    await sequelize.close();
    console.log("\n🔒 Conexión cerrada.");
    process.exit(0);

  } catch (error: any) {
    console.error("\n❌ Error durante la sincronización:");
    console.error(`   ${error.message}`);

    if (error.original) {
      console.error(`\n🔍 Error original de PostgreSQL:`);
      console.error(`   ${error.original.message}`);
    }

    process.exit(1);
  }
}

console.log("=" .repeat(60));
console.log("🗄️  SINCRONIZACIÓN DE BASE DE DATOS - JR CHATEAM");
console.log("=".repeat(60));
console.log();

syncDatabase();
