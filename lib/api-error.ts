export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown, message?: string) {
    super(
      message ||
        (typeof detail === 'string' ? detail : `API request failed with status ${status}`)
    );
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  workspaceId?: string;
  signal?: AbortSignal;
};
