const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'
).replace(/\/$/, '');

// ── Types ────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: string;
  email: string;
  lat: number | null;
  lon: number | null;
  createdAt: string;
}

export interface ApiItemColor {
  hex: string;
  proportion: number;
}

export interface ApiItem {
  id: string;
  userId: string;
  originalImageUrl: string;
  cutoutImageUrl: string | null;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  colors: ApiItemColor[] | null;
  formality: number | null;
  warmth: number | null;
  seasons: string[] | null;
  styleGenres: string[] | null;
  pattern: string | null;
  material: string | null;
  wearCount: number;
  lastWornAt: string | null;
  procStatus: 'processing' | 'ready' | 'failed';
  procError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError extends Error {
  code: string;
  status: number;
}

export type ItemPatch = Partial<{
  name: string;
  category: string;
  subcategory: string;
  brand: string;
  formality: number;
  warmth: number;
  seasons: string[];
  styleGenres: string[];
  pattern: string;
  material: string;
}>;

// ── Client ───────────────────────────────────────────────────────────────────

class ApiClient {
  private token: string | null = null;
  private onUnauthorized?: () => void;

  setToken(token: string | null): void {
    this.token = token;
  }

  setUnauthorizedHandler(fn: () => void): void {
    this.onUnauthorized = fn;
  }

  private bearerHeader(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const authHeaders = this.bearerHeader();
    // TODO: remove before shipping
    console.log(`[api] ${method} ${path} — auth:`, Object.keys(authHeaders).length ? 'Bearer ***' : 'none');
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    // TODO: remove before shipping
    console.log(`[api] ${method} ${path} — status: ${res.status}`);

    if (res.status === 401) {
      this.onUnauthorized?.();
    }

    if (!res.ok) {
      const payload = await res.json().catch(() => ({
        error: 'Request failed',
        code: 'UNKNOWN',
      })) as { error: string; code: string };
      const err = new Error(payload.error) as ApiError;
      err.code = payload.code;
      err.status = res.status;
      throw err;
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(
    email: string,
    password: string,
  ): Promise<{ user: ApiUser; token: string }> {
    const data = await this.request<{ user: ApiUser; token: string }>(
      'POST',
      '/auth/login',
      { email, password },
    );
    // TODO: remove before shipping
    console.log('[api.login] response:', JSON.stringify(data));
    return data;
  }

  async signup(
    email: string,
    password: string,
  ): Promise<{ user: ApiUser; token: string }> {
    const data = await this.request<{ user: ApiUser; token: string }>(
      'POST',
      '/auth/signup',
      { email, password },
    );
    return data;
  }

  async logout(): Promise<void> {
    await this.request('POST', '/auth/logout').catch(() => {});
  }

  async me(): Promise<ApiUser> {
    const data = await this.request<{ user: ApiUser }>('GET', '/auth/me');
    return data.user;
  }

  async updateLocation(lat: number, lon: number): Promise<ApiUser> {
    const data = await this.request<{ user: ApiUser }>('PATCH', '/auth/me', {
      lat,
      lon,
    });
    return data.user;
  }

  // ── Items ─────────────────────────────────────────────────────────────────

  async listItems(params?: {
    category?: string;
    season?: string;
    q?: string;
  }): Promise<{ items: ApiItem[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.season) qs.set('season', params.season);
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.request('GET', `/items${suffix}`);
  }

  async getItem(id: string): Promise<ApiItem> {
    const data = await this.request<{ item: ApiItem }>('GET', `/items/${id}`);
    return data.item;
  }

  async uploadItem(
    photoUri: string,
  ): Promise<{ id: string; procStatus: string }> {
    const form = new FormData();
    form.append('photo', {
      uri: photoUri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);

    const res = await fetch(`${BASE_URL}/items`, {
      method: 'POST',
      headers: this.bearerHeader(),
      body: form,
    });

    if (res.status === 401) this.onUnauthorized?.();

    if (!res.ok) {
      const payload = await res.json().catch(() => ({
        error: 'Upload failed',
        code: 'UNKNOWN',
      })) as { error: string; code: string };
      const err = new Error(payload.error) as ApiError;
      err.code = payload.code;
      err.status = res.status;
      throw err;
    }

    return res.json();
  }

  async patchItem(id: string, updates: ItemPatch): Promise<ApiItem> {
    const data = await this.request<{ item: ApiItem }>(
      'PATCH',
      `/items/${id}`,
      updates,
    );
    return data.item;
  }

  async deleteItem(id: string): Promise<void> {
    await this.request('DELETE', `/items/${id}`);
  }
}

export const api = new ApiClient();
