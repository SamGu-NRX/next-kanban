"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  /** Only class-based theming is supported: the resolved theme is applied to <html> as a class. */
  attribute?: "class";
  defaultTheme?: Theme;
  storageKey?: string;
  /** When true, the "system" theme follows the OS preference, including live changes. */
  enableSystem?: boolean;
  /** Temporarily suppresses CSS transitions while switching themes to avoid flicker. */
  disableTransitionOnChange?: boolean;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const initialState = {
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => null,
} satisfies ThemeProviderState;

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(theme: Theme, enableSystem: boolean): "light" | "dark" {
  if (theme === "system") {
    // With the system preference disabled, "system" resolves to the default light look.
    return enableSystem ? getSystemTheme() : "light";
  }
  return theme;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  enableSystem = true,
  disableTransitionOnChange = false,
  // "attribute" is accepted for compatibility with the next-themes-style call
  // in app/layout.tsx; class-based theming is the only supported mode.
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Once mounted on the client we can read the stored preference.
    let storedTheme: string | null = null;
    try {
      storedTheme = localStorage.getItem(storageKey);
    } catch {
      // Storage unavailable (privacy mode): fall back to the default theme.
      console.warn(`Theme preference could not be read from storage key "${storageKey}".`);
    }
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      setThemeState(storedTheme);
    }
  }, [storageKey]);

  useEffect(() => {
    const root = window.document.documentElement;

    const apply = () => {
      const resolved = resolveTheme(theme, enableSystem);
      root.classList.remove("light", "dark");
      root.classList.add(resolved);
      setResolvedTheme(resolved);
    };

    if (disableTransitionOnChange) {
      const style = window.document.createElement("style");
      style.textContent = "*,*::before,*::after{transition:none!important}";
      window.document.head.appendChild(style);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => style.remove());
      });
      apply();
      return () => window.cancelAnimationFrame(frame);
    }

    apply();
  }, [theme, enableSystem, disableTransitionOnChange]);

  useEffect(() => {
    if (!enableSystem || theme !== "system") return;
    // Follow live OS preference changes while on the system theme.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved = media.matches ? "dark" : "light";
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(resolved);
      setResolvedTheme(resolved);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, enableSystem]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (next: Theme) => {
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          console.warn(`Theme preference could not be saved to storage key "${storageKey}".`);
        }
        setThemeState(next);
      },
    }),
    [theme, resolvedTheme, storageKey]
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
