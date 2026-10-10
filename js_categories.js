export const CATEGORIES = [
  { id: "work-sye",     label: "SYE",               color: "#8E7CC3", colorName: "grape",     colorId: "3"  },
  { id: "work-jac",     label: "JAC",               color: "#DC2127", colorName: "tomato",    colorId: "11" },
  { id: "app",          label: "Apps propias",      color: "#F4E87A", colorName: "citron",    colorId: "5"  },
  { id: "extra-family", label: "Extras · familia",  color: "#5484ED", colorName: "chicory",   colorId: "9"  },
  { id: "extra-client", label: "Extras · clientes", color: "#FF887C", colorName: "flamingo",  colorId: "4"  },
  { id: "medical",      label: "Médico",            color: "#46D6DB", colorName: "peacock",   colorId: "7"  },
  { id: "vacation",     label: "Vacaciones",        color: "#7BDCB5", colorName: "pistachio", colorId: "2"  },
  { id: "personal",     label: "Personal",          color: "#C9A7E8", colorName: "lavender",  colorId: "1"  },
  { id: "event",        label: "Evento",            color: "#6B6B73", colorName: "graphite",  colorId: "8"  }
];

export const DEFAULT_CATEGORY = "personal";

export function getCategory(id) {
  return CATEGORIES.find(c => c.id === id)
      || CATEGORIES.find(c => c.id === DEFAULT_CATEGORY);
}

export function getCategoryByColorName(name) {
  return CATEGORIES.find(c => c.colorName === name) || null;
}

export function getCategoryByColorId(id) {
  return CATEGORIES.find(c => c.colorId === String(id)) || null;
}