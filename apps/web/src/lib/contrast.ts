/**
 * Contrast per WCAG 2.1.
 *
 * A module rather than code inside a test, because contrast maths will be
 * needed again when new balloon and verdict inks are added.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0–1. Translucent colours have to be composited over a background first. */
  a: number;
}

/** Accepts `#rgb`, `#rrggbb` and `rgb(r g b / a)`. */
export function parseColor(value: string): Rgb | null {
  const input = value.trim();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input);
  if (hex) {
    const digits = hex[1]!;
    const full =
      digits.length === 3
        ? digits
            .split("")
            .map((d) => d + d)
            .join("")
        : digits;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = /^rgb\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/i.exec(
    input,
  );
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }

  return null;
}

/** Composites a translucent colour over a background, the way a browser does. */
export function composite(foreground: Rgb, background: Rgb): Rgb {
  const a = foreground.a;
  return {
    r: foreground.r * a + background.r * (1 - a),
    g: foreground.g * a + background.g * (1 - a),
    b: foreground.b * a + background.b * (1 - a),
    a: 1,
  };
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

/** Contrast ratio: from 1 (none) to 21 (black on white). */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const front = foreground.a < 1 ? composite(foreground, background) : foreground;
  const a = relativeLuminance(front);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.1 AA thresholds. */
export const AA = {
  /** Text below 18.66 px bold or 24 px regular. */
  text: 4.5,
  /** Large text and non-text elements: borders, icons, states. */
  large: 3,
} as const;
