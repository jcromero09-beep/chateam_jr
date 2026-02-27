// services/MetaServices/metaSendService.ts
import { waPost, createMetaClient } from "./metaClient";

// Versiones dinámicas que reciben las credenciales específicas
export async function markAsReadDynamic(messageId: string, phoneNumberId: string, accessToken: string) {
  const client = createMetaClient(phoneNumberId, accessToken);
  return client.waPost(`/messages`, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

export async function sendTextDynamic(to: string, body: string, phoneNumberId: string, accessToken: string) {
  const client = createMetaClient(phoneNumberId, accessToken);

  // Payload correcto según la API oficial de Meta
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body,
      preview_url: false
    }
  };

  console.log("📤 [META-TEXT] ========== DEBUG ENVÍO TEXTO ==========");
  console.log("📤 [META-TEXT] URL:", `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`);
  console.log("📤 [META-TEXT] phoneNumberId:", phoneNumberId);
  console.log("📤 [META-TEXT] accessToken:", accessToken ? `${accessToken.substring(0, 20)}...` : 'NO DEFINIDO');
  console.log("📤 [META-TEXT] to:", to);
  console.log("📤 [META-TEXT] body:", body);
  console.log("📤 [META-TEXT] PAYLOAD COMPLETO:", JSON.stringify(payload, null, 2));
  console.log("📤 [META-TEXT] ================================================");

  try {
    const response = await client.waPost(`/messages`, payload);
    console.log("✅ [META-TEXT] Respuesta exitosa:", JSON.stringify(response.data, null, 2));
    return response;
  } catch (error: any) {
    console.error("❌ [META-TEXT] ========== ERROR COMPLETO ==========");
    console.error("❌ [META-TEXT] error.message:", error.message);
    console.error("❌ [META-TEXT] error.response.status:", error.response?.status);
    console.error("❌ [META-TEXT] error.response.statusText:", error.response?.statusText);
    console.error("❌ [META-TEXT] error.response.data:", JSON.stringify(error.response?.data, null, 2));
    console.error("❌ [META-TEXT] error.response.headers:", JSON.stringify(error.response?.headers, null, 2));
    console.error("❌ [META-TEXT] ================================================");
    throw error;
  }
}

// Versiones legacy para compatibilidad
export async function markAsRead(messageId: string) {
  return waPost(`/messages`, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

export async function sendText(to: string, body: string) {
  // Payload correcto según la API oficial de Meta
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body,
      preview_url: false
    }
  };

  console.log("📤 [META-TEXT-LEGACY] PAYLOAD:", JSON.stringify(payload, null, 2));

  try {
    const response = await waPost(`/messages`, payload);
    console.log("✅ [META-TEXT-LEGACY] Respuesta exitosa:", JSON.stringify(response.data, null, 2));
    return response;
  } catch (error: any) {
    console.error("❌ [META-TEXT-LEGACY] ERROR:", JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
}

// Versiones dinámicas
export async function sendTemplateDynamic(to: string, name: string, phoneNumberId: string, accessToken: string, params: string[] = [], lang = "es") {
  const client = createMetaClient(phoneNumberId, accessToken);

  // Construir el payload
  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: lang },
    },
  };

  // Solo agregar components si hay parámetros
  if (params && params.length > 0) {
    payload.template.components = [
      {
        type: "body",
        parameters: params.map((t) => ({ type: "text", text: t })),
      },
    ];
  }

  // Debug: mostrar el payload completo que se enviará a Meta
  console.log("📤 [META-TEMPLATE] ========== DEBUG ENVÍO TEMPLATE ==========");
  console.log("📤 [META-TEMPLATE] phoneNumberId:", phoneNumberId);
  console.log("📤 [META-TEMPLATE] to:", to);
  console.log("📤 [META-TEMPLATE] template_name:", name);
  console.log("📤 [META-TEMPLATE] language:", lang);
  console.log("📤 [META-TEMPLATE] params:", JSON.stringify(params));
  console.log("📤 [META-TEMPLATE] PAYLOAD COMPLETO:", JSON.stringify(payload, null, 2));
  console.log("📤 [META-TEMPLATE] ================================================");

  return client.waPost(`/messages`, payload);
}

export async function sendButtonsDynamic(
  to: string,
  body: string,
  buttons: { id: string; title: string }[],
  phoneNumberId: string,
  accessToken: string
) {
  const client = createMetaClient(phoneNumberId, accessToken);
  return client.waPost(`/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

// Versiones legacy
export async function sendTemplate(to: string, name: string, params: string[] = [], lang = "es_ES") {
  return waPost(`/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: lang },
      ...(params.length
        ? {
            components: [
              {
                type: "body",
                parameters: params.map((t) => ({ type: "text", text: t })),
              },
            ],
          }
        : {}),
    },
  });
}

export async function sendButtons(
  to: string,
  body: string,
  buttons: { id: string; title: string }[]
) {
  return waPost(`/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

// Versiones dinámicas
export async function sendListDynamic(
  to: string,
  header: string,
  body: string,
  footer: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[],
  phoneNumberId: string,
  accessToken: string
) {
  const client = createMetaClient(phoneNumberId, accessToken);
  return client.waPost(`/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: header },
      body:   { text: body },
      footer: { text: footer },
      action: { sections },
    },
  });
}

export async function sendLocationDynamic(
  to: string,
  lat: number,
  lng: number,
  phoneNumberId: string,
  accessToken: string,
  name?: string,
  address?: string
) {
  const client = createMetaClient(phoneNumberId, accessToken);
  return client.waPost(`/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "location",
    location: { latitude: lat, longitude: lng, name, address },
  });
}

export async function sendContactDynamic(
  to: string,
  fullName: string,
  phoneE164: string,
  phoneNumberId: string,
  accessToken: string
) {
  const client = createMetaClient(phoneNumberId, accessToken);
  return client.waPost(`/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "contacts",
    contacts: [
      {
        name: { formatted_name: fullName },
        phones: [{ phone: phoneE164, type: "CELL", wa_id: phoneE164.replace("+", "") }],
      },
    ],
  });
}

// Versiones legacy
export async function sendList(
  to: string,
  header: string,
  body: string,
  footer: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
) {
  return waPost(`/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: header },
      body:   { text: body },
      footer: { text: footer },
      action: { sections },
    },
  });
}

export async function sendLocation(
  to: string,
  lat: number,
  lng: number,
  name?: string,
  address?: string
) {
  return waPost(`/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "location",
    location: { latitude: lat, longitude: lng, name, address },
  });
}

export async function sendContact(
  to: string,
  fullName: string,
  phoneE164: string
) {
  return waPost(`/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "contacts",
    contacts: [
      {
        name: { formatted_name: fullName },
        phones: [{ phone: phoneE164, type: "CELL", wa_id: phoneE164.replace("+", "") }],
      },
    ],
  });
}
