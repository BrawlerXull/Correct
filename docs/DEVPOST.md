# CORRECT: Devpost submission text

**Tagline (≤ 200 chars):**
An AI colour-correction coach: one selfie, read by YouCam Skin AI, tells you which corrector you need, where it goes, and shows it on your own face. Ready for any store.

**Links**
- Live app: https://correct-youcam.vercel.app
- Live sample store (one-line integration): https://correct-youcam.vercel.app/store-demo
- Code: https://github.com/BrawlerXull/Correct
- Demo video: https://youtu.be/SchSyX8BlOo

**Built with:** YouCam Skin Analysis HD, YouCam Skin Tone Analysis, YouCam Fitzpatrick Skin Type, YouCam AI Photo Enhance, YouCam Makeup VTO, YouCam AI Image Generator, Next.js, React, TypeScript, Tailwind CSS, MediaPipe, Gemini, sharp, Vercel, PWA

---

## Inspiration
Redness, dark circles and post-acne marks affect millions of people, and the usual fix is *more foundation*: it looks
heavy, and the colour still shows through. Makeup artists do something smarter: they **cancel** the colour (green
cancels red, peach cancels blue shadow). But you can't swatch a corrector online, most advice is written for fair skin,
and on deeper skin the wrong shade turns ashy. So shoppers guess, and return. We wanted to put a makeup artist's eye
in everyone's pocket, and in every beauty store.

## What it does
1. **Guided selfie.** On-device face detection coaches distance, light and angle, out loud if you like, and captures
   automatically. Any upload works too: CORRECT frames the face and uses **YouCam AI Photo Enhance** to sharpen
   low-resolution photos so the HD analysis never rejects them.
2. **Reads the skin.** **YouCam Skin Analysis HD** scores redness, dark circles, dark spots and blemishes and returns
   pixel-level masks. **Skin Tone Analysis** and the **Fitzpatrick Skin Type** model cross-check depth and undertone,
   so the shades also work on deeper skin.
3. **Colour map.** The masks become a personal "where to apply" map, painted in each corrector's real shade.
4. **Try it on, measured.** **YouCam Makeup VTO** applies the routine layer by layer on your own photo (chained passes),
   next to the usual full-coverage foundation. CORRECT then *measures* how visible each concern still is and reports
   honestly, even when foundation wins. Example: on the redness sample it hides more with 42% coverage than foundation
   does at 95%.
5. **Coach.** An AI coach that knows your scan answers follow-ups in 11 languages, by voice in and out.
6. **Kit.** Shades are matched to the store's catalogue with CIEDE2000 colour science. Save a routine card, or print a
   client sheet for your makeup artist.
7. **For stores.** One `<script>` tag adds "Find my corrector shade" to any product page. The shopper scans once, the
   matched kit drops into the store's own bag (`correct:add-to-bag` event with SKUs), and **the selfie never leaves
   CORRECT**. See it live: https://correct-youcam.vercel.app/store-demo
8. **For everyone.** It's an installable PWA (sample faces work offline), with extra-large text, a high-contrast mode,
   spoken camera tips, voice input and output, 11 languages, and a QR hand-off from a laptop to a phone's camera.

**Consumer value:** the right shade the first time, a lighter base, and confidence for the skin the usual advice forgets.
**Retail value:** a one-line integration that turns one selfie into a matched basket from the store's own catalogue,
which lifts conversion on a hard-to-sell category and cuts returns.

## How we built it
- **Next.js 14 (App Router) + TypeScript + Tailwind**, deployed on Vercel. All YouCam calls run in server routes, so
  keys never reach the browser.
- **Six YouCam APIs:** Skin Analysis HD (4 concerns + masks), Skin Tone Analysis, Fitzpatrick Skin Type, AI Photo
  Enhance, Makeup VTO (chained foundation/concealer layers via the previous result URL), and the AI Image Generator for
  the AI-generated sample faces.
- **Colour science:** sRGB → CIELAB, Individual Typology Angle (ITA°) for depth, hue angle for undertone, a
  6-depth corrector rule engine, CIEDE2000 catalogue matching (unit-tested against published reference pairs), and ΔE
  measurement inside the YouCam masks to grade each render.
- **MediaPipe** face detection in the browser for the guided camera and auto-framing.
- **Gemini** for the coach, translation, and speech-to-text and text-to-speech, with key rotation and a multi-model
  fallback.
- **PWA** service worker; an **embeddable widget** (`widget.js` → sandboxed `/embed` iframe → `postMessage`).
- **Cost control:** response caching, per-visitor rate limits, a daily scan cap, and free pre-computed sample faces.

## Challenges we ran into
- **Makeup VTO adds `skin_smooth: 50` by default.** Chained over three passes, this airbrushed the face, so every pass
  sends `skin_smooth: 0` to keep real texture and a fair comparison.
- **The `concealer` effect dabs individual spots; it doesn't paint zones.** A green concealer left green dots, so we
  rebuilt the routine like an artist would: a sheer green-tinted primer layer, then the base, then a pin-point of
  concealer.
- **HD analysis needs a short side of 1080 px or more and a face wider than 60% of the frame.** Real selfies fail
  both, so we built on-device framing plus YouCam Photo Enhance upscaling.
- **Decoding the skin masks.** They are RGBA overlays (redness in red, spots in cyan), and the dark-circle mask is
  alpha-only.
- **Measuring results honestly** rather than claiming them: we compare inside the flagged zones against the
  surrounding skin.

## Accomplishments that we're proud of
- Skin AI and Makeup VTO working **as one system**: the masks (*where*) drive the try-on (*how*), and the
  measurement closes the loop.
- Shades that respect deep skin (ITA° + Fitzpatrick cross-check, no green on deep skin).
- A real store integration in one line of code, live at `/store-demo`.
- Accessible from the start: 11 languages, voice, large text, high contrast, offline samples, a PWA.

## What we learned
How the YouCam APIs behave in practice (defaults, input limits, mask formats, result-URL expiry), that measuring a
render is more convincing than describing it, and that accessibility features such as spoken camera tips help
everyone, not only the users they were built for.

## What's next for CORRECT
- Retailer dashboard: map a store's own SKUs and see which shades sell.
- Progress tracking over time (already stored privately in the browser).
- More concerns (melasma, under-eye hollows) and video try-on.
- Native wrappers for the app stores.

> Cosmetic guidance only, not a medical diagnosis. The sample faces are AI-generated.
