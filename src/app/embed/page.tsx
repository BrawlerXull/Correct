import type { Metadata } from "next";
import CorrectApp from "@/components/CorrectApp";

export const metadata: Metadata = { title: "CORRECT · shade finder", robots: { index: false } };

/** The compact version of CORRECT that stores load inside their own product pages via /widget.js. */
export default function EmbedPage() {
  return <CorrectApp embed />;
}
