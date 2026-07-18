// Script para sincronizar solo las tablas de Appointments
import "./bootstrap";
import { Sequelize } from "sequelize-typescript";
import dbConfig from "./config/database";

// Solo modelos de Appointments
import Appointment from "./models/Appointments/Appointment";
import AppointmentServiceModel from "./models/AppointmentService";
import AppointmentAvailability from "./models/Appointments/AppointmentAvailability";
import AppointmentReminder from "./models/Appointments/AppointmentReminder";
import AppointmentBlock from "./models/Appointments/AppointmentBlock";
import AppointmentCalendarSync from "./models/Appointments/AppointmentCalendarSync";
import AppointmentAISuggestion from "./models/Appointments/AppointmentAISuggestion";
import AppointmentAnalytics from "./models/Appointments/AppointmentAnalytics";
import ReminderTemplate from "./models/Appointments/ReminderTemplate";

// Modelos base necesarios para las relaciones
import Company from "./models/Company";
import User from "./models/User";
import Contact from "./models/Contact";
import Ticket from "./models/Ticket";
import Plan from "./models/Plan";
import Queue from "./models/Queue";
import Whatsapp from "./models/Whatsapp";
import WhatsappQueue from "./models/WhatsappQueue";
import UserQueue from "./models/UserQueue";
import CompaniesSettings from "./models/CompaniesSettings";

const sequelize = new Sequelize(dbConfig);

const models = [
  Company,
  Plan,
  User,
  Queue,
  Whatsapp,
  WhatsappQueue,
  UserQueue,
  Contact,
  Ticket,
  CompaniesSettings,
  // Appointment Models
  AppointmentServiceModel,
  Appointment,
  AppointmentAvailability,
  AppointmentReminder,
  AppointmentBlock,
  AppointmentCalendarSync,
  AppointmentAISuggestion,
  AppointmentAnalytics,
  ReminderTemplate
];

sequelize.addModels(models);

async function syncAppointmentTables() {
  try {
    console.log("🔄 Sincronizando tablas de Appointments...");
    console.log(`📊 Base de datos: ${process.env.DB_NAME}`);
    console.log(`🏠 Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);

    await sequelize.authenticate();
    console.log("✅ Conexión establecida.");

    // Sincronizar solo las tablas de appointments
    console.log("\n📝 Creando tablas de Appointments...");

    // Crear las tablas en orden para respetar las relaciones
    await AppointmentServiceModel.sync({ alter: true });
    console.log("   ✓ appointment_services");

    await AppointmentAvailability.sync({ alter: true });
    console.log("   ✓ appointment_availability");

    await AppointmentBlock.sync({ alter: true });
    console.log("   ✓ appointment_blocks");

    await Appointment.sync({ alter: true });
    console.log("   ✓ appointments");

    await AppointmentReminder.sync({ alter: true });
    console.log("   ✓ appointment_reminders");

    await AppointmentCalendarSync.sync({ alter: true });
    console.log("   ✓ appointment_calendar_syncs");

    await AppointmentAISuggestion.sync({ alter: true });
    console.log("   ✓ appointment_ai_suggestions");

    await AppointmentAnalytics.sync({ alter: true });
    console.log("   ✓ appointment_analytics");

    await ReminderTemplate.sync({ alter: true });
    console.log("   ✓ reminder_templates");

    console.log("\n✅ ¡Tablas de Appointments sincronizadas!");

    await sequelize.close();
    process.exit(0);

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.original) {
      console.error("   PostgreSQL:", error.original.message);
    }
    process.exit(1);
  }
}

console.log("=".repeat(60));
console.log("🗓️  SINCRONIZACIÓN DE TABLAS DE APPOINTMENTS");
console.log("=".repeat(60));
console.log();

syncAppointmentTables();
