"use client";
import { SessionProvider } from "next-auth/react";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const saved = (localStorage.getItem("theme") as "light" | "dark") || "light";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);
  return (
    <SessionProvider>
      <ThemeContext.Provider value={{ theme, setTheme: (t) => { setTheme(t); localStorage.setItem("theme", t); document.documentElement.classList.toggle("dark", t === "dark"); } }}>
        {children}
      </ThemeContext.Provider>
    </SessionProvider>
  );
}

import { createContext, useContext } from "react";
export const ThemeContext = createContext<{ theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void }>({
  theme: "light",
  setTheme: () => {},
});
export const useTheme = () => useContext(ThemeContext);
