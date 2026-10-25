export type TransportMode =
  | "bus"
  | "auto"
  | "jeep"
  | "train";

export type TransportSource =
  | "private-bus-api"
  | "public-transport-api"
  | "openstreetmap"
  | "manual"
  | "live-feed";

export type TransportStop = {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  placeName?: string;
};

export type ScheduledStop = {
  stop: TransportStop;

  sequence: number;

  arrivalTime: string | null;

  departureTime: string | null;
};

export type TransportTrip = {
  id: string;

  vehicleNumber?: string;

  serviceName?: string;

  operator?: string;

  mode: TransportMode;

  source: TransportSource;

  stops: ScheduledStop[];

  isLive?: boolean;

  lastUpdated?: string;
};

export type JourneySegment = {
  trip: TransportTrip;

  from: ScheduledStop;

  to: ScheduledStop;
};

export type Journey = {
  segments: JourneySegment[];

  transfers: number;

  totalDurationMinutes?: number;

  waitingTimeMinutes?: number;

  departureTime?: string;

  arrivalTime?: string;

  isLive?: boolean;
  isPast?: boolean;
};

export type TransportSearchResult = {
  from: string;

  to: string;

  directJourneys: Journey[];

  connectingJourneys: Journey[];

  searchedAt: string;
};
