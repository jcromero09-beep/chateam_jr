/**
 * AudiencesManager
 *
 * Gestión de Custom Audiences, Lookalike Audiences y Saved Audiences en Meta Ads.
 * Permite crear, listar, eliminar audiences y gestionar usuarios (add/remove).
 *
 * IMPORTANTE: Los datos de usuario DEBEN estar hasheados con SHA-256 antes de enviarse.
 * Usar ConversionsAPI.prepareUserData() para hashear.
 */

import { MetaClient } from './client';

export interface CustomAudience {
  id: string;
  name: string;
  subtype: string;
  description?: string;
  approximate_count: number;
  time_created?: string;
  time_updated?: string;
  operation_status?: {
    status: number;
    description: string;
  };
  data_source?: {
    type: string;
    sub_type: string;
  };
  delivery_status?: {
    status: string;
  };
  permission_for_actions?: {
    can_edit: boolean;
    can_see_insight: boolean;
    can_share: boolean;
  };
}

export interface LookalikeAudience extends CustomAudience {
  lookalike_spec?: {
    origin: Array<{
      id: string;
      name: string;
      type: string;
    }>;
    country: string;
    ratio: number;
    type: string;
  };
}

export interface SavedAudience {
  id: string;
  name: string;
  description?: string;
  targeting: Record<string, unknown>;
  approximate_count?: number;
  time_created?: string;
}

export interface HashedUserData {
  email?: string;    // SHA-256 hashed
  phone?: string;    // SHA-256 hashed
  fn?: string;       // SHA-256 hashed first name
  ln?: string;       // SHA-256 hashed last name
  ct?: string;       // SHA-256 hashed city
  st?: string;       // SHA-256 hashed state
  zip?: string;      // SHA-256 hashed zip code
  country?: string;  // SHA-256 hashed country
  external_id?: string; // SHA-256 hashed external ID
}

export interface AudienceUsersPayload {
  schema: string[];
  data: string[][];
}

export class AudiencesManager {
  constructor(private client: MetaClient) {}

  // ============================================================
  // CUSTOM AUDIENCES
  // ============================================================

  /**
   * Crear una Custom Audience
   */
  async createCustomAudience(
    accountId: string,
    data: {
      name: string;
      subtype: "CUSTOM" | "WEBSITE" | "APP" | "OFFLINE";
      description?: string;
      customer_file_source?: "USER_PROVIDED_ONLY" | "BOTH_USER_AND_PARTNER_PROVIDED";
    }
  ): Promise<CustomAudience> {
    try {
      const response = await this.client.post(`/act_${accountId}/customaudiences`, {
        name: data.name,
        subtype: data.subtype,
        description: data.description || `Audiencia creada desde ChatEAM - ${new Date().toISOString().split("T")[0]}`,
        customer_file_source: data.customer_file_source || "USER_PROVIDED_ONLY"
      });

      return {
        id: (response as any).id || response.data?.[0]?.id,
        name: data.name,
        subtype: data.subtype,
        description: data.description,
        approximate_count: 0
      };
    } catch (error: any) {
      throw new Error(`Error creando Custom Audience: ${error.message}`);
    }
  }

  /**
   * Agregar usuarios hasheados a una Custom Audience
   * Los datos DEBEN estar pre-hasheados con SHA-256
   */
  async addUsersToAudience(
    audienceId: string,
    users: HashedUserData[]
  ): Promise<{ num_received: number; num_invalid_entries: number }> {
    try {
      const { schema, data } = this.buildUsersPayload(users);

      // Meta API acepta máximo 10,000 usuarios por request
      const BATCH_SIZE = 10000;
      let totalReceived = 0;
      let totalInvalid = 0;

      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);

        const response = await this.client.post(`/${audienceId}/users`, {
          payload: {
            schema,
            data: batch
          }
        });

        const result = response as any;
        totalReceived += result.num_received || batch.length;
        totalInvalid += result.num_invalid_entries || 0;
      }

      return {
        num_received: totalReceived,
        num_invalid_entries: totalInvalid
      };
    } catch (error: any) {
      throw new Error(`Error agregando usuarios a audience ${audienceId}: ${error.message}`);
    }
  }

  /**
   * Remover usuarios de una Custom Audience
   */
  async removeUsersFromAudience(
    audienceId: string,
    users: HashedUserData[]
  ): Promise<{ num_received: number; num_invalid_entries: number }> {
    try {
      const { schema, data } = this.buildUsersPayload(users);

      const response = await this.client.delete(`/${audienceId}/users`);

      // Note: Para DELETE necesitamos enviar el payload diferente
      // En la práctica, Meta API para remover usuarios usa POST con method=DELETE en payload
      const postResponse = await this.client.post(`/${audienceId}/users`, {
        payload: {
          schema,
          data,
          is_raw: true
        },
        method: "DELETE"
      });

      const result = postResponse as any;
      return {
        num_received: result.num_received || users.length,
        num_invalid_entries: result.num_invalid_entries || 0
      };
    } catch (error: any) {
      throw new Error(`Error removiendo usuarios de audience ${audienceId}: ${error.message}`);
    }
  }

  /**
   * Listar todas las Custom Audiences de una cuenta
   */
  async getCustomAudiences(accountId: string): Promise<CustomAudience[]> {
    try {
      const response = await this.client.getAllPages(`/act_${accountId}/customaudiences`, {
        fields: "id,name,subtype,description,approximate_count,time_created,time_updated,operation_status,data_source,delivery_status"
      });

      return (response || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        subtype: item.subtype || "CUSTOM",
        description: item.description,
        approximate_count: item.approximate_count || 0,
        time_created: item.time_created,
        time_updated: item.time_updated,
        operation_status: item.operation_status,
        data_source: item.data_source,
        delivery_status: item.delivery_status
      }));
    } catch (error: any) {
      throw new Error(`Error listando Custom Audiences: ${error.message}`);
    }
  }

  /**
   * Obtener detalles de una audience específica
   */
  async getAudienceById(audienceId: string): Promise<CustomAudience> {
    try {
      const response = await this.client.get(`/${audienceId}`, {
        fields: "id,name,subtype,description,approximate_count,time_created,time_updated,operation_status,data_source,delivery_status,lookalike_spec,permission_for_actions"
      });

      const data = response as any;
      return {
        id: data.id,
        name: data.name,
        subtype: data.subtype || "CUSTOM",
        description: data.description,
        approximate_count: data.approximate_count || 0,
        time_created: data.time_created,
        time_updated: data.time_updated,
        operation_status: data.operation_status,
        data_source: data.data_source,
        delivery_status: data.delivery_status,
        permission_for_actions: data.permission_for_actions
      };
    } catch (error: any) {
      throw new Error(`Error obteniendo audience ${audienceId}: ${error.message}`);
    }
  }

  /**
   * Eliminar una Custom Audience
   */
  async deleteCustomAudience(audienceId: string): Promise<boolean> {
    try {
      await this.client.delete(`/${audienceId}`);
      return true;
    } catch (error: any) {
      throw new Error(`Error eliminando audience ${audienceId}: ${error.message}`);
    }
  }

  // ============================================================
  // LOOKALIKE AUDIENCES
  // ============================================================

  /**
   * Crear una Lookalike Audience basada en una Custom Audience
   */
  async createLookalikeAudience(
    accountId: string,
    data: {
      name: string;
      origin_audience_id: string;
      lookalike_spec: {
        country: string;       // ISO country code: "MX", "CO", "US"
        ratio: number;         // 0.01 - 0.20 (1% - 20% de la población)
        type?: "similarity" | "reach";
      };
    }
  ): Promise<LookalikeAudience> {
    try {
      const lookalikeSpec = {
        origin: [{
          type: "custom_audience",
          id: data.origin_audience_id
        }],
        starting_ratio: 0,
        ratio: data.lookalike_spec.ratio,
        country: data.lookalike_spec.country,
        type: data.lookalike_spec.type || "similarity"
      };

      const response = await this.client.post(`/act_${accountId}/customaudiences`, {
        name: data.name,
        subtype: "LOOKALIKE",
        lookalike_spec: JSON.stringify(lookalikeSpec)
      });

      const resultId = (response as any).id || response.data?.[0]?.id;
      return {
        id: resultId,
        name: data.name,
        subtype: "LOOKALIKE",
        approximate_count: 0,
        lookalike_spec: {
          origin: [{
            id: data.origin_audience_id,
            name: "",
            type: "custom_audience"
          }],
          country: data.lookalike_spec.country,
          ratio: data.lookalike_spec.ratio,
          type: data.lookalike_spec.type || "similarity"
        }
      };
    } catch (error: any) {
      throw new Error(`Error creando Lookalike Audience: ${error.message}`);
    }
  }

  // ============================================================
  // SAVED AUDIENCES
  // ============================================================

  /**
   * Listar Saved Audiences de una cuenta
   */
  async getSavedAudiences(accountId: string): Promise<SavedAudience[]> {
    try {
      const response = await this.client.getAllPages(`/act_${accountId}/saved_audiences`, {
        fields: "id,name,description,targeting,approximate_count,time_created"
      });

      return (response || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        targeting: item.targeting || {},
        approximate_count: item.approximate_count,
        time_created: item.time_created
      }));
    } catch (error: any) {
      throw new Error(`Error listando Saved Audiences: ${error.message}`);
    }
  }

  /**
   * Crear una Saved Audience con targeting spec
   */
  async createSavedAudience(
    accountId: string,
    data: {
      name: string;
      targeting: Record<string, unknown>;
      description?: string;
    }
  ): Promise<SavedAudience> {
    try {
      const response = await this.client.post(`/act_${accountId}/saved_audiences`, {
        name: data.name,
        targeting: JSON.stringify(data.targeting),
        description: data.description
      });

      const resultId = (response as any).id || response.data?.[0]?.id;
      return {
        id: resultId,
        name: data.name,
        description: data.description,
        targeting: data.targeting
      };
    } catch (error: any) {
      throw new Error(`Error creando Saved Audience: ${error.message}`);
    }
  }

  // ============================================================
  // HELPERS PRIVADOS
  // ============================================================

  /**
   * Construir payload de usuarios para la Meta API
   * Convierte array de HashedUserData en formato {schema, data} que Meta espera
   */
  private buildUsersPayload(users: HashedUserData[]): AudienceUsersPayload {
    // Detectar qué campos están disponibles
    const availableFields: Array<keyof HashedUserData> = [];
    const schemaMap: Record<string, string> = {
      email: "EMAIL_SHA256",
      phone: "PHONE_SHA256",
      fn: "FN_SHA256",
      ln: "LN_SHA256",
      ct: "CT_SHA256",
      st: "ST_SHA256",
      zip: "ZIP_SHA256",
      country: "COUNTRY_SHA256",
      external_id: "EXTERN_ID"
    };

    // Detectar campos presentes en al menos un usuario
    for (const field of Object.keys(schemaMap) as Array<keyof HashedUserData>) {
      if (users.some(u => u[field] && u[field] !== "")) {
        availableFields.push(field);
      }
    }

    const schema = availableFields.map(f => schemaMap[f]);
    const data = users.map(user =>
      availableFields.map(f => user[f] || "")
    );

    return { schema, data };
  }
}
