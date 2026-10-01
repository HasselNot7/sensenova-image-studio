---
name: azhu-pen-wash-travel-sketch-v0-23
description: Use when a user uploads or describes any travel, everyday, portrait, food, pet, object, street, or nature photo and wants a spacious limited-palette pen-and-wash travel sketch with fixed neutral paper, source-aware ratio selection, and image-only delivery.
---

# Azhu Pen & Wash Travel Sketch v0.23

Generate one image from each current source photo or scene description. Assemble the instruction internally and generate directly.

## Default Delivery: Image Only

Return only the generated image. Do not display analysis, source notes, internal prompt text, composition notes, ratio notes, or generation notes unless the user explicitly asks for them. For multiple independent source photos, return only the generated images in source order.

## Fixed Paper Base

Use exact sRGB `#FCFBF8`, `fine-grain Arches watercolor paper` low contrast, neutral ivory/off-white. Do not use yellow, sepia, brown, aged, or stained paper.

## Style Prompt

Pen-and-wash travel sketch, near-black waterproof ink contours, light continuous linework, transparent watercolor, travel-journal feeling, concise watercolor brushwork.

## Composition and Edge Context

Unless the user explicitly requests another placement, keep the complete subject cluster near the center and around 15% of the page. Preserve approximately 80% as quiet `#FCFBF8` paper. Treat edge and environmental content as support only: use partial outlines, sparse linework, or small color suggestions, and omit it when recognition is unaffected. Keep surroundings visibly weaker than the centered subject rather than filling the page.

## Watercolor Color Coverage

Use at most four or five watercolor colors, selected from the source photo's color relationships. Make the subject color the clearest, then progressively reduce color coverage toward the surroundings. Avoid fragmented color specks.

## Aspect Ratio Policy

Recognize the source width, height, ratio, and orientation. Default landscape photos to `4:3` or `3:2`; portrait photos to `3:4` or `2:3`; near-square photos to `1:1` or `4:3`; use the closest canonical ratio for extreme originals. Honor an explicit user ratio or size exactly. If the generated ratio is wrong, regenerate once using the selected ratio.

## Multi-Image Input Policy

Treat each source image independently and return one result for each image in source order. Never merge multiple sources unless the user explicitly requests a collage. Treat a reference image as a style reference only when the user explicitly identifies it as such.

## User Text and Fixed Signature

Do not add in-image text by default. If the user requests text, include only the short provided core text as a quiet secondary note. Always add the fixed small plain handwritten signature `——By Azhu Pen & Wash Travel Sketch v0.23` in a thin, open, near-black, unboxed style.

## Visible Sign Text Preservation

When signage, shop names, street signs, house numbers, or similar source text is clearly legible, preserve its readable wording, relative placement, and visual hierarchy. Reduce unreadable text to loose marks or omit it; never invent lettering.

## Internal Assembly

Internally combine the source, selected ratio, fixed paper, composition and edge policy, color coverage, style prompt, and v0.23 signature. Do not display the assembled instruction.
