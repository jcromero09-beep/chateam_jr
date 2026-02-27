import logger, { logError, logInfo, logWarn } from "./logger";
import fs from "fs";
import path from "path";

interface ErrorDetails {
    msg: string;
    file: string;
    line: number;
    stack?: string;
    context?: any;
    userId?: number;
    companyId?: number;
    telegramId?: number;
    method?: string;
    url?: string;
    userAgent?: string;
    ip?: string;
}

class TelegramLogger {
    private logDir: string;
    private errorLogPath: string;
    private debugLogPath: string;

    constructor() {
        this.logDir = path.join(process.cwd(), "backend", "logs", "telegram");
        this.errorLogPath = path.join(this.logDir, "errors.log");
        this.debugLogPath = path.join(this.logDir, "debug.log");

        // Crear directorio si no existe
        this.ensureLogDirectory();
    }

    private ensureLogDirectory(): void {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    private formatLogEntry(level: string, message: string, details?: Partial<ErrorDetails>): string {
        const timestamp = new Date().toISOString();
        const baseLog = {
            timestamp,
            level,
            message,
            module: "TELEGRAM",
            ...details
        };

        return JSON.stringify(baseLog, null, 2) + "\n" + "=".repeat(80) + "\n";
    }

    private writeToFile(filePath: string, content: string): void {
        try {
            fs.appendFileSync(filePath, content);
        } catch (error) {
            console.error("Error escribiendo en log file:", error);
        }
    }

    /**
     * Log de errores críticos - equivalente a Log::channel('debugging')->error() de Laravel
     */
    error(message: string, error: Error, context?: any): void {
        const errorDetails: ErrorDetails = {
            msg: error.message,
            file: this.getErrorFile(error),
            line: this.getErrorLine(error),
            stack: error.stack,
            context,
            ...context
        };

        // Log a archivo específico
        const logEntry = this.formatLogEntry("ERROR", message, errorDetails);
        this.writeToFile(this.errorLogPath, logEntry);

        // Log también al sistema general
        logError(`TELEGRAM ERROR: ${message}`, {
            error: error.message,
            file: errorDetails.file,
            line: errorDetails.line,
            context
        });

        // En desarrollo, también mostrar en consola
        if (process.env.NODE_ENV === "development") {
            console.error("🚨 TELEGRAM ERROR:", {
                message,
                error: error.message,
                file: errorDetails.file,
                line: errorDetails.line,
                context
            });
        }
    }

    /**
     * Log de información de debug
     */
    debug(message: string, context?: any): void {
        const logEntry = this.formatLogEntry("DEBUG", message, { context });
        this.writeToFile(this.debugLogPath, logEntry);

        logInfo(`TELEGRAM DEBUG: ${message}`, context);

        if (process.env.NODE_ENV === "development") {
            console.log("🔍 TELEGRAM DEBUG:", message, context);
        }
    }

    /**
     * Log de información general
     */
    info(message: string, context?: any): void {
        const logEntry = this.formatLogEntry("INFO", message, { context });
        this.writeToFile(this.debugLogPath, logEntry);

        logInfo(`TELEGRAM INFO: ${message}`, context);

        if (process.env.NODE_ENV === "development") {
            console.log("ℹ️ TELEGRAM INFO:", message, context);
        }
    }

    /**
     * Log de advertencias
     */
    warn(message: string, context?: any): void {
        const logEntry = this.formatLogEntry("WARN", message, { context });
        this.writeToFile(this.debugLogPath, logEntry);

        logWarn(`TELEGRAM WARNING: ${message}`, context);

        if (process.env.NODE_ENV === "development") {
            console.warn("⚠️ TELEGRAM WARNING:", message, context);
        }
    }

    /**
     * Log específico para operaciones de bot
     */
    botOperation(operation: string, botId: number, success: boolean, details?: any): void {
        const message = `Bot ${operation} - ID: ${botId} - ${success ? "SUCCESS" : "FAILED"}`;

        if (success) {
            this.info(message, { botId, operation, details });
        } else {
            this.error(message, new Error(`Bot operation failed: ${operation}`), { botId, operation, details });
        }
    }

    /**
     * Log específico para webhooks
     */
    webhook(telegramId: number, updateId: number, success: boolean, error?: Error): void {
        const message = `Webhook processed - Bot: ${telegramId}, Update: ${updateId}`;

        if (success) {
            this.debug(message, { telegramId, updateId });
        } else {
            this.error(message, error || new Error("Webhook processing failed"), { telegramId, updateId });
        }
    }

    /**
     * Log específico para errores de validación
     */
    validationError(field: string, value: any, error: string, context?: any): void {
        this.error(`Validation Error - Field: ${field}`, new Error(error), {
            field,
            value,
            context
        });
    }

    private getErrorFile(error: Error): string {
        if (!error.stack) return "unknown";

        const stackLines = error.stack.split("\n");
        for (const line of stackLines) {
            if (line.includes("at ") && line.includes(".ts")) {
                const match = line.match(/\((.+\.ts):\d+:\d+\)/);
                if (match) {
                    return match[1];
                }
            }
        }
        return "unknown";
    }

    private getErrorLine(error: Error): number {
        if (!error.stack) return 0;

        const stackLines = error.stack.split("\n");
        for (const line of stackLines) {
            if (line.includes("at ") && line.includes(".ts")) {
                const match = line.match(/\.ts:(\d+):\d+/);
                if (match) {
                    return parseInt(match[1]);
                }
            }
        }
        return 0;
    }
}

// Singleton instance
const telegramLogger = new TelegramLogger();

export default telegramLogger;
