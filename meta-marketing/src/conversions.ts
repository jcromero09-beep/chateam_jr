import { MetaClient } from './client';
import { ConversionEvent, ConversionEventRequest, ConversionEventResponse, DatasetResponse } from './types';
import crypto from 'crypto';

export class ConversionsAPI {
    constructor(private client: MetaClient) { }

    /**
     * Hash user data for privacy compliance (SHA-256)
     * All personal data must be hashed before sending to Facebook
     */
    hashData(value: string): string {
        if (!value) return '';
        return crypto
            .createHash('sha256')
            .update(value.toLowerCase().trim())
            .digest('hex');
    }

    /**
     * Prepare user data with hashing
     */
    prepareUserData(data: {
        email?: string;
        phone?: string;
        firstName?: string;
        lastName?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        country?: string;
        externalId?: string;
        clientIp?: string;
        clientUserAgent?: string;
        fbc?: string;
        fbp?: string;
    }): any {
        const userData: any = {};

        if (data.email) userData.em = [this.hashData(data.email)];
        if (data.phone) {
            // Normalize phone number (remove non-digits)
            const normalizedPhone = data.phone.replace(/\D/g, '');
            userData.ph = [this.hashData(normalizedPhone)];
        }
        if (data.firstName) userData.fn = [this.hashData(data.firstName)];
        if (data.lastName) userData.ln = [this.hashData(data.lastName)];
        if (data.city) userData.ct = [this.hashData(data.city)];
        if (data.state) userData.st = [this.hashData(data.state)];
        if (data.zipCode) userData.zp = [this.hashData(data.zipCode)];
        if (data.country) userData.country = [this.hashData(data.country)];
        if (data.externalId) userData.external_id = [this.hashData(data.externalId)];

        // These are not hashed
        if (data.clientIp) userData.client_ip_address = data.clientIp;
        if (data.clientUserAgent) userData.client_user_agent = data.clientUserAgent;
        if (data.fbc) userData.fbc = data.fbc;
        if (data.fbp) userData.fbp = data.fbp;

        return userData;
    }

    /**
     * Send a single conversion event to Facebook
     * @param datasetId - Facebook Dataset ID
     * @param event - Conversion event data
     * @param testEventCode - Optional test event code for testing
     */
    async sendEvent(
        datasetId: string,
        event: ConversionEvent,
        testEventCode?: string
    ): Promise<ConversionEventResponse> {
        return this.sendBatchEvents(datasetId, [event], testEventCode);
    }

    /**
     * Send batch conversion events to Facebook (up to 1000 events)
     * @param datasetId - Facebook Dataset ID
     * @param events - Array of conversion events (max 1000)
     * @param testEventCode - Optional test event code for testing
     */
    async sendBatchEvents(
        datasetId: string,
        events: ConversionEvent[],
        testEventCode?: string
    ): Promise<ConversionEventResponse> {
        if (events.length > 1000) {
            throw new Error('Cannot send more than 1000 events in a single batch');
        }

        const requestData: ConversionEventRequest = {
            data: events,
        };

        // Add test event code if provided (for testing in Events Manager)
        if (testEventCode) {
            requestData.test_event_code = testEventCode;
        }

        // Add partner agent for attribution
        requestData.partner_agent = 'jrchateam-conversions-api/1.0';

        try {
            console.log(`\n📤 [ConversionsAPI] Enviando a /${datasetId}/events`);
            console.log(`📦 [ConversionsAPI] Request payload:`, JSON.stringify(requestData, null, 2));

            const response = await this.client.post<ConversionEventResponse>(
                `/${datasetId}/events`,
                requestData
            );

            console.log(`✅ [ConversionsAPI] Respuesta exitosa:`, JSON.stringify(response, null, 2));
            return (response.data?.[0] || response) as ConversionEventResponse;
        } catch (error: any) {
            console.error(`\n❌ [ConversionsAPI] ERROR al enviar a /${datasetId}/events`);
            console.error(`  Message: ${error.message}`);
            console.error(`  Status: ${error.response?.status || 'N/A'}`);
            console.error(`  Response data:`, JSON.stringify(error.response?.data, null, 2));
            console.error(`  Request data sent:`, JSON.stringify(requestData, null, 2));
            throw new Error(`Facebook Conversions API error: ${error.message}`);
        }
    }

    /**
     * Get or create a dataset for WhatsApp Business Account
     * @param wabaId - WhatsApp Business Account ID
     * @returns Dataset ID
     */
    async getOrCreateDataset(
        wabaId: string,
        options: { name?: string } = {}
    ): Promise<string> {
        try {
            // First, try to get existing dataset
            const existingDataset = await this.getDataset(wabaId);
            if (existingDataset) {
                console.log(`[getOrCreateDataset] Dataset existente encontrado: ${existingDataset}`);
                return existingDataset;
            }

            // If no dataset exists, create one
            console.log(`[getOrCreateDataset] Creando nuevo dataset para WABA ${wabaId}...`);
            const payload = options.name ? { name: options.name } : {};
            let response: any;
            try {
                response = await this.client.post<any>(
                    `/${wabaId}/dataset`,
                    payload
                );
            } catch (error: any) {
                if (!options.name) throw error;

                console.warn(
                    `[getOrCreateDataset] Meta no aceptó el nombre del dataset; reintentando sin name. Error: ${error.message}`
                );
                response = await this.client.post<any>(
                    `/${wabaId}/dataset`,
                    {}
                );
            }

            // Facebook puede devolver el ID en diferentes formatos:
            // 1. Directo: {"id": "123456"}
            // 2. En data array: {"data": [{"id": "123456"}]}
            let datasetId: string | undefined;

            if (response.id) {
                // Formato directo: {"id": "123456"}
                datasetId = response.id;
            } else if (response.data?.[0]?.id) {
                // Formato array: {"data": [{"id": "123456"}]}
                datasetId = response.data[0].id;
            }

            if (!datasetId) {
                console.error('[getOrCreateDataset] Respuesta inesperada:', JSON.stringify(response));
                throw new Error('Failed to extract dataset ID from response');
            }

            console.log(`[getOrCreateDataset] Dataset creado exitosamente: ${datasetId}`);
            return datasetId;
        } catch (error: any) {
            console.error('Error getting/creating dataset:', error);
            throw new Error(`Failed to get/create dataset: ${error.message}`);
        }
    }

    /**
     * Retrieve existing dataset for WhatsApp Business Account
     * @param wabaId - WhatsApp Business Account ID
     * @returns Dataset ID or null if not found
     */
    async getDataset(wabaId: string): Promise<string | null> {
        try {
            const response = await this.client.get<DatasetResponse>(
                `/${wabaId}/dataset`,
                {}
            );

            return response.data?.[0]?.id || null;
        } catch (error: any) {
            // If dataset doesn't exist or node type is wrong, Facebook returns an error
            // Code 100 = field doesn't exist (wrong node type like WhatsAppBusinessPhoneNumber)
            // Code 200 = permission denied
            if (error.code === 100 ||
                error.code === 200 ||
                error.message?.includes('does not exist') ||
                error.message?.includes('nonexisting field') ||
                error.message?.includes('permission')) {
                console.log(`[getDataset] Dataset not found or no access for ${wabaId}, will try to create one`);
                return null;
            }
            throw error;
        }
    }

    /**
     * Validate/read a dataset or pixel by ID.
     */
    async getDatasetDetails(datasetId: string): Promise<{ id: string; name?: string }> {
        const response = await this.client.get<any>(
            `/${datasetId}`,
            { fields: 'id,name' }
        );

        const raw = response as any;
        const id = raw.id || raw.data?.[0]?.id;
        if (!id) {
            throw new Error('Dataset validation failed: Meta did not return an id');
        }

        return {
            id: String(id),
            name: raw.name || raw.data?.[0]?.name
        };
    }

    /**
     * Create a unique event ID for deduplication
     * Format: {source}_{timestamp}_{random}
     */
    generateEventId(source: string = 'whatsapp'): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `${source}_${timestamp}_${random}`;
    }

    /**
     * Get current Unix timestamp (for event_time)
     */
    getCurrentTimestamp(): number {
        return Math.floor(Date.now() / 1000);
    }

    /**
     * Create a WhatsApp conversion event
     * Helper method specific to WhatsApp conversions
     */
    createWhatsAppEvent(data: {
        eventName: 'Contact' | 'LeadSubmitted' | 'Purchase' | 'ViewContent';
        ctwaClid?: string;
        userData: any;
        customData?: any;
        eventTime?: number;
        eventId?: string;
    }): ConversionEvent {
        return {
            event_name: data.eventName,
            event_time: data.eventTime || this.getCurrentTimestamp(),
            event_id: data.eventId || this.generateEventId('whatsapp'),
            user_data: data.userData,
            custom_data: data.customData,
            action_source: 'business_messaging',
            messaging_channel: 'whatsapp',
        };
    }
}
