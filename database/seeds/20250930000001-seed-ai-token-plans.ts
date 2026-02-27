import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    return queryInterface.sequelize.transaction(async (t) => {
      // Verificar si ya existen planes
      const existingPlans = await queryInterface.sequelize.query(
        'SELECT id FROM "AiTokenPlans" LIMIT 1',
        { transaction: t }
      );

      if (existingPlans[0].length > 0) {
        console.log("⚠️ Planes de tokens ya existen, saltando seed...");
        return;
      }

      // Insertar planes iniciales
      await queryInterface.bulkInsert("AiTokenPlans", [
        {
          code: "starter_150k",
          name: "Starter 150k",
          priceUsd: 9.99,
          tokens: 150000,
          isRecurring: false,
          isActive: true,
          isArchived: false,
          description: "Plan inicial perfecto para comenzar con IA en tu negocio",
          features: JSON.stringify({
            tokens: 150000,
            validityDays: null,
            support: "email",
            features: [
              "150,000 tokens de IA",
              "Uso en todos los módulos",
              "Soporte por email",
              "Sin caducidad"
            ]
          }),
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          code: "pro_350k",
          name: "Pro 350k",
          priceUsd: 19.99,
          tokens: 350000,
          isRecurring: false,
          isActive: true,
          isArchived: false,
          description: "Plan profesional con más tokens para equipos activos",
          features: JSON.stringify({
            tokens: 350000,
            validityDays: null,
            support: "priority",
            features: [
              "350,000 tokens de IA",
              "Uso en todos los módulos",
              "Soporte prioritario",
              "Sin caducidad",
              "Ahorro del 30%"
            ]
          }),
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          code: "business_750k",
          name: "Business 750k",
          priceUsd: 39.99,
          tokens: 750000,
          isRecurring: false,
          isActive: true,
          isArchived: false,
          description: "Plan empresarial para alto volumen de conversaciones",
          features: JSON.stringify({
            tokens: 750000,
            validityDays: null,
            support: "priority",
            features: [
              "750,000 tokens de IA",
              "Uso en todos los módulos",
              "Soporte prioritario 24/7",
              "Sin caducidad",
              "Ahorro del 40%",
              "Reportes avanzados"
            ]
          }),
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          code: "enterprise_2m",
          name: "Enterprise 2M",
          priceUsd: 99.99,
          tokens: 2000000,
          isRecurring: false,
          isActive: true,
          isArchived: false,
          description: "Plan enterprise para grandes empresas",
          features: JSON.stringify({
            tokens: 2000000,
            validityDays: null,
            support: "dedicated",
            features: [
              "2,000,000 tokens de IA",
              "Uso ilimitado en módulos",
              "Soporte dedicado 24/7",
              "Sin caducidad",
              "Ahorro del 50%",
              "Reportes personalizados",
              "Account manager dedicado"
            ]
          }),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ], { transaction: t });

      console.log("✅ Planes de tokens iniciales creados exitosamente");
    });
  },

  down: async (queryInterface: QueryInterface) => {
    return queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.bulkDelete("AiTokenPlans", {}, { transaction: t });
    });
  }
};