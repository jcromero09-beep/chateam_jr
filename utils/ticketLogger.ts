import winston from "winston";
import path from "path";
import fs from "fs";

// Crear directorio de logs si no existe
const logDir = path.join(__dirname, "../../logs/tickets");
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Configuración de winston para tickets
const ticketLogger = winston.createLogger({
    level: process.env.TICKET_LOG_LEVEL || "info",
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
            filename: path.join(logDir, "tickets.log"),
            level: "info",
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        })
    ]
});

// En desarrollo, también mostrar en consola
if (process.env.NODE_ENV !== "production") {
    ticketLogger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Interface para metadatos de tickets
interface TicketLogMetadata {
    ticketId?: number | string;
    companyId?: number;
    userId?: number;
    contactId?: number;
    whatsappId?: string;
    telegramId?: string;
    channel?: string;
    status?: string;
    queueId?: number;
    method?: string;
    url?: string;
    ip?: string;
    userAgent?: string;
    duration?: number;
    count?: number;
    pageNumber?: string;
    filters?: any;
    transactionId?: string;
    [key: string]: any;
}

class TicketLoggerService {
    
    /**
     * Log de información general
     */
    info(message: string, metadata?: TicketLogMetadata): void {
        ticketLogger.info(message, {
            module: "TICKETS",
            timestamp: new Date().toISOString(),
            ...metadata
        });
    }

    /**
     * Log de errores
     */
    error(message: string, error: Error, metadata?: TicketLogMetadata): void {
        ticketLogger.error(message, {
            module: "TICKETS",
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
    warn(message: string, metadata?: TicketLogMetadata): void {
        ticketLogger.warn(message, {
            module: "TICKETS",
            timestamp: new Date().toISOString(),
            ...metadata
        });
    }

    /**
     * Log de debug (desarrollo)
     */
    debug(message: string, metadata?: TicketLogMetadata): void {
        ticketLogger.debug(message, {
            module: "TICKETS",
            timestamp: new Date().toISOString(),
            ...metadata
        });
    }

    /**
     * Log de inicio de operación
     */
    operationStart(operation: string, metadata?: TicketLogMetadata): void {
        this.info(`🚀 Iniciando operación: ${operation}`, {
            operation,
            operationType: "start",
            ...metadata
        });
    }

    /**
     * Log de finalización exitosa de operación
     */
    operationSuccess(operation: string, metadata?: TicketLogMetadata): void {
        this.info(`✅ Operación completada exitosamente: ${operation}`, {
            operation,
            operationType: "success",
            ...metadata
        });
    }

    /**
     * Log de fallo de operación
     */
    operationError(operation: string, error: Error, metadata?: TicketLogMetadata): void {
        this.error(`❌ Error en operación: ${operation}`, error, {
            operation,
            operationType: "error", 
            ...metadata
        });
    }

    /**
     * Log de validación de datos
     */
    validation(field: string, value: any, isValid: boolean, metadata?: TicketLogMetadata): void {
        const message = `🔍 Validación ${field}: ${isValid ? "✅ Válido" : "❌ Inválido"}`;
        if (isValid) {
            this.debug(message, { field, value, isValid, ...metadata });
        } else {
            this.warn(message, { field, value, isValid, ...metadata });
        }
    }

    /**
     * Log de transacciones de base de datos
     */
    transaction(action: "start" | "commit" | "rollback", transactionId: string, metadata?: TicketLogMetadata): void {
        const symbols = { start: "🔄", commit: "💾", rollback: "🔙" };
        const messages = { 
            start: "Iniciando transacción",
            commit: "Transacción confirmada", 
            rollback: "Transacción revertida"
        };
        
        this.info(`${symbols[action]} ${messages[action]}: ${transactionId}`, {
            transactionAction: action,
            transactionId,
            ...metadata
        });
    }

    /**
     * Log de rendimiento de consultas
     */
    performance(operation: string, duration: number, metadata?: TicketLogMetadata): void {
        const level = duration > 1000 ? "warn" : "info"; // Warn si toma más de 1 segundo
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
    httpRequest(method: string, url: string, statusCode: number, duration: number, metadata?: TicketLogMetadata): void {
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

export default new TicketLoggerService();
