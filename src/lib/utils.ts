import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Clamp a number into the [min, max] range. */
export function clamp(n: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, n));
}

/** Format a 0..1 value as a percentage string. */
export function pct(n: number, digits = 0) {
  return `${(n * 100).toFixed(digits)}%`;
}

/** Relative "time ago" formatter for audit/feed views. */
export function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  const units: [number, string][] = [
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [7, "d"],
    [4.345, "w"],
    [12, "mo"],
    [Number.POSITIVE_INFINITY, "y"],
  ];
  let value = seconds;
  let unit = "s";
  for (const [factor, label] of units) {
    if (value < factor) {
      unit = label;
      break;
    }
    value = Math.floor(value / factor);
    unit = label;
  }
  if (unit === "s" && value < 5) return "just now";
  return `${value}${unit} ago`;
}
