import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
    up: (queryInterface: QueryInterface) => {
        return Promise.all([
            queryInterface.addColumn("Plans", "stripeProductId", {
                type: DataTypes.TEXT,
                allowNull: true,
                defaultValue: null
            }),
            queryInterface.addColumn("Plans", "paypalProductId", {
                type: DataTypes.TEXT,
                allowNull: true,
                defaultValue: null
            }),
            queryInterface.addColumn("Plans", "paypalPlanId", {
                type: DataTypes.TEXT,
                allowNull: true,
                defaultValue: null
            })
        ]);
    },

    down: (queryInterface: QueryInterface) => {
        return Promise.all([
            queryInterface.removeColumn("Plans", "paypalPlanId"),
            queryInterface.removeColumn("Plans", "paypalProductId"),
            queryInterface.removeColumn("Plans", "stripeProductId")
        ]);
    }
};
