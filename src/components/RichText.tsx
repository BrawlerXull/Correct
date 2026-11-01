"use client";
// Minimal, safe formatter for coach answers: paragraphs, "-"/"*"/"1." lists, **bold**, and #RRGGBB → colour swatch.
// No HTML is ever injected – everything is rendered as React text nodes.
import { Fragment, ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|#[0-9a-fA-F]{6}\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={`${keyBase}-t${i++}`}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(
        <strong key={`${keyBase}-b${i++}`} className="font-semibold text-ink">
          {inline(tok.slice(2, -2), `${keyBase}-b${i}`)}
        </strong>
      );
    } else {
      out.push(
        <span key={`${keyBase}-c${i++}`} className="inline-flex items-center gap-1 rounded-md bg-white/70 px-1.5 py-0.5 align-middle text-[0.85em] font-mono">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full border border-black/10" style={{ background: tok }} />
          {tok.toUpperCase()}
        </span>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<Fragment key={`${keyBase}-t${i++}`}>{text.slice(last)}</Fragment>);
  return out;
}

export default function RichText({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(
        <p key={k} className="leading-relaxed">
          {inline(para.join(" "), k)}
        </p>
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((it, i) => (
        <li key={`${k}-${i}`} className="pl-1 leading-relaxed">
          {inline(it, `${k}-${i}`)}
        </li>
      ));
      blocks.push(
        list.ordered ? (
          <ol key={k} className="list-decimal pl-5 space-y-1.5 marker:text-rose marker:font-medium">
            {items}
          </ol>
        ) : (
          <ul key={k} className="list-disc pl-5 space-y-1.5 marker:text-rose">
            {items}
          </ul>
        )
      );
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trim().replace(/^#{1,6}\s+/, ""); // drop markdown headings, keep text
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (!line) {
      flushPara();
      flushList();
    } else if (bullet || num) {
      flushPara();
      const ordered = !!num;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet || num)![1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className={`space-y-3 ${className}`}>{blocks}</div>;
}
