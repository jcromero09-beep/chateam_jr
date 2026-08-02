// [2026-08-01] Esta era la única de las 387 migraciones con un shim
// `createRequire(import.meta.url)`. El `import.meta` la marcaba como ESM y entonces
// el `module.exports` de abajo no existe: reventaba con "module is not defined in ES
// module scope" y paraba el runner en seco.
//
// El shim estaba por el `require('sequelize').UUIDV4` de más abajo, que no hacía
// falta: `DataTypes` ya está importado y `DataTypes.UUIDV4` es el mismo valor. Sin
// require no hace falta shim, y sin shim el fichero vuelve a ser CommonJS como las
// otras 386.
import { QueryInterface, DataTypes, Sequelize } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'),
      queryInterface.addColumn("Tickets", "uuid", {
        type: DataTypes.UUID,
        allowNull: true,
        //defaultValue: Sequelize.literal('uuid_generate_v4()')
        defaultValue: DataTypes.UUIDV4,
      })
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Tickets", "uuid");
  }
};
