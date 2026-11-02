"use client";
// Accessibility & language preferences, saved on this device and applied to <html> so CSS can react.
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const LANGS = [
  { code: "en", label: "English", bcp: "en-US" },
  { code: "es", label: "Español", bcp: "es-ES" },
  { code: "pt", label: "Português", bcp: "pt-BR" },
  { code: "fr", label: "Français", bcp: "fr-FR" },
  { code: "de", label: "Deutsch", bcp: "de-DE" },
  { code: "hi", label: "हिन्दी", bcp: "hi-IN" },
  { code: "ar", label: "العربية", bcp: "ar-SA" },
  { code: "id", label: "Bahasa Indonesia", bcp: "id-ID" },
  { code: "zh", label: "中文", bcp: "zh-CN" },
  { code: "ja", label: "日本語", bcp: "ja-JP" },
  { code: "ko", label: "한국어", bcp: "ko-KR" },
] as const;
export type LangCode = (typeof LANGS)[number]["code"];
export const langInfo = (c: string) => LANGS.find((l) => l.code === c) || LANGS[0];

export type Prefs = {
  lang: LangCode;
  textSize: "normal" | "large" | "xl";
  contrast: "normal" | "high";
  voiceTips: boolean; // speak camera guidance
  autoRead: boolean; // read coach answers aloud automatically
};
const DEFAULTS: Prefs = { lang: "en", textSize: "normal", contrast: "normal", voiceTips: false, autoRead: false };
const KEY = "correct-prefs-v1";

type Ctx = { prefs: Prefs; set: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void };
const PrefsCtx = createContext<Ctx>({ prefs: DEFAULTS, set: () => {} });

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved) setPrefs({ ...DEFAULTS, ...saved });
      else {
        // First visit: follow the browser language if we support it.
        const nav = (navigator.language || "en").slice(0, 2);
        if (LANGS.some((l) => l.code === nav)) setPrefs((p) => ({ ...p, lang: nav as LangCode }));
      }
    } catch {
      /* storage blocked – defaults are fine */
    }
  }, []);

  useEffect(() => {
    const h = document.documentElement;
    h.dataset.textsize = prefs.textSize;
    h.dataset.contrast = prefs.contrast;
    h.lang = prefs.lang;
  }, [prefs]);

  const set = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [k]: v };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return <PrefsCtx.Provider value={{ prefs, set }}>{children}</PrefsCtx.Provider>;
}

export const usePrefs = () => useContext(PrefsCtx);
