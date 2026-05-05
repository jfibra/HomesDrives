"use client";

import { useEffect, useState } from "react";

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if auth token exists in localStorage
    const token = localStorage.getItem("auth_token");
    setIsLoggedIn(!!token);
    setIsLoading(false);
    // Listen for auth changes
    const handleAuthChange = () => {
      const token = localStorage.getItem("auth_token");
      setIsLoggedIn(!!token);
    };

    window.addEventListener("auth-change", handleAuthChange);
    return () => {
      window.removeEventListener("auth-change", handleAuthChange);
    };
  }, []);

  return { isLoggedIn, isLoading };
}
