"use client";
// "My scans": a small history kept ONLY in this browser (localStorage) – a tiny thumbnail plus the scores,
// so people can see whether redness / dark circles change over weeks (e.g. while trying a new skincare product).
import type { Plan } from "./rules";

export type ScanEntry = {
  id: string;
  at: number;
  thumb: string; // ~120px JPEG data URL
  skinHex: string;
  depthLabel: string;
  undertone: string;
  fitzpatrick: string | null;
  scores: Record<string, number>; // YouCam ui_score, higher = healthier
};

const KEY = "correct-history-v1";
const MAX = 12;

export function loadHistory(): ScanEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function persist(list: ScanEntry[]) {
  // Drop the oldest entries until it fits (localStorage quotas are ~5 MB).
  for (let n = list.length; n > 0; n--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, n)));
      return list.slice(0, n);
    } catch {}
  }
  return [];
}

async function thumbOf(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = 120, h = Math.round((120 * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.7);
}

export async function saveScan(photo: string, plan: Plan, scores: Record<string, number>): Promise<{ list: ScanEntry[]; entry: ScanEntry }> {
  const entry: ScanEntry = {
    id: Math.random().toString(36).slice(2),
    at: Date.now(),
    thumb: await thumbOf(photo),
    skinHex: plan.profile.skinHex,
    depthLabel: plan.profile.depthLabel,
    undertone: plan.profile.undertone,
    fitzpatrick: plan.profile.fitzpatrick,
    scores,
  };
  const list = persist([entry, ...loadHistory()].slice(0, MAX));
  return { list, entry };
}

export function deleteScan(id: string) {
  return persist(loadHistory().filter((e) => e.id !== id));
}
export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return [] as ScanEntry[];
}
