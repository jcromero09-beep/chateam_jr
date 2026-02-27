import { QueryInterface } from "sequelize";

module.exports = {
    up: async (queryInterface: QueryInterface) => {
        // 1. First, remove the global unique constraint on 'number' if it exists
        try {
            await queryInterface.removeConstraint("Contacts", "Contacts_number_key");
        } catch (e) {
            // Constraint might not exist
            console.log("Constraint Contacts_number_key not found, skipping removal");
        }

        try {
            await queryInterface.removeIndex("Contacts", "contacts_number");
        } catch (e) {
            // Index might not exist
            console.log("Index contacts_number not found, skipping removal");
        }

        // 2. Add composite unique index on (number, companyId, whatsappId)
        // This allows the same contact number to exist for different WhatsApp connections
        await queryInterface.sequelize.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS contacts_number_company_whatsapp_unique 
            ON "Contacts" ("number", "companyId", "whatsappId") 
            WHERE "whatsappId" IS NOT NULL
        `);

        // 3. Add composite unique index on (remoteJid, companyId, whatsappId)
        // This is the primary lookup key for WhatsApp contacts
        await queryInterface.sequelize.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS contacts_remotejid_company_whatsapp_unique 
            ON "Contacts" ("remoteJid", "companyId", "whatsappId") 
            WHERE "remoteJid" IS NOT NULL AND "whatsappId" IS NOT NULL
        `);

        // 4. Add index on remoteJid for faster lookups
        try {
            await queryInterface.addIndex("Contacts", ["remoteJid"], {
                name: "contacts_remotejid_idx"
            });
        } catch (e) {
            console.log("Index contacts_remotejid_idx already exists");
        }

        // 5. Add index on (number, companyId) for contacts without whatsappId (manual creation)
        await queryInterface.sequelize.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS contacts_number_company_unique 
            ON "Contacts" ("number", "companyId") 
            WHERE "whatsappId" IS NULL
        `);
    },

    down: async (queryInterface: QueryInterface) => {
        // Remove the new indexes
        try {
            await queryInterface.removeIndex("Contacts", "contacts_number_company_whatsapp_unique");
        } catch (e) {
            console.log("Index not found");
        }

        try {
            await queryInterface.removeIndex("Contacts", "contacts_remotejid_company_whatsapp_unique");
        } catch (e) {
            console.log("Index not found");
        }

        try {
            await queryInterface.removeIndex("Contacts", "contacts_remotejid_idx");
        } catch (e) {
            console.log("Index not found");
        }

        try {
            await queryInterface.removeIndex("Contacts", "contacts_number_company_unique");
        } catch (e) {
            console.log("Index not found");
        }

        // Restore global unique constraint on number (original behavior)
        await queryInterface.addConstraint("Contacts", {
            fields: ["number"],
            type: "unique",
            name: "Contacts_number_key"
        });
    }
};
