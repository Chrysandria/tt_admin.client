export interface User {
  id: string;
  email: string;
  nom: string;
  profil: string;
  type: "admin" | "user";
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  nom: string;
  prix: string;
  imageUrl: string | null;
  initial: number;
  available: number;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = "reserved" | "payed" | "canceled";

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
  product: Product;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"
).replace(/\/$/, "");

export function apiAssetUrl(path: string): string;
export function apiAssetUrl(path: null): null;
export function apiAssetUrl(path: string | null): string | null;
export function apiAssetUrl(path: string | null): string | null {
  if (!path) return null;
  return `${API_URL}${path}`;
}

async function fetchApi(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(
      `Impossible de joindre l’API (${API_URL}). Vérifiez que le serveur NestJS est démarré.`,
      0,
    );
  }
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null || !("message" in payload)) {
    return fallback;
  }
  const message = payload.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.filter((item) => typeof item === "string").join(", ");
  return fallback;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfResponse = await fetchApi(`${API_URL}/auth/csrf-token`, {
      credentials: "include",
      cache: "no-store",
    });
    const csrfPayload = await readResponse(csrfResponse);
    if (!csrfResponse.ok) {
      throw new ApiError(
        getErrorMessage(csrfPayload, "Impossible de sécuriser la requête."),
        csrfResponse.status,
      );
    }

    if (
      typeof csrfPayload !== "object" ||
      csrfPayload === null ||
      !("csrfToken" in csrfPayload) ||
      typeof csrfPayload.csrfToken !== "string"
    ) {
      throw new ApiError("Le serveur n’a pas fourni de jeton CSRF valide.", 500);
    }
    headers.set("X-CSRF-Token", csrfPayload.csrfToken);
  }

  const response = await fetchApi(`${API_URL}${path}`, {
    ...init,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const payload = await readResponse(response);

  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(payload, "La requête a échoué. Réessayez."),
      response.status,
    );
  }
  return payload as T;
}
