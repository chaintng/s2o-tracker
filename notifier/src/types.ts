export type TicketLevel = "regular" | "vip";
export type TicketType = "All 3 Days" | "Day 1" | "Day 2" | "Day 3";

export interface HistoricalPriceRow {
  id: number;
  ticket_level: TicketLevel;
  ticket_type: TicketType;
  offer_price: number;
  offer_volume: number;
  created_at: string;
}

export interface PriceAlertMatch {
  id: number;
  ticket_level: TicketLevel;
  ticket_type: TicketType;
  lower_bound: number | null;
  upper_bound: number | null;
  push_endpoint: string;
  push_p256dh: string;
  push_auth: string;
}
