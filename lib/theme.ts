export type Theme = "dark" | "light";

export const THEME_COOKIE = "theme";
export const DEFAULT_THEME: Theme = "dark";

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" ? value : DEFAULT_THEME;
}
