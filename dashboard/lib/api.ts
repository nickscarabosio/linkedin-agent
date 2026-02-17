import axios, { AxiosInstance } from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

let apiInstance: AxiosInstance | null = null;

export function getApiClient(): AxiosInstance {
  if (!apiInstance) {
    apiInstance = axios.create({
      baseURL: API_URL,
      timeout: 15000,
    });

    // Attach token from localStorage on each request
    apiInstance.interceptors.request.use((config) => {
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("accessToken");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    });

    // Auto-refresh on 401
    apiInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const refreshToken = localStorage.getItem("refreshToken");
            if (!refreshToken) throw new Error("No refresh token");

            const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {
              refreshToken,
            });

            localStorage.setItem("accessToken", data.accessToken);
            localStorage.setItem("refreshToken", data.refreshToken);

            originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
            return apiInstance!(originalRequest);
          } catch {
            // Refresh failed — clear tokens and redirect to login
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("user");
            if (typeof window !== "undefined") {
              window.location.href = "/login";
            }
          }
        }
        return Promise.reject(error);
      }
    );
  }

  return apiInstance;
}
