/**
 * Structured JSON logger for Cloud Run.
 * Writes to stderr — Cloud Logging indexes the fields automatically.
 */

type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR";

export interface LogFields {
  userEmail?: string;
  tool?: string;
  action?: string;
  durationMs?: number;
  statusCode?: number;
  targetResource?: string;
  targetId?: string;
  reason?: string;
  [key: string]: unknown;
}

function write(severity: Severity, message: string, fields?: LogFields): void {
  console.error(
    JSON.stringify({
      severity,
      message,
      timestamp: new Date().toISOString(),
      ...fields,
    })
  );
}

export const logger = {
  info:  (message: string, fields?: LogFields) => write("INFO",    message, fields),
  warn:  (message: string, fields?: LogFields) => write("WARNING", message, fields),
  error: (message: string, fields?: LogFields) => write("ERROR",   message, fields),
};
