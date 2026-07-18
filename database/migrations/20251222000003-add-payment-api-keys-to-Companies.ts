import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
    up: (queryInterface: QueryInterface) => {
        return Promise.all([
            queryInterface.addColumn("Companies", "paypalClientId", {
                type: DataTypes.TEXT,
                allowNull: true,
                defaultValue: null
            }),
            queryInterface.addColumn("Companies", "paypalSecretKey", {
                type: DataTypes.TEXT,
                allowNull: true,
                defaultValue: null
            }),
            queryInterface.addColumn("Companies", "stripePublicKey", {
                type: DataTypes.TEXT,
                allowNull: true,
                defaultValue: null
            }),
            queryInterface.addColumn("Companies", "stripeSecretKey", {
                type: DataTypes.TEXT,
                allowNull: true,
                defaultValue: null
            })
        ]);
    },

    down: (queryInterface: QueryInterface) => {
        return Promise.all([
            queryInterface.removeColumn("Companies", "stripeSecretKey"),
            queryInterface.removeColumn("Companies", "stripePublicKey"),
            queryInterface.removeColumn("Companies", "paypalSecretKey"),
            queryInterface.removeColumn("Companies", "paypalClientId")
        ]);
    }
};
