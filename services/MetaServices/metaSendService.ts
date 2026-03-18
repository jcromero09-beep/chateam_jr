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
    // NO usar JSON.stringify(error) - tiene referencias circulares
    console.error("❌ [META-TEXT] ========== ERROR ==========");
    console.error("❌ [META-TEXT] error.message:", error.message);
    console.error("❌ [META-TEXT] error.response?.status:", error.response?.status);
    console.error("❌ [META-TEXT] error.response?.statusText:", error.response?.statusText);
    // Solo stringify la data, no el objeto error completo
    if (error.response?.data) {
      const dataStr = typeof error.response.data === 'object'
        ? JSON.stringify(error.response.data)
        : String(error.response.data);
      console.error("❌ [META-TEXT] error.response.data:", dataStr);
    }
    // No stringify headers - puede tener referencias circulares
    console.error("❌ [META-TEXT] =============================");
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
    // NO usar JSON.stringify(error) - tiene referencias circulares
    console.error("❌ [META-TEXT-LEGACY] ERROR:", error.response?.data || error.message);
    throw error;
  }
}

// Interfaz extendida para botones con tipo y valores dinámicos
interface TemplateButtonDynamic {
  id: string;
  index?: number;
  type?: string;           // QUICK_REPLY, URL, PHONE_NUMBER, COPY_CODE
  title?: string;
  text?: string;
  url?: string;            // URL con variables {{1}}, {{2}}...
  phoneNumber?: string;
  dynamicValue?: string;   // Valor dinámico proporcionado en el envío
}

// Reemplazar variables {{n}} en strings
const replaceVariables = (content: string, params: string[]): string => {
  return content.replace(/\{\{(\d+)\}\}/g, (match, p1) => {
    const index = parseInt(p1) - 1;
    return params[index] !== undefined ? params[index] : match;
  });
};

// Versiones dinámicas
export async function sendTemplateDynamic(
  to: string,
  name: string,
  phoneNumberId: string,
  accessToken: string,
  params: string[] = [],
  lang: string = "es",
  buttons?: TemplateButtonDynamic[]
): Promise<{ messagingMessageId: string }> {
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

  // Construir components array
  const components: any[] = [];

  // Agregar parámetros del body si existen
  // IMPORTANTE: Meta rechaza valores null/undefined, convertir a string vacío
  if (params && params.length > 0) {
    components.push({
      type: "body",
      parameters: params.map((t) => ({ type: "text", text: t ?? "" })),
    });
  }

  // NOTA: Los botones NO se envían en el payload de envío
  // Ya están definidos en la plantilla aprobada en Meta y se incluyen automáticamente
  // Este código está comentado porque Meta los rechaza si se envían
  /*
  if (buttons && buttons.length > 0) {
    const metaButtons = buttons.map((btn) => {
      const title = (btn.title || btn.text || "Botón").substring(0, 25);
      const btnType = btn.type || "QUICK_REPLY";
      const finalId = btn.dynamicValue ? `${btn.id}|${btn.dynamicValue}` : btn.id;

      switch (btnType) {
        case "URL":
          // Reemplazar variables en la URL
          const finalUrl = btn.url ? replaceVariables(btn.url, params) : "";
          return {
            type: "url",
            url: finalUrl,
            text: title
          };

        case "PHONE_NUMBER":
          return {
            type: "phone_number",
            phone_number: btn.phoneNumber || "",
            text: title
          };

        case "COPY_CODE":
          return {
            type: "copy_code",
            copy_code: btn.dynamicValue || btn.id.replace("btn_", ""),
            text: title
          };

        case "QUICK_REPLY":
        default:
          return {
            type: "quick_reply",
            text: title
          };
      }
    });

    // Los botones NO se envían - ya están en la plantilla aprobada
  }
  // */

  // Solo agregar components si hay parámetros o botones
  if (components.length > 0) {
    payload.template.components = components;
  }

  // Debug: mostrar el payload completo que se enviará a Meta
  console.log("📤 [META-TEMPLATE] ========== DEBUG ENVÍO TEMPLATE ==========");
  console.log("📤 [META-TEMPLATE] phoneNumberId:", phoneNumberId);
  console.log("📤 [META-TEMPLATE] to:", to);
  console.log("📤 [META-TEMPLATE] template_name:", name);
  console.log("📤 [META-TEMPLATE] language:", lang);
  console.log("📤 [META-TEMPLATE] params:", JSON.stringify(params));
  console.log("📤 [META-TEMPLATE] buttons:", JSON.stringify(buttons));
  console.log("📤 [META-TEMPLATE] PAYLOAD COMPLETO:", JSON.stringify(payload, null, 2));
  console.log("📤 [META-TEMPLATE] ================================================");

  const response = await client.waPost(`/messages`, payload) as any;

  // Extraer el message_id de la respuesta de Meta
  const messagingMessageId = response?.messages?.[0]?.id || response?.message_id || response?.id || null;

  console.log("📤 [META-TEMPLATE] Message ID de Meta:", messagingMessageId);
  console.log("📤 [META-TEMPLATE] Respuesta completa:", JSON.stringify(response));

  return { messagingMessageId };
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
export async function sendTemplate(
  to: string,
  name: string,
  params: string[] = [],
  lang: string = "es_ES",
  buttons?: { id: string; title: string }[]
) {
  // Construir components
  const components: any[] = [];

  if (params && params.length > 0) {
    components.push({
      type: "body",
      parameters: params.map((t) => ({ type: "text", text: t })),
    });
  }

  if (buttons && buttons.length > 0) {
    components.push({
      type: "buttons",
      buttons: buttons.map((btn) => ({
        type: "reply",
        reply: {
          id: btn.id,
          title: btn.title.substring(0, 25)
        }
      }))
    });
  }

  return waPost(`/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: lang },
      ...(components.length > 0 ? { components } : {}),
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
