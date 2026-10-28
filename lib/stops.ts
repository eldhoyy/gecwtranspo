export type SearchStop = {
  id: string;
  name: string;
  aliases?: string[];
};

export const COMMON_STOPS: SearchStop[] = [
  {
    id: "thalapuzha",
    name: "THALAPUZHA",
    aliases: [
      "Thalapuzha",
      "Thalapuzha Junction",
      "Thalapuzha Bus Stop",
      "GECW",
      "GEC Wayanad",
      "GECW / Thalapuzha",
      "Government Engineering College Wayanad",
      "Government Engineering College, Wayanad",
    ],
  },
  {
    id: "kambalakkad",
    name: "KAMBALAKKAD",
    aliases: ["Kambalakkad", "Kambalakkadu"],
  },
  {
    id: "mananthavady",
    name: "MANANTHAVADY",
    aliases: [
      "Mananthavady",
      "Mananthavady Bus Stand",
      "Mananthavady Bus Station",
      "Mananthavady Town",
      "Mananthavady Junction",
      "Mananthavadi",
      "Mananthavadi Bus Stand",
    ],
  },
  {
    id: "sulthan-bathery",
    name: "SULTHAN BATHERY",
    aliases: [
      "Sulthan Bathery",
      "Bathery",
      "Sultan Bathery",
      "Sulthanbathery",
      "Sultanbathery",
    ],
  },
  {
    id: "kalpetta",
    name: "KALPETTA",
    aliases: [
      "Kalpetta",
      "Kalpetta Bus Stand",
      "Kalpetta Bus Station",
      "Kalpetta Town",
      "Kalpetta Junction",
    ],
  },
  {
    id: "panamaram",
    name: "PANAMARAM",
    aliases: ["Panamaram", "Panamaram Bus Stand"],
  },
  {
    id: "meppadi",
    name: "MEPPADI",
    aliases: ["Meppadi", "Meppadi Bus Stand"],
  },
  {
    id: "pulpally",
    name: "PULPALLY",
    aliases: ["Pulpally", "Pulpally Bus Stand"],
  },
  {
    id: "meenangadi",
    name: "MEENANGADI",
    aliases: ["Meenangadi", "Meenangadi Bus Stand"],
  },
  {
    id: "ambalavayal",
    name: "AMBALAVAYAL",
    aliases: ["Ambalavayal", "Ambalavayal Bus Stand"],
  },
  {
    id: "vythiri",
    name: "VYTHIRI",
    aliases: ["Vythiri", "Vythiri Bus Stand"],
  },
  {
    id: "thirunelly",
    name: "THIRUNELLY",
    aliases: ["Thirunelly"],
  },
  {
    id: "thondernad",
    name: "THONDERNAD",
    aliases: ["Thondernad", "Thondernadu"],
  },
  {
    id: "kannur",
    name: "KANNUR",
    aliases: [
      "Kannur",
      "Kannur Bus Stand",
      "Kannur Central Bus Stand",
      "Kannur KSRTC",
    ],
  },
  {
    id: "thalassery",
    name: "THALASSERY",
    aliases: [
      "Thalassery",
      "Tellicherry",
      "Thalassery Bus Stand",
    ],
  },
  {
    id: "kozhikode",
    name: "KOZHIKODE",
    aliases: [
      "Kozhikode",
      "Calicut",
      "Kozhikode Bus Stand",
      "Calicut Bus Stand",
    ],
  },
  {
    id: "vadakara",
    name: "VADAKARA",
    aliases: [
      "Vadakara",
      "Badagara",
      "Vadakara Bus Stand",
    ],
  },
  {
    id: "mukkam",
    name: "MUKKAM",
    aliases: ["Mukkam", "Mukkam Bus Stand"],
  },
  {
    id: "perambra",
    name: "PERAMBRA",
    aliases: ["Perambra", "Perambra Bus Stand"],
  },
  {
    id: "kalikavu",
    name: "KALIKAVU",
    aliases: ["Kalikavu", "Kalikavu Bus Stand"],
  },
  {
    id: "nilambur",
    name: "NILAMBUR",
    aliases: ["Nilambur", "Nilambur Bus Stand"],
  },
  {
    id: "manjeri",
    name: "MANJERI",
    aliases: ["Manjeri", "Manjeri Bus Stand"],
  },
  {
    id: "malappuram",
    name: "MALAPPURAM",
    aliases: ["Malappuram", "Malappuram Bus Stand"],
  },
  {
    id: "muvattupuzha",
    name: "MUVATTUPUZHA",
    aliases: [
      "Muvattupuzha",
      "Muvattupuzha Bus Stand",
    ],
  },
  {
    id: "perumbavoor",
    name: "PERUMBAVOOR",
    aliases: [
      "Perumbavoor",
      "Perumbavoor Bus Stand",
    ],
  },
  {
    id: "aluva",
    name: "ALUVA",
    aliases: ["Aluva", "Aluva Bus Stand"],
  },
  {
    id: "ernakulam",
    name: "ERNAKULAM",
    aliases: [
      "Ernakulam",
      "Ernakulam South",
      "Ernakulam Bus Stand",
      "Kochi",
    ],
  },
  {
  id: "kakkayangad",
  name: "KAKKAYANGAD",
  aliases: [
    "Kakkayangad",
    "Kakkayangad Bus Stop",
  ],
},
{
  id: "ambayathode",
  name: "AMBAYATHODE",
  aliases: [
    "Ambayathode",
    "Ambayathode Bus Stop",
  ],
},
{
  id: "niravilpuzha",
  name: "NIRAVILPUZHA",
  aliases: [
    "Niravilpuzha",
    "Niravilpuzha Bus Stop",
  ],
},
{
  id: "thiruvambady",
  name: "THIRUVAMBADY",
  aliases: [
    "Thiruvambady",
    "Thiruvambady Bus Stand",
  ],
},
];

export function normalizeStopName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,/()\-\u2013\u2014]+/g, " ")
    .replace(/\s+/g, " ");
}

function findStop(value: string): SearchStop | undefined {
  const normalized = normalizeStopName(value);

  return COMMON_STOPS.find((stop) =>
    [stop.name, ...(stop.aliases ?? [])].some(
      (candidate) =>
        normalizeStopName(candidate) === normalized
    )
  );
}

export function resolveStopName(value: string): string {
  return findStop(value)?.name ?? value.trim();
}

export function getStopNameVariants(value: string): string[] {
  const stop = findStop(value);

  if (!stop) {
    return [value.trim()];
  }

  return Array.from(
    new Set([
      stop.name,
      ...(stop.aliases ?? []),
    ])
  );
}

export function searchStops(
  value: string,
  limit = 12
): SearchStop[] {
  const query = normalizeStopName(value);

  if (!query) {
    return COMMON_STOPS.slice(0, limit);
  }

  return COMMON_STOPS
    .filter((stop) =>
      [stop.name, ...(stop.aliases ?? [])].some(
        (candidate) => {
          const name =
            normalizeStopName(candidate);

          return (
            name.startsWith(query) ||
            name.includes(query)
          );
        }
      )
    )
    .slice(0, limit);
}
