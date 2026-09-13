export const CARD_LANGUAGES = [
  { code: "en", en: "English", es: "Inglés" },
  { code: "es", en: "Spanish", es: "Español" },
  { code: "fr", en: "French", es: "Francés" },
  { code: "de", en: "German", es: "Alemán" },
  { code: "it", en: "Italian", es: "Italiano" },
  { code: "pt", en: "Portuguese", es: "Portugués" },
  { code: "ja", en: "Japanese", es: "Japonés" },
  { code: "ko", en: "Korean", es: "Coreano" },
  { code: "ru", en: "Russian", es: "Ruso" },
  { code: "zhs", en: "Simplified Chinese", es: "Chino simplificado" },
  { code: "zht", en: "Traditional Chinese", es: "Chino tradicional" },
] as const;

export type CardLanguage = (typeof CARD_LANGUAGES)[number]["code"];

export const isCardLanguage = (value: unknown): value is CardLanguage =>
  typeof value === "string" &&
  CARD_LANGUAGES.some((language) => language.code === value);
