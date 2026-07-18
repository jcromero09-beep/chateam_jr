/**
 * Script de prueba para enviar mensaje de debug
 * Uso: npx ts-node scripts/test-send-message.ts
 */
import { getWbot } from "../libs/wbot";

async function testSendMessage() {
  const whatsappId = 16; // ID de la conexión
  const testNumber = "593987009472"; // Número de prueba

  try {
    console.log(`🔄 Obteniendo wbot para whatsappId: ${whatsappId}...`);
    const wbot = getWbot(whatsappId);

    if (!wbot) {
      console.error("❌ Wbot no encontrado para whatsappId:", whatsappId);
      process.exit(1);
    }

    console.log("✅ Wbot obtenido, enviando mensaje de prueba...");

    // Enviar mensaje de prueba
    const jid = `${testNumber}@s.whatsapp.net`;
    const messageText = "🧪 Mensaje de prueba desde ChatEAM JR - Baileys";

    console.log(`📤 Enviando mensaje a ${testNumber}...`);

    const result = await wbot.sendMessage(jid, {
      text: messageText
    });

    console.log("✅ Mensaje enviado exitosamente!");
    console.log("📋 Key ID:", result.key?.id);
    console.log("📋 Mensaje:", result.message);

  } catch (error: any) {
    console.error("❌ Error al enviar mensaje:");
    console.error("📛 Error:", error.message || error);
    if (error.stack) {
      console.error("📍 Stack:", error.stack.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  }
}

testSendMessage();
