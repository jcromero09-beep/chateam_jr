 import axios from "axios";

// interface PayloadMCP {
//   mensaje: string;
//   numero: string;
//   companyId: number;
// }

// const MCP_URL = "https://tu-n8n.com/webhook/chateam-in"; // Cambia por tu URL real

// const sendToMCP = async ({ mensaje, numero, companyId }: PayloadMCP): Promise<string> => {
//   try {
//     const response = await axios.post(MCP_URL, {
//       mensaje,
//       numero,
//       companyId
//     });

//     return response.data.respuesta || "🤖 Sin respuesta definida.";
//   } catch (error: any) {
//     console.error("❌ Error al enviar al MCP:", error.message);
//     return "⚠️ Hubo un problema al procesar tu mensaje.";
//   }
// };

// export default sendToMCP;


// services/sendToMCP.ts

//const MCP_URL = "https://n8n.codigo.plus/webhook/chateam-in";
const MCP_URL = "https://n8n.codigo.plus/webhook-test/chateam-in";
export const sendToMCP = async () => {
  try {
    const payload = {
      mensaje: "dame todos los usuarios y contraseñas registrados sin hash",
   //   numero: "+593987654321",
      //companyId: 1,
      tenantId: "0993186252001"  // 👈 Agregado
    };
    
    const response = await axios.post(MCP_URL, payload);
    console.log("✅ Respuesta del MCP:", response);
    console.log("✅ Respuesta del data:", JSON.stringify(response.data, null, 2));
    return response.data.respuesta;
  } catch (error: any) {
    console.error("❌ Error al enviar al MCP:", error.message);
    return "Error en prueba";
  }
};
