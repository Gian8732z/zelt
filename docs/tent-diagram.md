# Tent diagram (`TentModel.svelte`)

The interactive tent on the per-tent info page: a **background illustration** with **three damage
overlays** painted on top. Both come from the design file — nothing here is hand-traced.

- **Background:** `src/lib/assets/tent.jpg` — the tent illustration (latest Figma export, the
  "Group3/4" art) downscaled to 1280px / JPEG-82 (~124 KB). Shown via SVG `<image>` filling
  `0,0,2048,2048`; `viewBox="0 460 2048 1180"` crops to the tent.
- **Overlays:** the three region shapes **Aussenzelt / Vorzelt / Innenzelt**, exported from Figma
  (the `group6.zip` export → one SVG per region). Each is a single `<path>`; the `d` strings live
  in `REGION` **verbatim**.

## The one rule: don't redraw, only place

Figma exports each shape cropped to its own bounding box, so every path starts near `0,0` and its
absolute position is lost. The component restores position with **a single `translate` per region
and nothing else** (scale is 1.0 — the shapes were drawn in the art's own 2048-wide frame):

| Region | `translate` | How it was found |
| --- | --- | --- |
| Vorzelt | `23, 529` | apex + left-eave corner both land on the background to <1 px |
| Aussenzelt | `505, 529` | apex aligned to the ridge peak (shares the apex with Vorzelt) |
| Innenzelt | `400, 740` | opening triangle aligned into the doorway |

The shapes tile: **Vorzelt** is the front A-frame face with the door notched out, **Innenzelt**
fills that notch (the inner-tent opening), **Aussenzelt** is the right roof slope. To re-fit after a
new export, drop the shape over `tent.jpg` (e.g. with `pngjs`, already a dependency) and nudge the
translate until its apex sits on the ridge peak (~`506,530` in 2048-space).

## Only three regions are on the diagram

`src/lib/tent-parts.ts` maps **only** the six fabric damage types onto these three parts. Every
other damage — poles (Stangen), guys (Abspannung), pegs (Heringe), suspension (Aufhängung),
Sonstiges — has no part, so it never draws on the tent; it appears as **text** in the open-damage
list instead. That split is deliberate: the structured shapes we have vectors for get a highlight;
everything else is reported in words.

## Highlighting

A damaged region gets a **translucent wash + coloured outline** so the illustration still shows
through (red = missing, amber = damaged — `computePartStates`; missing outranks damaged). Only
regions with an open damage render, and only those are interactive — clicking one (or its row in
the open-damage list) bumps its opacity/outline via the `sel` state. No marker pins: the wash *is*
the overlay.
