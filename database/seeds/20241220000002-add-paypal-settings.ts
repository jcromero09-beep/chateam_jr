import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const timestamp = new Date();

    await queryInterface.bulkInsert("Settings", [
      {
        key: "paypalmode",
        value: "sandbox",
        companyId: 1,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        key: "paypalclientid",
        value: "",
        companyId: 1,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        key: "paypalsecret",
        value: "",
        companyId: 1,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.bulkDelete("Settings", {
      key: ["paypalmode", "paypalclientid", "paypalsecret"]
    });
  }
};
