/**
 * Input validation helpers for MCP tool parameters.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function validateDateParam(value: string | undefined, name: string): void {
  if (value === undefined || value === "") return;
  if (!ISO_DATE_RE.test(value)) {
    throw new ValidationError(
      `"${name}" must be a valid date in ISO 8601 format (e.g. "2026-03-16"). Got: "${value}"`
    );
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new ValidationError(
      `"${name}" is not a real date. Example: "2026-03-16". Got: "${value}"`
    );
  }
}

export function validateId(value: string | undefined, name: string): string {
  if (!value || value.trim() === "") {
    throw new ValidationError(`"${name}" is required.`);
  }
  return value.trim();
}

export function validatePositiveInt(
  value: number | undefined,
  name: string,
  defaultValue: number
): number {
  if (value === undefined) return defaultValue;
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError(`"${name}" must be a positive whole number. Got: ${value}`);
  }
  return value;
}
