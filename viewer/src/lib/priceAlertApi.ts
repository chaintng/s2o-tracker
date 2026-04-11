import { PriceAlertRecord, StoredPushSubscription, TicketKey } from "../types";
import { supabase } from "./supabase";

interface FetchPriceAlertInput {
  ticket: TicketKey;
  pushEndpoint: string;
}

interface SavePriceAlertInput {
  ticket: TicketKey;
  lowerBound: number | null;
  upperBound: number | null;
  pushSubscription: StoredPushSubscription;
}

export async function fetchPriceAlert({
  ticket,
  pushEndpoint,
}: FetchPriceAlertInput): Promise<PriceAlertRecord | null> {
  const { data, error } = await supabase.schema("temp").rpc("get_s2o_price_alert", {
    p_ticket_level: ticket.level,
    p_ticket_type: ticket.type,
    p_push_endpoint: pushEndpoint,
  });

  if (error) {
    throw new Error(error.message);
  }

  const alerts = data as PriceAlertRecord[] | null;
  return alerts?.[0] ?? null;
}

export async function savePriceAlert({
  ticket,
  lowerBound,
  upperBound,
  pushSubscription,
}: SavePriceAlertInput): Promise<PriceAlertRecord> {
  const { data, error } = await supabase.schema("temp").rpc("upsert_s2o_price_alert", {
    p_ticket_level: ticket.level,
    p_ticket_type: ticket.type,
    p_lower_bound: lowerBound,
    p_upper_bound: upperBound,
    p_push_subscription: pushSubscription,
  });

  if (error) {
    throw new Error(error.message);
  }

  const alerts = data as PriceAlertRecord[] | null;
  const alert = alerts?.[0];

  if (!alert) {
    throw new Error("Failed to save price alert");
  }

  return alert;
}
