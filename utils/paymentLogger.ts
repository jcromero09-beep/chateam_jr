import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'logs', 'payment-sync.log');

// Ensure logs directory exists
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

type LogLevel = 'INFO' | 'ERROR' | 'WARN' | 'SUCCESS';
type Provider = 'stripe' | 'paypal' | 'system';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    provider: Provider;
    action: string;
    planId?: number;
    message: string;
    details?: any;
}

function formatLog(entry: LogEntry): string {
    const { timestamp, level, provider, action, planId, message, details } = entry;
    let log = `[${timestamp}] [${level}] [${provider.toUpperCase()}] ${action}`;
    if (planId) log += ` [Plan:${planId}]`;
    log += ` - ${message}`;
    if (details) {
        log += `\n  Details: ${JSON.stringify(details, null, 2).split('\n').join('\n  ')}`;
    }
    return log + '\n';
}

function writeLog(entry: LogEntry): void {
    const formattedLog = formatLog(entry);

    // Console output
    const consolePrefix = entry.level === 'ERROR' ? '❌' :
        entry.level === 'SUCCESS' ? '✅' :
            entry.level === 'WARN' ? '⚠️' : 'ℹ️';
    console.log(`${consolePrefix} [${entry.provider}] ${entry.action}: ${entry.message}`);

    // File output
    try {
        fs.appendFileSync(LOG_FILE, formattedLog);
    } catch (err) {
        console.error('Error writing to payment log file:', err);
    }
}

/**
 * Log a payment sync error
 */
export function logPaymentError(
    provider: Provider,
    action: string,
    error: any,
    planId?: number
): void {
    writeLog({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        provider,
        action,
        planId,
        message: error?.message || String(error),
        details: {
            stack: error?.stack,
            response: error?.response?.data
        }
    });
}

/**
 * Log a successful payment sync operation
 */
export function logPaymentSuccess(
    provider: Provider,
    action: string,
    details: any,
    planId?: number
): void {
    writeLog({
        timestamp: new Date().toISOString(),
        level: 'SUCCESS',
        provider,
        action,
        planId,
        message: 'Operation completed successfully',
        details
    });
}

/**
 * Log a payment sync warning
 */
export function logPaymentWarning(
    provider: Provider,
    action: string,
    message: string,
    planId?: number
): void {
    writeLog({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        provider,
        action,
        planId,
        message
    });
}

/**
 * Log payment sync info
 */
export function logPaymentInfo(
    provider: Provider,
    action: string,
    message: string,
    planId?: number
): void {
    writeLog({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        provider,
        action,
        planId,
        message
    });
}
