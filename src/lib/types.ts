import type { Plan, Scores } from "./rules";

export type Analysis = {
  scores: Scores;
  masks: Record<string, string>; // data URLs (or static paths for samples)
  tone: { skin_color: string; eye_color: string; lip_color: string; eyebrow_color: string };
  quality: Record<string, string | boolean> | null;
  overall?: number;
  skinAge?: number;
  photo?: string; // exact image analysed (after on-device crop + server upscaling)
  prep?: { width: number; height: number; upscale: "none" | "ai-enhance" | "resample"; enhanceScale: number | null };
  plan: Plan;
};

export type Render = { url?: string; dataUrl: string };

export type SampleBundle = {
  id: string;
  label: string;
  blurb: string;
  photo: string;
  analysis: Analysis;
  heavy: string;
  steps: string[];
};
