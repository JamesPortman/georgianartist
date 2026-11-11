// Post-process smooth/airbrushed images to read like a photographed oil
// painting: pixel-displacement "brush wobble" to break smooth gradients,
// canvas-weave + tooth texture, de-glow, and edge crispening.
//
// Usage: node scripts/depaint.js <input.jpg> <output.jpg> [strength]
//   strength: "subtle" | "strong" (default "strong")

const sharp = require("sharp");

async function main() {
  const [, , input, output, strength = "strong"] = process.argv;
  if (!input || !output) {
    console.error("Usage: node scripts/depaint.js <input> <output> [subtle|strong]");
    process.exit(1);
  }
  const strong = strength !== "subtle";

  const meta = await sharp(input).metadata();
  const W = meta.width;
  const H = meta.height;

  // 1. Tonal correction: cut HDR glow + oversaturation, add contrast, and
  //    flatten airbrushed micro-gradients into paint-like patches.
  const corrected = await sharp(input)
    .modulate({ saturation: strong ? 0.85 : 0.9, brightness: 0.98 })
    .linear(strong ? 1.12 : 1.08, strong ? -14 : -10)
    .median(strong ? 3 : 2)
    .jpeg({ quality: 95 })
    .toBuffer();

  // 2. Brush wobble — displace pixels along turbulence so smooth sky/water
  //    gets a hand-painted waviness. Done via SVG feDisplacementMap.
  //    Embed as JPEG data URI (small enough for librsvg's XML buffer).
  const b64 = corrected.toString("base64");
  const scale = strong ? 11 : 5;
  const displaceSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
         width="${W}" height="${H}">
      <defs>
        <filter id="brush" x="0" y="0" width="100%" height="100%">
          <feImage xlink:href="data:image/jpeg;base64,${b64}"
                   x="0" y="0" width="${W}" height="${H}" result="src"/>
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.018"
                        numOctaves="2" seed="11" result="noise"/>
          <feDisplacementMap in="src" in2="noise" scale="${scale}"
                             xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>
      <rect width="100%" height="100%" filter="url(#brush)"/>
    </svg>
  `);
  let img = await sharp(displaceSvg).png().toBuffer();

  // Fallback: if the SVG filter pipeline produced an empty/!matching raster
  // (some librsvg builds drop feDisplacementMap), keep the corrected image.
  const test = await sharp(img).stats().catch(() => null);
  if (!test || (await sharp(img).metadata()).width !== W) {
    img = corrected;
  }

  // 3. Canvas weave + tooth, blended stronger than the subtle pass.
  const weaveOpacity = strong ? 0.7 : 0.5;
  const toothOpacity = strong ? 0.3 : 0.18;
  const canvasSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <filter id="weave">
          <feTurbulence type="fractalNoise" baseFrequency="0.01 0.025"
                        numOctaves="2" seed="7" stitchTiles="stitch"/>
          <feColorMatrix type="saturate" values="0"/>
        </filter>
        <filter id="tooth">
          <feTurbulence type="fractalNoise" baseFrequency="0.85 0.85"
                        numOctaves="1" seed="3"/>
          <feColorMatrix type="saturate" values="0"/>
        </filter>
      </defs>
      <rect width="100%" height="100%" filter="url(#weave)" opacity="${weaveOpacity}"/>
      <rect width="100%" height="100%" filter="url(#tooth)" opacity="${toothOpacity}"/>
    </svg>
  `);
  const texture = await sharp(canvasSvg).png().toBuffer();

  await sharp(img)
    .composite([
      { input: texture, blend: "soft-light" },
      { input: texture, blend: "overlay" },
    ])
    .sharpen({ sigma: 1.2 })
    .jpeg({ quality: 92 })
    .toFile(output);

  console.log(`✓ ${output} (${strong ? "strong" : "subtle"})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
