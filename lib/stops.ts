export type SearchStop = {
  id: string;
  name: string;
  aliases?: string[];
};

export const COMMON_STOPS: SearchStop[] = [
  {
    id: "thalapuzha",
    name: "THALAPUZHA",
    aliases: ["GECW", "GECW / Thalapuzha", "Government Engineering College Wayanad"],
  },
  {
    id: "kambalakkad",
    name: "KAMBALAKKAD",
    aliases: ["Kambalakkad"],
  },
  {
    id: "mananthavady",
    name: "MANANTHAVADY",
    aliases: ["Mananthavady", "Mananthavady Bus Stand"],
  },
  {
    id: "sulthan-bathery",
    name: "SULTHAN BATHERY",
    aliases: ["Sulthan Bathery", "Bathery", "Sultan Bathery"],
  },
  {
    id: "kalpetta",
    name: "KALPETTA",
    aliases: ["Kalpetta"],
  },
  {
    id: "panamaram",
    name: "PANAMARAM",
    aliases: ["Panamaram"],
  },
  {
    id: "meppadi",
    name: "MEPPADI",
    aliases: ["Meppadi"],
  },
  {
    id: "pulpally",
    name: "PULPALLY",
    aliases: ["Pulpally"],
  },
  {
    id: "meenangadi",
    name: "MEENANGADI",
    aliases: ["Meenangadi"],
  },
  {
    id: "ambalavayal",
    name: "AMBALAVAYAL",
    aliases: ["Ambalavayal"],
  },
  {
    id: "vythiri",
    name: "VYTHIRI",
    aliases: ["Vythiri"],
  },
  {
    id: "thirunelly",
    name: "THIRUNELLY",
    aliases: ["Thirunelly"],
  },
  {
    id: "thondernad",
    name: "THONDERNAD",
    aliases: ["Thondernad"],
  },
  {
    id: "kannur",
    name: "KANNUR",
    aliases: ["Kannur"],
  },
  {
    id: "thalassery",
    name: "THALASSERY",
    aliases: ["Thalassery", "Tellicherry"],
  },
  {
    id: "kozhikode",
    name: "KOZHIKODE",
    aliases: ["Kozhikode", "Calicut"],
  },
  {
    id: "vadakara",
    name: "VADAKARA",
    aliases: ["Vadakara", "Badagara"],
  },
  {
    id: "mukkam",
    name: "MUKKAM",
    aliases: ["Mukkam"],
  },
  {
    id: "perambra",
    name: "PERAMBRA",
    aliases: ["Perambra"],
  },
  {
    id: "kalikavu",
    name: "KALIKAVU",
    aliases: ["Kalikavu"],
  },
  {
    id: "nilambur",
    name: "NILAMBUR",
    aliases: ["Nilambur"],
  },
  {
    id: "manjeri",
    name: "MANJERI",
    aliases: ["Manjeri"],
  },
  {
    id: "malappuram",
    name: "MALAPPURAM",
    aliases: ["Malappuram"],
  },
  {
    id: "muvattupuzha",
    name: "MUVATTUPUZHA",
    aliases: ["Muvattupuzha"],
  },
  {
    id: "perumbavoor",
    name: "PERUMBAVOOR",
    aliases: ["Perumbavoor"],
  },
  {
    id: "aluva",
    name: "ALUVA",
    aliases: ["Aluva"],
  },
  {
    id: "ernakulam",
    name: "ERNAKULAM",
    aliases: ["Ernakulam", "Kochi"],
  },
];

export function normalizeStopName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function resolveStopName(value: string): string {
  const normalized = normalizeStopName(value);

  const match = COMMON_STOPS.find((stop) => {
    if (normalizeStopName(stop.name) === normalized) {
      return true;
    }

    return (
      stop.aliases?.some(
        (alias) => normalizeStopName(alias) === normalized
      ) ?? false
    );
  });

  return match?.name ?? value.trim();
}

export function searchStops(
  value: string,
  limit = 12
): SearchStop[] {
  const query = normalizeStopName(value);

  if (!query) {
    return COMMON_STOPS.slice(0, limit);
  }

  return COMMON_STOPS.filter((stop) => {
    const name = normalizeStopName(stop.name);

    if (name.startsWith(query)) {
      return true;
    }

    if (name.includes(query)) {
      return true;
    }

    return (
      stop.aliases?.some((alias) =>
        normalizeStopName(alias).includes(query)
      ) ?? false
    );
  }).slice(0, limit);
}
