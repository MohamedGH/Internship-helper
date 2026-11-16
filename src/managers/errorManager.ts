import { AppError, ErrorSeverity } from '../types/domain';

export type ErrorAction =
  | { readonly type: 'ADD_ERROR'; readonly error: AppError }
  | { readonly type: 'DISMISS_ERROR'; readonly id: string }
  | { readonly type: 'CLEAR_ERRORS' };

export interface CreateErrorInput {
  readonly code: string;
  readonly severity: ErrorSeverity;
  readonly message: string;
  readonly detail?: string;
  readonly retryable?: boolean;
  readonly context?: string;
  readonly now?: Date;
}

const MAX_RETAINED_ERRORS = 4;

export const createAppError = (input: CreateErrorInput): AppError => {
  const now = input.now ?? new Date();
  const suffix = Math.random().toString(36).slice(2, 7);
  return {
    id: `err_${now.getTime()}_${suffix}`,
    code: input.code,
    severity: input.severity,
    message: input.message.trim() || 'An unexpected error occurred.',
    detail: input.detail?.trim() || undefined,
    retryable: input.retryable ?? input.severity !== ErrorSeverity.Validation,
    timestamp: now.toISOString(),
    context: input.context,
  };
};

export const normalizeUnknownError = (
  err: unknown,
  context: string,
  fallbackMessage = 'Operation failed. Please try again.'
): AppError => {
  if (isAppError(err)) {
    return err;
  }

  if (err instanceof Error) {
    const lower = err.message.toLowerCase();
    const isNetwork =
      lower.includes('network') ||
      lower.includes('failed to fetch') ||
      lower.includes('timeout') ||
      lower.includes('econnrefused');

    const isQuota = lower.includes('429') || lower.includes('resource_exhausted');
    const isAuth = lower.includes('403') || lower.includes('api_key');

    const severity = isNetwork ? ErrorSeverity.Network : ErrorSeverity.Api;
    const detail = isQuota
      ? 'Rate limit or quota reached. Wait a moment before retrying.'
      : isAuth
        ? 'Server configuration issue detected. Check Settings > Secrets.'
        : err.message;

    return createAppError({
      code: isNetwork ? 'NETWORK_ERROR' : isQuota ? 'RATE_LIMIT' : 'RUNTIME_ERROR',
      severity,
      message: fallbackMessage,
      detail,
      retryable: !isAuth,
      context,
    });
  }

  if (typeof err === 'string' && err.trim().length > 0) {
    return createAppError({
      code: 'STRING_ERROR',
      severity: ErrorSeverity.Api,
      message: err.trim(),
      retryable: true,
      context,
    });
  }

  return createAppError({
    code: 'UNKNOWN_ERROR',
    severity: ErrorSeverity.Api,
    message: fallbackMessage,
    retryable: true,
    context,
  });
};

export const isAppError = (value: unknown): value is AppError => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.severity === 'string'
  );
};

export const getSeverityLabel = (severity: ErrorSeverity): string => {
  switch (severity) {
    case ErrorSeverity.Validation:
      return 'Input Required';
    case ErrorSeverity.Network:
      return 'Connection Issue';
    case ErrorSeverity.Dispatch:
      return 'Dispatch Blocked';
    case ErrorSeverity.Api:
    default:
      return 'Service Error';
  }
};

export const errorReducer = (
  errors: readonly AppError[],
  action: ErrorAction
): readonly AppError[] => {
  switch (action.type) {
    case 'ADD_ERROR': {
      const deduplicated = errors.filter(
        (existing) =>
          !(existing.code === action.error.code && existing.message === action.error.message)
      );
      return [action.error, ...deduplicated].slice(0, MAX_RETAINED_ERRORS);
    }
    case 'DISMISS_ERROR':
      return errors.filter((item) => item.id !== action.id);
    case 'CLEAR_ERRORS':
      return [];
    default:
      return errors;
  }
};

export const parseApiErrorResponse = async (
  response: Response,
  context: string
): Promise<AppError> => {
  let serverMessage = `Request failed with status ${response.status}`;
  let serverCode = `HTTP_${response.status}`;

  try {
    const body = (await response.json()) as { error?: string; code?: string; detail?: string };
    if (body.error) {
      serverMessage = body.error;
    }
    if (body.code) {
      serverCode = body.code;
    }
    return createAppError({
      code: serverCode,
      severity: response.status >= 400 && response.status < 500 ? ErrorSeverity.Validation : ErrorSeverity.Api,
      message: serverMessage,
      detail: body.detail,
      retryable: response.status >= 500 || response.status === 429,
      context,
    });
  } catch {
    return createAppError({
      code: serverCode,
      severity: ErrorSeverity.Api,
      message: serverMessage,
      retryable: response.status >= 500,
      context,
    });
  }
};
