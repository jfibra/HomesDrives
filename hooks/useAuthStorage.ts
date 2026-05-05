"use client";

import { useCallback } from "react";

export function useAuthStorage() {
  const login = useCallback((token: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("auth_token", token);
      // Trigger a storage event to update all components
      window.dispatchEvent(new Event("auth-change"));
    }
  }, []);

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
      window.dispatchEvent(new Event("auth-change"));
    }
  }, []);

  return { login, logout };
}
