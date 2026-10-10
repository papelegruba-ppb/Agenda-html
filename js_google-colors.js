import { CATEGORIES, getCategory } from "./categories.js";

export const TYPE_TO_GCAL = Object.fromEntries(
  CATEGORIES.map(c => [c.id, { colorId: c.colorId, colorName: c.colorName }])
);

export const GCAL_TO_TYPE = {};
for (const c of CATEGORIES) {
  GCAL_TO_TYPE[c.colorName] = c.id;
  GCAL_TO_TYPE[String(c.colorId)] = c.id;
}

GCAL_TO_TYPE["lemon"]  = "app";
GCAL_TO_TYPE["banana"] = "app";
GCAL_TO_TYPE["sage"]   = "vacation";
GCAL_TO_TYPE["basil"]  = "vacation";
GCAL_TO_TYPE["4"]      = "extra-client";
GCAL_TO_TYPE["10"]     = "personal";
GCAL_TO_TYPE["6"]      = "extra-client";
GCAL_TO_TYPE["12"]     = "personal";

export function gcalToType(event) {
  const fromExt = event.extendedProperties?.private?.type;
  if (fromExt && TYPE_TO_GCAL[fromExt]) return fromExt;

  const fromName = event.extendedProperties?.private?.colorName;
  if (fromName && GCAL_TO_TYPE[fromName]) return GCAL_TO_TYPE[fromName];

  if (event.colorId && GCAL_TO_TYPE[String(event.colorId)]) {
    return GCAL_TO_TYPE[String(event.colorId)];
  }

  return "personal";
}

export function typeToGcalColor(type) {
  const cat = getCategory(type);
  return { colorId: cat.colorId, colorName: cat.colorName };
}