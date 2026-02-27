import axios from "axios";
import FormData from "form-data";
import { createReadStream } from "fs";
import logger from "../../utils/logger";
import { getCompanyFacebookCredentials, getCompanyInstagramCredentials } from "./getCompanyFBConfig";
const apiBase = (token: string) =>
  axios.create({
    baseURL: "https://graph.facebook.com/v24.0/",
    params: {
      access_token: token
    }
  });

export const getAccessToken = async (companyId: string | number): Promise<string> => {
  // Obtener credenciales de la compañía específica
  const { facebookAppId, facebookAppSecret } = await getCompanyFacebookCredentials(companyId);

  const { data } = await axios.get(
    "https://graph.facebook.com/v24.0/oauth/access_token",
    {
      params: {
        client_id: facebookAppId,
        client_secret: facebookAppSecret,
        grant_type: "client_credentials"
      }
    }
  );
  return data.access_token;
};

export const markSeen = async (id: string, token: string): Promise<void> => {
  await apiBase(token).post(`${id}/messages`, {
    recipient: { id },
    sender_action: "mark_seen"
  });
};

export const showTypingIndicator = async (
  id: string, 
  token: string,
  action: string
): Promise<void> => {
  try {
    const { data } = await apiBase(token).post("me/messages", {
      recipient: { id },
      sender_action: action
    });
    return data;
  } catch (error) {
    console.log(error);
  }
};



export const sendText = async (
  id: string | number,
  text: string,
  token: string
): Promise<void> => {
  try {
    const url = `https://graph.facebook.com/v24.0/me/messages?access_token=${token}`;
    const payload = {
      recipient: { id },
      message: { text }
    };

    const { data } = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" }
    });


    console.log("Mensaje de texto enviado:", data);
    return data;
  } catch (error) {
    console.error("Error al enviar mensaje de texto:", error.response?.data || error.message);
  }
};

// export const sendAttachmentFromUrl = async (
//   id: string,
//   url: string,
//   type: "image" | "video" | "audio" | "file",
//   token: string
// ): Promise<void> => {
//   try {
//     const apiUrl = `https://graph.facebook.com/v17.0/me/messages?access_token=${token}`;
//     const payload = {
//       recipient: { id },
//       message: {
//         attachment: {
//           type,
//           payload: { url, is_reusable: true }
//         }
//       }
//     };

//     const { data } = await axios.post(apiUrl, payload, {
//       headers: { "Content-Type": "application/json" }
//     });

//     console.log(`Mensaje con ${type} enviado desde URL:`, data);
//     return data;
//   } catch (error) {
//     console.error("Error al enviar adjunto desde URL:", error.response?.data || error.message);
//   }
// };


export const sendAttachmentFromUrl = async (
  id, // PSID del usuario
  url, // URL pública del archivo adjunto
  type, // Tipo de adjunto (image, audio, video, file)
  token // Access Token de la página
) => {
  try {
    console.log("📨 Enviando adjunto a Facebook Messenger...");
    console.log(`🆔 ID: ${id}, 📎 URL: ${url}, 📁 Tipo: ${type}`);

    const response = await axios.post(
      "https://graph.facebook.com/v24.0/me/messages",
      {
        recipient: { id }, // ID del destinatario
        message_type: "RESPONSE", // Tipo de mensaje
        message: {
          attachment: {
            type, // image, video, audio o file
            payload: {
              url, // URL pública del archivo
              is_reusable: true, // Para reusar el archivo en otros mensajes
            },
          },
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        params: {
          access_token: token, // Token de autenticación de la página
        },
      }
    );

    console.log("✅ Respuesta de Facebook:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error al enviar adjunto:", error.response?.data || error);
  }
};

export const sendAttachment = async (
  id: string,
  file: Express.Multer.File,
  type: string,
  token: string
): Promise<void> => {
  const formData = new FormData();
  formData.append("recipient", JSON.stringify({ id }));
  formData.append("message", JSON.stringify({
    attachment: {
      type,
      payload: { is_reusable: true }
    }
  }));

  const fileReaderStream = createReadStream(file.path);
  formData.append("filedata", fileReaderStream);

  try {
    await apiBase(token).post("me/messages", formData, {
      headers: { ...formData.getHeaders() }
    });
  } catch (error) {
    throw new Error(error);
  }
};



export const genText = (text: string): any => {
  return { text };
};

// Función para verificar un token de acceso
export const verifyToken = async (token, appToken) => {
  try {
    const response = await axios.get(
      "https://graph.facebook.com/v24.0/debug_token",
      {
        params: {
          input_token: token, // Token a verificar
          access_token: appToken, // Token de la app (APP_ID|APP_SECRET)
        },
      }
    );

    const { data } = response;
    console.log("Token Verificado:", data);

    return data; // Retorna los datos del token
  } catch (error) {
    console.error("Error verificando el token:", error.response?.data || error);
    throw error;
  }
}; 

export const getProfile = async (id: string, token: string): Promise<any> => {

  try {

    
    const { data } = await apiBase(token).get(`${id}?fields=id,name,first_name,last_name,profile_pic`);

    return data;
  } catch (error) {
    console.log(error);
    throw new Error("ERR_FETCHING_FB_USER_PROFILE_2");
  }
};



// Función para obtener conversaciones
async function getConversationsFromAPI(pageAccessToken) {
  const url = `https://graph.facebook.com/v24.0/{page-id}/conversations?fields=id,participants,snippet,updated_time&access_token=${pageAccessToken}`;
  const response = await axios.get(url);
  return response.data.data; // Lista de conversaciones
}


export const getPageProfile = async (
  id: string,
  token: string
): Promise<any> => {
  try {
    const { data } = await apiBase(token).get(
      `${id}/accounts?fields=name,access_token,instagram_business_account{id,username,profile_picture_url,name}`
    );
    return data;
  } catch (error) {
    console.log(error);
    throw new Error("ERR_FETCHING_FB_PAGES");
  }
};


export const profilePsid = async (id: string, token: string, folder: string): Promise<any> => {
  try {
    const url = `https://graph.facebook.com/v24.0/${id}/conversations?access_token=${token}&folder=${folder}&limit=5&fields=participants,message_count,unread_count,is_subscribed,snippet,id,updated_time,link`;
    const response = await axios.get(url);
    console.log('Datos de conversaciones:', response.data);

    // Encuentra la conversación específica que contiene el ID
    const conversation = response.data.data.find((conv: any) =>
      conv.participants.data.some((participant: any) => participant.id === id)
    );

    if (!conversation) {
      throw new Error(`No se encontró conversación para el ID ${id}`);
    }

    // Encuentra el participante que no es la página misma
    const participant = conversation.participants.data.find(
      (p: any) => p.id !== id
    );

    if (!participant) {
      throw new Error(`No se encontró participante válido para el ID ${id}`);
    }

    // Retorna un objeto con el nombre y el número
    return {
      id: participant.id,
      name: participant.name,
     
    };
  } catch (error) {
    console.error('Error al obtener datos del usuario:', error.response?.data || error.message);
    return null;
  }
};


 

export const subscribeApp = async (id: string, token: string): Promise<any> => {
  try {
    const { data } = await apiBase(token).post(`${id}/subscribed_apps`, {
      subscribed_fields: [
        "messages",
        "messaging_postbacks",
        "message_deliveries",
        "message_reads",
        "message_echoes",
        "conversations", // ✅ Campo correcto para Instagram Messages
        "message_reactions"
      ]
    });
    return data;
  } catch (error) {
    console.error("❌ Error al suscribirse:", error.response?.data || error.message);

    if (error.response?.status === 400 || error.response?.status === 403) {
      console.warn("⚠️ Intentando desuscribirse y volver a suscribirse...");
      
      try {
        await unsubscribeApp(id, token);
        console.log("✅ Desuscripción exitosa, intentando nuevamente la suscripción...");
        
        // Reintenta la suscripción después de desuscribirse
        const retryData = await apiBase(token).post(`${id}/subscribed_apps`, {
          subscribed_fields: [
            "messages",
            "messaging_postbacks",
            "message_deliveries",
            "message_reads",
            "message_echoes",
            "conversations", // ✅ Campo correcto para Instagram
            "message_reactions"
          ]
        });
        return retryData;
      } catch (retryError) {
        console.error("❌ Error al volver a suscribirse después de desuscribirse:", retryError.response?.data || retryError.message);
        throw new Error("ERR_RESUBSCRIBING_PAGE_TO_MESSAGE_WEBHOOKS");
      }
    }

    throw new Error("ERR_SUBSCRIBING_PAGE_TO_MESSAGE_WEBHOOKS");
  }
};

export const unsubscribeApp = async (id: string, token: string): Promise<any> => {
  try {
    const { data } = await apiBase(token).delete(`${id}/subscribed_apps`);
    console.log("✅ Desuscripción exitosa:", data);
    return data;
  } catch (error) {
    console.error("❌ Error al desuscribirse:", error.response?.data || error.message);
    throw new Error("ERR_UNSUBSCRIBING_PAGE_TO_MESSAGE_WEBHOOKS");
  }
};

export const getSubscribedApps = async (
  id: string,
  token: string
): Promise<any> => {
  try {
    const { data } = await apiBase(token).get(`${id}/subscribed_apps`);
    return data;
  } catch (error) {
    throw new Error("ERR_GETTING_SUBSCRIBED_APPS");
  }
};

export const getAccessTokenFromPage = async (
  token: string,
  companyId: string | number
): Promise<string> => {
  try {

     // 1. Obtener credenciales de la compañía
     const { facebookAppId, facebookAppSecret } =
     await getCompanyFacebookCredentials(companyId); 
    if (!token) throw new Error("ERR_FETCHING_FB_USER_TOKEN1");
console.log('token getAccessTokenFromPage',token, 'facebookAppId', facebookAppId, 'facebookAppSecret',facebookAppSecret )
    const { data } = await axios.get(
      "https://graph.facebook.com/v24.0/oauth/access_token",
      {
        params: {
          client_id: facebookAppId,
          client_secret: facebookAppSecret,
          grant_type: "fb_exchange_token",
          fb_exchange_token: token
        }
      }
    );
    return data.access_token;
  } catch (error) {
    console.log(error);
    throw new Error("ERR_FETCHING_FB_USER_TOKEN");
  }
};

export const removeApplication = async (
  id: string,
  token: string
): Promise<void> => {
  try {
    await apiBase(token).delete(`${id}/permissions`);
  } catch (error) {
    logger.error("ERR_REMOVING_APP_FROM_PAGE");
  }
};

export const logoutFacebook = async (userId, accessToken) => {
  try {
    const response = await fetch(`https://graph.facebook.com/v24.0/${userId}/permissions?access_token=${accessToken}`, {
      method: "DELETE"
    });

    const data = await response.json();
    console.log("Sesión cerrada:", data);
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
  }
};


/**
 * Paso 1: Intercambia el código por un access_token de corta duración
 */
export const getInstagramShortLivedToken = async (code: string, redirectUri: string, companyId: string | number) => {
  try {
    // Obtener credenciales de Instagram desde la BD
    const { instagramAppId, instagramAppSecret } = await getCompanyInstagramCredentials(companyId);

    console.log("🔵 [IG OAuth] Obteniendo token de corta duración...");
    console.log("Params:", { code, redirectUri, client_id: instagramAppId });

    const { data } = await axios.post(
      "https://api.instagram.com/oauth/access_token",
      new URLSearchParams({
        client_id: instagramAppId,
        client_secret: instagramAppSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      })
    );
    console.log("🟢 [IG OAuth] Token corto obtenido:", data);
    return data; // { access_token, user_id }
  } catch (err: any) {
    console.error("🔴 [IG OAuth] Error al obtener token de corta duración:", err.response?.data || err);
    throw err;
  }
};

/**
 * Paso 2: Consigue el token de larga duración a partir del token corto
 */
export const getInstagramLongLivedToken = async (shortToken: string, companyId: string | number) => {
  try {
    // Obtener credenciales de Instagram desde la BD
    const { instagramAppSecret } = await getCompanyInstagramCredentials(companyId);

    console.log("🔵 [IG OAuth] Solicitando token de larga duración...");
    const { data } = await axios.get(
      "https://graph.instagram.com/access_token",
      {
        params: {
          grant_type: "ig_exchange_token",
          client_secret: instagramAppSecret,
          access_token: shortToken,
        },
      }
    );
    console.log("🟢 [IG OAuth] Token largo obtenido:", data);
    return data; // { access_token, token_type, expires_in }
  } catch (err: any) {
    console.error("🔴 [IG OAuth] Error al obtener token de larga duración:", err.response?.data || err);
    throw err;
  }
};

/**
 * Paso 3: Obtiene el perfil de la cuenta de Instagram
 */
export const getInstagramProfile = async (longToken: string) => {
  try {
    console.log("🔵 [IG OAuth] Obteniendo perfil de la cuenta IG...");
    const { data } = await axios.get(
      "https://graph.instagram.com/me",
      {
        params: {
          fields: "id,username,user_id,account_type,media_count",
          access_token: longToken,
        },
      }
    );
    console.log("🟢 [IG OAuth] Perfil de IG obtenido:", data);
    return data; // { id, username, account_type, media_count }
  } catch (err: any) {
    console.error("🔴 [IG OAuth] Error al obtener perfil de IG:", err.response?.data || err);
    throw err;
  }
};


export const igSubscribe = async (igId: string, token: string) => {
  const url = `https://graph.instagram.com/v24.0/${igId}/subscribed_apps`;
  const payload = { subscribed_fields: ["messages", "message_reactions"] }; // agrega más si usas otros
  const { data } = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
};

export const igGetSubscriptions = async (igId: string, token: string) => {
  const url = `https://graph.instagram.com/v24.0/${igId}/subscribed_apps`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
};

// opcional: desuscribir / limpiar (por si reintentas)
export const igUnsubscribe = async (igId: string, token: string) => {
  const url = `https://graph.instagram.com/v24.0/${igId}/subscribed_apps`;
  const { data } = await axios.delete(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
};



export const sendInstagramMessage = async (
  recipientId,
  text,
  igUserAccessToken
) => {
  try {
    const url = "https://graph.instagram.com/v24.0/me/messages";
    const payload = {
      recipient: { id: recipientId },
      message: { text }
    };
    const headers = {
      Authorization: `Bearer ${igUserAccessToken}`,
      "Content-Type": "application/json"
    };
    const { data } = await axios.post(url, payload, { headers });
    return data;
  } catch (error) {
    console.error("❌ Error enviando mensaje IG:", error.response?.data || error);
    throw error;
  }
};

export const sendInstagramTextMessage = async (
  igId: string,            // El ID de la cuenta IG conectada (tu app)
  recipientId: string,     // El Instagram-scoped ID del usuario destino (IGSID)
  text: string,
  igAccessToken: string
) => {
  try {
    console.log(`🟣 [IG Send] Text to ${recipientId} via IG ${igId}: "${text}"`);
    const url = `https://graph.instagram.com/v24.0/${igId}/messages`;

    const { data } = await axios.post(
      url,
      {
        recipient: { id: recipientId },
        message: { text }
      },
      {
        headers: {
          Authorization: `Bearer ${igAccessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("🟢 [IG Send] Text response:", data);
    return data;
  } catch (err: any) {
    console.error("🔴 [IG Send] Error sending text:", err.response?.data || err);
    throw err;
  }
};


// export const sendInstagramAttachment = async (
//     igId: string,           // IG Business ID (1784…)
//     recipientId: string,    // IGSID del cliente (viene del webhook)
//     mediaType: "image" | "video" | "audio" | "file",
//     fileUrl: string,        // URL pública directa
//     igAccessToken: string
//   ) => {
//     try {
//       const endpoint = `https://graph.instagram.com/v24.0/${igId}/messages`;
  
//       const payload = {
//         recipient: { id: recipientId },
//         message: {
//           attachment: {
//             type: mediaType,
//             payload: {
//               url: fileUrl // URL pública del archivo
//             }
//           }
//         }
//       };
  
//       const { data } = await axios.post(endpoint, payload, {
//         headers: {
//           Authorization: `Bearer ${igAccessToken}`,
//           "Content-Type": "application/json"
//         }
//       });
  
//       console.log("✅ Mensaje multimedia enviado:", data);
//       return data;
//     } catch (error: any) {
//       console.error("❌ Error enviando media:", error.response?.data || error);
//       throw error;
//     }
//   };
  


// export const sendInstagramAttachment = async (
//   igId: string,           // IG Business ID (1784…)
//   recipientId: string,    // IGSID del cliente (viene del webhook)
//   mediaType: "image" | "video" | "audio" | "file",
//   fileUrl: string,        // URL pública directa
//   igAccessToken: string
// ) => {
//   console.log("🟢  igId  obtenido:", igId);
//   console.log("🟢  recipientId  obtenido:", recipientId);
//   try {
//     const endpoint = `https://graph.instagram.com/v24.0/${igId}/messages`;

//     const payload = {
//       recipient: { id: recipientId },
//       message: {
//         attachment: {
//           type: mediaType,
//           payload: {
//             url: fileUrl // URL pública del archivo
//           }
//         }
//       }
//     };

//     const { data } = await axios.post(endpoint, payload, {
//       headers: {
//         Authorization: `Bearer ${igAccessToken}`,
//         "Content-Type": "application/json"
//       }
//     });

//     console.log("✅ Mensaje multimedia enviado:", data);
//     return data;
//   } catch (error: any) {
//     console.error("❌ Error enviando media:", error.response?.data || error);
//     throw error;
//   }
// };




// Tipos admitidos por IG Direct
const ALLOWED_TYPES = new Set(["image", "video", "audio", "file"] as const);
type MediaType = "image" | "video" | "audio" | "file";

export const sendInstagramAttachment = async (
  igId: string,            // IG Business ID (empieza con 1784…)
  igsid: string,           // IGSID del usuario (sender.id del webhook)
  mediaType: MediaType,    // "image" | "video" | "audio" | "file"
  fileUrl: string,         // URL HTTPS pública y directa
  accessToken: string      // Long-lived Instagram User Access Token
) => {
  console.log("🟣 [IG Media] Inicio envío de media");
  console.log("  ↳ Params:", { igId, igsid, mediaType, fileUrlLen: fileUrl?.length, tokenLen: accessToken?.length });

  // Validaciones rápidas
  if (!ALLOWED_TYPES.has(mediaType)) {
    console.error("🔴 [IG Media] mediaType inválido:", mediaType);
    throw new Error(`mediaType inválido: ${mediaType}`);
  }
  if (!igId || !igsid || !fileUrl || !accessToken) {
    console.error("🔴 [IG Media] Faltan parámetros obligatorios");
    throw new Error("Faltan igId, igsid, fileUrl o accessToken");
  }
  if (!/^1784\d+/.test(igId)) {
    console.warn("⚠️ [IG Media] igId no parece un IG Business ID (debería iniciar con 1784…):", igId);
  }
  if (!/^https:\/\/.+/.test(fileUrl)) {
    console.warn("⚠️ [IG Media] fileUrl no es HTTPS público o parece inválido:", fileUrl);
  }
  if (!accessToken.startsWith("IGQ")) {
    console.warn("⚠️ [IG Media] accessToken no luce como IG long-lived token. ¿Seguro no es un Page Token?");
  }

  try {
    // (Opcional) Verificar que el archivo sea accesible públicamente
    try {
      const head = await axios.head(fileUrl, { timeout: 5000 });
      console.log("  ✅ [IG Media] HEAD fileUrl ok:", head.status, head.headers["content-type"]);
    } catch (e: any) {
      console.warn("  ⚠️ [IG Media] HEAD fileUrl falló (continuaré, pero podría fallar el envío):",
        e?.response?.status, e?.response?.statusText);
    }

    // 1) Subida previa para obtener attachment_id (sin exponer URL públicas si no quieres)
    //    IMPORTANTE: usar graph.instagram.com y Authorization: Bearer
    const uploadEndpoint = `https://graph.instagram.com/v24.0/${igId}/message_attachments`;
    const uploadBody = {
      message: {
        attachment: {
          type: mediaType, // "image" | "video" | "audio" | "file"
          payload: {
            url: fileUrl,        // tu URL pública
            is_reusable: true
          }
        }
      }
    };
    console.log("🟡 [IG Media] Subiendo message_attachments…", { uploadEndpoint, uploadBody });

    const uploadResp = await axios.post(uploadEndpoint, uploadBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });
  
    const attachment_id: string | undefined = uploadResp.data?.attachment_id;
    if (!attachment_id) {
      throw new Error("No se obtuvo attachment_id en la subida de media.");
    }
  
    // 2) ENVIAR el mensaje referenciando el attachment_id + type
    const sendEndpoint = `https://graph.instagram.com/v24.0/${igId}/messages`;
    const sendBody = {
      recipient: { id: igsid },
      message: {
        attachment: {
          type: mediaType,
          payload: { attachment_id }
        }
      }
    };
  
    const sendResp = await axios.post(sendEndpoint, sendBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });
  
    return sendResp.data; // { recipient_id, message_id }
  
  } catch (error: any) {
    const r = error?.response;
    console.error("🔴 [IG Media] Error enviando IG media:");
    console.error("  • status:", r?.status);
    console.error("  • headers:", r?.headers);
    console.error("  • data:", r?.data);
    console.error("  • message:", error?.message);
    console.error("  • stack:", error?.stack);
    throw error;
  }
};



export const getInstagramUserProfile = async (userScopedId, igAccessToken) => {
  try {
    const endpoint = `https://graph.instagram.com/v24.0/${userScopedId}`;
    const params = {
      fields: [
        "name",
        "username",
        "profile_pic",
      ].join(","),
      access_token: igAccessToken,
    };

    const { data } = await axios.get(endpoint, { params });

    return data;
  } catch (error) {
    console.error("❌ Error obteniendo perfil IG del usuario:", error.response?.data || error);
    throw error;
  }
};

export const unsubscribeInstagramApp = async (
  pageId: string,
  accessToken: string
) => {
  try {
    const { data } = await axios.delete(
      `https://graph.facebook.com/v24.0/${pageId}/subscribed_apps`,
      {
        params: {
          access_token: accessToken
        }
      }
    );
    return data;
  } catch (error: any) {
    console.error("❌ Error al desuscribirse de IG:", error.response?.data || error);
    throw error;
  }
};