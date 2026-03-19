import type { ValidationErrorDetail } from '@/types/deployment.types';

export class ApiError extends Error {
  status: number;
  details: ValidationErrorDetail[];

  constructor(status: number, message: string, details: ValidationErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    let message = `Request failed with status ${response.status}`;
    let details: ValidationErrorDetail[] = [];

    try {
      const body = await response.json();
      if (body.message) message = body.message;
      if (body.detail && typeof body.detail === 'string') message = body.detail;
      if (body.details && Array.isArray(body.details)) details = body.details;
      // FastAPI validation errors
      if (body.detail && Array.isArray(body.detail)) {
        details = body.detail.map((d: { loc?: string[]; msg?: string }) => ({
          field: d.loc?.slice(1).join('.') ?? '',
          message: d.msg ?? '',
        }));
      }
    } catch {
      // body is not JSON
    }

    return new ApiError(response.status, message, details);
  }
}
