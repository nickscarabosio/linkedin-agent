/**
 * Human-like behavior utilities to reduce automation detection.
 */

/** Random delay between min and max milliseconds */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** Short pause like a person reading or thinking (1-3s) */
export function thinkingPause(): Promise<void> {
  return randomDelay(1000, 3000);
}

/** Longer pause like a person reading a profile (3-7s) */
export function readingPause(): Promise<void> {
  return randomDelay(3000, 7000);
}

/** Brief pause between UI interactions (300-800ms) */
export function microPause(): Promise<void> {
  return randomDelay(300, 800);
}

/** Simulate human-like typing speed: variable delay per character */
export function typingDelay(): number {
  // Average ~80 WPM = ~250ms per character, with variance
  return 30 + Math.floor(Math.random() * 120);
}

/** Random scroll amount to simulate reading */
export function randomScrollAmount(): number {
  return 200 + Math.floor(Math.random() * 400);
}
