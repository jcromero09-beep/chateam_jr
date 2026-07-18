import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import winston from "winston";
import path from "path";
import fs from "fs";

// Crear directorio de logs si no existe
const logDir = path.join(currentDir, "../../logs/messages");
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Configuración de winston para messages
const messageLogger = winston.createLogger({
    level: process.env.MESSAGE_LOG_LEVEL || "info",
    format: winston.format.combine(
        winston.format.timestamp({
            format: "YYYY-MM-DD HH:mm:ss"
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        // Log de debug (todos los niveles)
        new winston.transports.File({
            filename: path.join(logDir, "debug.log"),
            level: "debug",
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        }),
        // Log de errores solamente
        new winston.transports.File({
            filename: path.join(logDir, "error.log"),
            level: "error",
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 3
        }),
        // Log general (info y superiores)
        new winston.transports.File({
            filename: path.join(logDir, "messages.log"),
            level: "info",
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        })
    ]
});

// En desarrollo, también mostrar en consola
if (process.env.NODE_ENV !== "production") {
    messageLogger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Interface para metadatos de messages
interface MessageLogMetadata {
    messageId?: number | string;
    ticketId?: number | string;
    companyId?: number;
    userId?: number;
    contactId?: number;
    whatsappId?: string;
    telegramId?: string;
    channel?: string;
    messageType?: string;
    mediaType?: string;
    fromMe?: boolean;
    method?: string;
    url?: string;
    ip?: string;
    duration?: number;
    hasMedia?: boolean;
    mediaPath?: string;
    quotedMsgId?: string;
    [key: string]: any;
}

class MessageLoggerService {
    
    /**
     * Log de información general
     */
    info(message: string, metadata?: MessageLogMetadata): void {
        messageLogger.info(message, {
            module: "MESSAGES",
            timestamp: new Date().toISOString(),
            ...metadata
        });
    }

    /**
     * Log de errores
     */
    error(message: string, error: Error, metadata?: MessageLogMetadata): void {
        messageLogger.error(message, {
            module: "MESSAGES",
            timestamp: new Date().toISOString(),
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            ...metadata
        });
    }

    /**
     * Log de advertencias
     */
    warn(message: string, metadata?: MessageLogMetadata): void {
        messageLogger.warn(message, {
            module: "MESSAGES",
            timestamp: new Date().toISOString(),
            ...metadata
        });
    }

    /**
     * Log de debug (desarrollo)
     */
    debug(message: string, metadata?: MessageLogMetadata): void {
        messageLogger.debug(message, {
            module: "MESSAGES",
            timestamp: new Date().toISOString(),
            ...metadata
        });
    }

    /**
     * Log de inicio de operación
     */
    operationStart(operation: string, metadata?: MessageLogMetadata): void {
        this.info(`🚀 Iniciando operación: ${operation}`, {
            operation,
            operationType: "start",
            ...metadata
        });
    }

    /**
     * Log de finalización exitosa de operación
     */
    operationSuccess(operation: string, metadata?: MessageLogMetadata): void {
        this.info(`✅ Operación completada exitosamente: ${operation}`, {
            operation,
            operationType: "success",
            ...metadata
        });
    }

    /**
     * Log de fallo de operación
     */
    operationError(operation: string, error: Error, metadata?: MessageLogMetadata): void {
        this.error(`❌ Error en operación: ${operation}`, error, {
            operation,
            operationType: "error", 
            ...metadata
        });
    }

    /**
     * Log de envío de mensaje
     */
    messageSent(channel: string, metadata?: MessageLogMetadata): void {
        this.info(`📤 Mensaje enviado via ${channel}`, {
            messageAction: "sent",
            channel,
            ...metadata
        });
    }

    /**
     * Log de recepción de mensaje
     */
    messageReceived(channel: string, metadata?: MessageLogMetadata): void {
        this.info(`📥 Mensaje recibido via ${channel}`, {
            messageAction: "received",
            channel,
            ...metadata
        });
    }

    /**
     * Log de procesamiento de media
     */
    mediaProcessed(mediaType: string, action: string, metadata?: MessageLogMetadata): void {
        this.info(`📎 Media ${mediaType} ${action}`, {
            mediaAction: action,
            mediaType,
            ...metadata
        });
    }

    /**
     * Log de validación de mensaje
     */
    validation(field: string, value: any, isValid: boolean, metadata?: MessageLogMetadata): void {
        const message = `🔍 Validación ${field}: ${isValid ? "✅ Válido" : "❌ Inválido"}`;
        if (isValid) {
            this.debug(message, { field, value, isValid, ...metadata });
        } else {
            this.warn(message, { field, value, isValid, ...metadata });
        }
    }

    /**
     * Log de rendimiento
     */
    performance(operation: string, duration: number, metadata?: MessageLogMetadata): void {
        const level = duration > 500 ? "warn" : "info"; // Warn si toma más de 500ms
        const message = `⏱️  Rendimiento ${operation}: ${duration}ms`;
        
        if (level === "warn") {
            this.warn(message, { operation, duration, performanceIssue: true, ...metadata });
        } else {
            this.debug(message, { operation, duration, ...metadata });
        }
    }

    /**
     * Log de acceso a endpoints
     */
    httpRequest(method: string, url: string, statusCode: number, duration: number, metadata?: MessageLogMetadata): void {
        const message = `🌐 ${method} ${url} - ${statusCode} (${duration}ms)`;
        this.info(message, {
            httpMethod: method,
            httpUrl: url,
            httpStatusCode: statusCode,
            httpDuration: duration,
            ...metadata
        });
    }
}

export default new MessageLoggerService();
