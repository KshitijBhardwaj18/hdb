import { isAxiosError } from 'axios';
import type { AxiosError } from 'axios';

/**
 * Machine-readable error codes from the backend.
 * Must stay in sync with api/models.py → ErrorCode.
 */
export type ApiErrorCode =
  | 'DEPLOYMENT_IN_PROGRESS'
  | 'DEPLOYMENT_DESTROYING'
  | 'DEPLOYMENT_NOT_FOUND'
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_LOCKED'
  | 'CONFIG_EXISTS'
  | 'OPERATION_LOCKED'
  | 'INVALID_TRANSITION'
  | 'QUOTA_EXCEEDED'
  | 'ALREADY_DESTROYED'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

/**
 * User-friendly messages for each error code.
 * Shown in toasts / inline errors — keep them short and actionable.
 */
const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  DEPLOYMENT_IN_PROGRESS:
    'A deployment is already running. Wait for it to finish before starting another.',
  DEPLOYMENT_DESTROYING:
    'This deployment is being destroyed. Wait for it to complete.',
  DEPLOYMENT_NOT_FOUND: 'Deployment not found.',
  CONFIG_NOT_FOUND: 'Configuration not found. Create one first.',
  CONFIG_LOCKED:
    'This configuration cannot be changed while a deployment is in progress.',
  CONFIG_EXISTS: 'A configuration with this ID already exists.',
  OPERATION_LOCKED:
    'Another operation is running on this stack. Please wait.',
  INVALID_TRANSITION: 'This action is not allowed in the current state.',
  QUOTA_EXCEEDED:
    'You have reached the maximum number of active deployments. Destroy one first.',
  ALREADY_DESTROYED: 'This deployment has already been destroyed.',
  VALIDATION_ERROR: 'Validation error — check your configuration.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again.',
};

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  serverMessage: string;

  constructor(status: number, code: ApiErrorCode | string, serverMessage: string) {
    // Use user-friendly message if we recognise the code, otherwise fall back
    const friendly =
      ERROR_MESSAGES[code as ApiErrorCode] ?? serverMessage ?? 'Something went wrong';
    super(friendly);
    this.name = 'ApiError';
    this.status = status;
    this.code = (code || 'INTERNAL_ERROR') as ApiErrorCode;
    this.serverMessage = serverMessage;
  }

  /** True when the user simply needs to wait (lock / in-progress errors). */
  get isRetryable(): boolean {
    return (
      this.code === 'DEPLOYMENT_IN_PROGRESS' ||
      this.code === 'DEPLOYMENT_DESTROYING' ||
      this.code === 'OPERATION_LOCKED'
    );
  }

  /** True when the session is expired / invalid. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /**
   * Build an ApiError from an Axios error, parsing the structured backend
   * response if present.
   */
  static fromAxiosError(err: AxiosError): ApiError {
    const status = err.response?.status ?? 0;
    const data = err.response?.data as Record<string, unknown> | undefined;

    if (!data) {
      return new ApiError(status, 'INTERNAL_ERROR', err.message || 'Network error');
    }

    // Structured error from our backend: { code, message, details? }
    if (typeof data.code === 'string' && typeof data.message === 'string') {
      return new ApiError(status, data.code, data.message);
    }

    // FastAPI HTTPException: { detail: string | object }
    const detail = data.detail;
    if (detail && typeof detail === 'object' && 'code' in (detail as Record<string, unknown>)) {
      const d = detail as Record<string, string>;
      return new ApiError(status, d.code ?? 'INTERNAL_ERROR', d.message ?? 'Request failed');
    }
    if (typeof detail === 'string') {
      return new ApiError(status, 'INTERNAL_ERROR', detail);
    }

    // FastAPI validation errors: { detail: [{loc, msg}] }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((d: { msg?: string }) => d.msg)
        .filter(Boolean)
        .join('; ');
      return new ApiError(status, 'VALIDATION_ERROR', messages || 'Validation error');
    }

    // Generic message field
    const message = (data.message as string) || 'Something went wrong';
    return new ApiError(status, 'INTERNAL_ERROR', message);
  }
}
