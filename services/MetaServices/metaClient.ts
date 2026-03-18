// services/MetaServices/metaClient.ts
import axios, { AxiosInstance } from "axios";
import { v4 as uuid } from "uuid";

// Función para crear cliente dinámico con credenciales específicas
export const createMetaClient = (phoneNumberId: string, accessToken: string) => {
  const waInstance: AxiosInstance = axios.create({
    baseURL: `https://graph.facebook.com/v24.0/${phoneNumberId}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  return {
    wa: waInstance,
    waPost: async (path: string, payload: any) => {
      try {
        return await waInstance.post(path, payload, {
          headers: { "X-Idempotency-Key": uuid() },
        });
      } catch (error: any) {
        // Transformar el error de axios para evitar referencias circulares al propagarse
        const safeError = new Error(error.message || 'Error de Meta');
        safeError.name = error.name || 'AxiosError';
        // Copiar propiedades importantes sin referencias circulares
        if (error.response) {
          (safeError as any).response = {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          };
        }
        if (error.code) {
          (safeError as any).code = error.code;
        }
        throw safeError;
      }
    }
  };
};

// Cliente legacy para compatibilidad con código existente que use variables de entorno
const ACCESS_TOKEN    = process.env.META_ACCESS_TOKEN ?? "changeme";
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID ?? "changeme";

const legacyClient = createMetaClient(PHONE_NUMBER_ID, ACCESS_TOKEN);
export const wa: AxiosInstance = legacyClient.wa;
export const waPost = legacyClient.waPost;
