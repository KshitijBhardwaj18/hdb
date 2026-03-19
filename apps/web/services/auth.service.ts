import type { AuthContextType } from '@repo/shared-types/types';
import { ApiClient } from '@/lib/api-client';

export interface LoginInput {
  email: string;
  password?: string;
  idToken?: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password?: string;
}

interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string;
  };
}

export class AuthService {
  static async login(data: LoginInput) {
    return await ApiClient.post<LoginResponse>('/api/auth/password-login', data);
  }

  static async register(data: RegisterInput) {
    return await ApiClient.post<LoginResponse>('/api/auth/password-register', data);
  }

  static async handleGoogleAuth(idToken: string) {
    return await ApiClient.post<LoginResponse>('/api/auth/google', { idToken });
  }

  static async me() {
    return await ApiClient.get<AuthContextType>('/api/auth/me');
  }
}
