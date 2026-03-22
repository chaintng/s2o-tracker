export type TicketLevel = "regular" | "vip";
export type TicketType = "All 3 Days" | "Day 1" | "Day 2" | "Day 3";
export type Interval = "10m" | "1H" | "6H" | "1D";
export type ChartMode = "line" | "candlestick";

export interface RawRecord {
  ticket_level: TicketLevel;
  ticket_type: TicketType;
  offer_price: number;
  offer_volume: number;
  created_at: string;
}

export interface BucketedRecord {
  ticket_level: TicketLevel;
  ticket_type: TicketType;
  bucket_at: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OHLCPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LinePoint {
  time: string;
  price: number;
  volume: number;
}

export interface TicketKey {
  level: TicketLevel;
  type: TicketType;
}

export interface TicketSummary {
  key: TicketKey;
  latestPrice: number | null;
  latestVolume: number | null;
  changeRate: number | null;
  points: number;
}

export interface SeasonBounds {
  start: string | null;
  end: string | null;
}

export interface StoredPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PriceAlertRecord {
  id: number;
  lower_bound: number | null;
  upper_bound: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const ALL_TICKETS: TicketKey[] = [
  { level: "regular", type: "All 3 Days" },
  { level: "regular", type: "Day 1" },
  { level: "regular", type: "Day 2" },
  { level: "regular", type: "Day 3" },
  { level: "vip", type: "All 3 Days" },
  { level: "vip", type: "Day 1" },
  { level: "vip", type: "Day 2" },
  { level: "vip", type: "Day 3" },
];

export function ticketKey(t: TicketKey): string {
  return `${t.level}::${t.type}`;
}

export function isSameTicket(left: TicketKey | null, right: TicketKey | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return ticketKey(left) === ticketKey(right);
}

export const TICKET_COLORS: Record<string, string> = {
  "regular::All 3 Days": "#38bdf8",
  "regular::Day 1": "#22c55e",
  "regular::Day 2": "#f59e0b",
  "regular::Day 3": "#fb7185",
  "vip::All 3 Days": "#f97316",
  "vip::Day 1": "#a78bfa",
  "vip::Day 2": "#14b8a6",
  "vip::Day 3": "#f43f5e",
};

export function ticketLabel(ticket: TicketKey): string {
  const level = ticket.level === "vip" ? "VIP" : "Regular";
  return `${level} ${ticket.type}`;
}

export function ticketShortLabel(ticket: TicketKey): string {
  const level = ticket.level === "vip" ? "VIP" : "REG";
  const typeMap: Record<TicketType, string> = {
    "All 3 Days": "3D",
    "Day 1": "D1",
    "Day 2": "D2",
    "Day 3": "D3",
  };

  return `${level} ${typeMap[ticket.type]}`;
}
