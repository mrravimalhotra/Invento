export const UNITS = ["kg", "g", "mg", "ltr", "ml", "count", "bottle", "pack"] as const;
export type Unit = (typeof UNITS)[number];

export const DEPARTMENTS = ["production", "rnd", "store"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const ITEM_CATEGORIES = ["raw", "processed", "packaging"] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
