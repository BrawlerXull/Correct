"use client";
// A pretend retailer page showing how a store drops CORRECT in with one <script> tag and receives SKUs back.
import Script from "next/script";
import { useEffect, useState } from "react";

type Item = { sku: string; name: string; shade: string; price: number; qty: number };
type PlanMsg = { skin: { hex: string; depth: string; undertone: string }; steps: { step: string; shadeHex: string; product: string; productShade: string; sku: string }[] };

const SNIPPET = `<!-- 1. Add the button anywhere on a product page -->
<div id="correct-slot"></div>
<script src="https://correct-youcam.vercel.app/widget.js"
        data-target="#correct-slot"
        data-label="Find my corrector shade" async></script>

<!-- 2. Receive the matched SKUs -->
<script>
  window.addEventListener("correct:add-to-bag", (e) => {
    e.detail.items.forEach((i) => myCart.add(i.sku, i.qty));
  });
</script>`;

export default function StoreDemo() {
  const [cart, setCart] = useState<Item[]>([]);
  const [plan, setPlan] = useState<PlanMsg | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onBag = (e: Event) => {
      const items = (e as CustomEvent<{ items: Item[] }>).detail.items || [];
      setCart((c) => {
        const next = [...c];
        for (const it of items) {
          const ex = next.find((x) => x.sku === it.sku);
          if (ex) ex.qty += it.qty;
          else next.push({ ...it });
        }
        return next;
      });
      setToast(`${items.length} matched products added to your bag`);
      setTimeout(() => setToast(null), 3000);
      (window as unknown as { CorrectWidget?: { close: () => void } }).CorrectWidget?.close();
    };
    const onPlan = (e: Event) => setPlan((e as CustomEvent<PlanMsg>).detail);
    window.addEventListener("correct:add-to-bag", onBag);
    window.addEventListener("correct:plan", onPlan);
    return () => {
      window.removeEventListener("correct:add-to-bag", onBag);
      window.removeEventListener("correct:plan", onPlan);
    };
  }, []);

  const count = cart.reduce((a, i) => a + i.qty, 0);
  const total = cart.reduce((a, i) => a + i.qty * i.price, 0);

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f]" style={{ fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <div className="bg-[#2A2320] text-white text-center text-xs py-2 px-4">
        Demo store (fictional) – shows how any retailer embeds CORRECT. <a href="/" className="underline">Back to CORRECT</a>
      </div>
      <header className="border-b border-gray-200">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <span className="text-xl font-semibold tracking-[0.2em]">HUE THEORY</span>
          <nav className="hidden sm:flex gap-6 text-sm text-gray-600" aria-label="Store">
            <span>Face</span>
            <span>Correctors</span>
            <span>Skin tints</span>
          </nav>
          <span className="relative text-sm font-medium" aria-live="polite">
            Bag ({count})
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 grid md:grid-cols-2 gap-10">
        <div className="rounded-2xl bg-gradient-to-br from-[#E3EDDF] via-[#F8E5D6] to-[#F4DDE0] aspect-square grid place-items-center">
          <div className="flex gap-4" aria-hidden>
            {["#B9D9A9", "#9CB585", "#7F8452", "#EEB497", "#D3864E", "#94442A"].map((c) => (
              <span key={c} className="h-16 w-8 rounded-full shadow-md" style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-500">Hue Theory</p>
          <h1 className="text-3xl font-semibold mt-1">Colour Corrector Collection</h1>
          <p className="mt-2 text-lg">$14 – $24</p>
          <p className="mt-4 text-gray-700 leading-relaxed">
            Green primers for redness, and peach-to-brick correctors for dark circles and dark spots, in 6 depths. Not sure which shade is yours?
          </p>

          <div id="correct-slot" className="mt-6 min-h-[50px]" />
          <p className="mt-2 text-xs text-gray-500">Takes one selfie · matched to this store’s shades · your photo is never shared with the store</p>

          {plan && (
            <div className="mt-6 rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-medium">
                Your match:{" "}
                <span className="inline-block h-3 w-3 rounded-full align-middle border" style={{ background: plan.skin.hex }} /> {plan.skin.depth} skin, {plan.skin.undertone} undertone
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                {plan.steps.map((s) => (
                  <li key={s.sku} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border" style={{ background: s.shadeHex }} aria-hidden />
                    {s.product} – {s.productShade}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cart.length > 0 && (
            <div className="mt-6 rounded-xl bg-gray-50 p-4">
              <p className="font-medium">Your bag</p>
              <ul className="mt-2 text-sm divide-y divide-gray-200">
                {cart.map((i) => (
                  <li key={i.sku} className="py-1.5 flex justify-between gap-3">
                    <span>
                      {i.name} · {i.shade} <span className="text-gray-400">({i.sku})</span>
                    </span>
                    <span>
                      {i.qty} × ${i.price}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-right font-medium">Total ${total}</p>
            </div>
          )}
        </div>
      </main>

      <section className="mx-auto max-w-6xl px-4 pb-16" aria-labelledby="dev">
        <h2 id="dev" className="text-lg font-semibold">
          For developers: the whole integration
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          One script tag adds the button. The widget runs CORRECT in a sandboxed overlay and sends back only shade hexes and SKUs (never the photo). Events: <code>correct:plan</code>,{" "}
          <code>correct:add-to-bag</code>, <code>correct:close</code>.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-[#1d1d1f] text-[#e8e8e8] p-4 text-xs leading-relaxed">
          <code>{SNIPPET}</code>
        </pre>
      </section>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-[#2A2320] text-white px-5 py-3 text-sm shadow-xl">
          ✓ {toast}
        </div>
      )}

      <Script src="/widget.js" strategy="afterInteractive" data-target="#correct-slot" data-label="Find my corrector shade" />
    </div>
  );
}
