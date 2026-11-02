// "Shop this routine": turns each matched step into a store search for that product type and shade family.
// Plain search links – no affiliate tags, no sponsorship.
import type { Step } from "./rules";

export const STORES = [
  { id: "sephora", name: "Sephora", url: (q: string) => `https://www.sephora.com/search?keyword=${encodeURIComponent(q)}` },
  { id: "ulta", name: "Ulta", url: (q: string) => `https://www.ulta.com/search?search=${encodeURIComponent(q)}` },
  { id: "amazon", name: "Amazon", url: (q: string) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}` },
  { id: "nykaa", name: "Nykaa", url: (q: string) => `https://www.nykaa.com/search/result/?q=${encodeURIComponent(q)}` },
] as const;

/** A short, store-friendly search phrase for a routine step. */
export function searchQuery(step: Step, depthLabel: string, undertone: string) {
  if (step.id === "green") return "green color correcting primer";
  if (step.id === "peach") {
    const fam = step.colorName.replace("-", " "); // e.g. "pink bisque", "red orange"
    return `${fam} color corrector ${step.title.toLowerCase().includes("circle") ? "under eye" : "dark spots"}`;
  }
  return `skin tint ${depthLabel.toLowerCase()} ${undertone} undertone`;
}
