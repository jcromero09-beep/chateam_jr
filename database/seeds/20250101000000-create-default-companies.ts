import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.bulkInsert('Companies', [
      {
        id: 1,
        name: 'Chateam Demo Company',
        email: 'demo@chateam.com',
        document: '1234567890',
        paymentMethod: 'credit_card',
        phone: '+593987654321',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.bulkDelete('Companies', { id: 1 }, {});
  }
};