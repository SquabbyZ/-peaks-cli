export type ResultEnvelope<T> = {
  ok: boolean;
  command: string;
  data: T;
  warnings: string[];
  nextActions: string[];
  code?: string;
  message?: string;
};

export function ok<T>(command: string, data: T, warnings: string[] = [], nextActions: string[] = []): ResultEnvelope<T> {
  return { ok: true, command, data, warnings, nextActions };
}

export function fail<T>(command: string, code: string, message: string, data: T, nextActions: string[] = []): ResultEnvelope<T> {
  return { ok: false, command, code, message, data, warnings: [], nextActions };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unexpected error';
}
