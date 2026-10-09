let token: string | null = null;
export const setAccessToken = (value: string | null) => {
  token = value;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields?: { fieldErrors?: Record<string, string[]> },
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    draftToken?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.draftToken) headers["X-Draft-Token"] = options.draftToken;
  const isForm = options.body instanceof FormData;
  if (options.body && !isForm) headers["Content-Type"] = "application/json";
  const base =
    (import.meta as ImportMeta & { env: Record<string, string> }).env
      .VITE_API_URL ?? "";
  const response = await fetch(`${base}/api/v1${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body
      ? isForm
        ? (options.body as FormData)
        : JSON.stringify(options.body)
      : undefined,
    signal: options.signal,
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      data?.error?.message ?? "Não foi possível conectar. Tente novamente.",
      response.status,
      data?.error?.fields,
    );
  return data as T;
}
