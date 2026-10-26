import axios from "axios";
import { supabase } from "@/lib/supabase";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000, // 30 seconds timeout to prevent indefinite hangs
});

api.interceptors.request.use(async (config) => {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (accessToken) {
      config.headers.set("Authorization", `Bearer ${accessToken}`);
    }
  } catch {
    // Public requests can continue; protected routes fail closed with 401.
  }
  return config;
});

export default api;
