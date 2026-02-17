import axios from "axios";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private apiUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private user: LoginResponse["user"] | null = null;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await axios.post<LoginResponse>(`${this.apiUrl}/api/auth/login`, {
      email,
      password,
    });

    this.accessToken = response.data.accessToken;
    this.refreshToken = response.data.refreshToken;
    this.user = response.data.user;

    return response.data;
  }

  async refresh(): Promise<TokenPair> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await axios.post<TokenPair>(`${this.apiUrl}/api/auth/refresh`, {
      refreshToken: this.refreshToken,
    });

    this.accessToken = response.data.accessToken;
    this.refreshToken = response.data.refreshToken;

    return response.data;
  }

  getAccessToken(): string {
    if (!this.accessToken) {
      throw new Error("Not authenticated. Call login() first.");
    }
    return this.accessToken;
  }

  getUser(): LoginResponse["user"] {
    if (!this.user) {
      throw new Error("Not authenticated. Call login() first.");
    }
    return this.user;
  }

  getUserId(): string {
    return this.getUser().id;
  }
}
