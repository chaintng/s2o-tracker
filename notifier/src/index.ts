import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { HistoricalPriceRow, PriceAlertMatch } from "./types";

interface PushErrorWithStatus extends Error {
  statusCode?: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }

  return value;
}

function getSupabaseAdmin() {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }
  );
}

function configureWebPush(): void {
  webpush.setVapidDetails(
    requireEnv("WEB_PUSH_SUBJECT"),
    requireEnv("WEB_PUSH_PUBLIC_KEY"),
    requireEnv("WEB_PUSH_PRIVATE_KEY")
  );
}

function getAppUrl(): string {
  return process.env.APP_URL ?? "/s2o/";
}

function formatTicketLabel(row: HistoricalPriceRow): string {
  const levelLabel = row.ticket_level === "vip" ? "VIP" : "Regular";
  return `${levelLabel} ${row.ticket_type}`;
}

async function fetchMatchingAlerts(
  supabase = getSupabaseAdmin(),
  row: HistoricalPriceRow
): Promise<PriceAlertMatch[]> {
  const { data, error } = await supabase.schema("temp").rpc("match_s2o_price_alerts", {
    p_ticket_level: row.ticket_level,
    p_ticket_type: row.ticket_type,
    p_offer_price: row.offer_price,
  });

  if (error) {
    throw new Error(`Failed to load matching alerts: ${error.message}`);
  }

  return (data as PriceAlertMatch[] | null) ?? [];
}

async function markAlertsTriggered(
  supabase = getSupabaseAdmin(),
  alertIds: number[],
  lastTriggeredPrice: number
): Promise<void> {
  if (alertIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .schema("temp")
    .from("s2o_price_alert")
    .update({
      is_active: false,
      triggered_at: new Date().toISOString(),
      last_triggered_price: lastTriggeredPrice,
      last_error: null,
    })
    .in("id", alertIds);

  if (error) {
    throw new Error(`Failed to mark alerts as triggered: ${error.message}`);
  }
}

async function markAlertsFailed(
  supabase = getSupabaseAdmin(),
  alertIds: number[],
  lastError: string,
  deactivate: boolean
): Promise<void> {
  if (alertIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .schema("temp")
    .from("s2o_price_alert")
    .update({
      is_active: !deactivate,
      last_error: lastError,
    })
    .in("id", alertIds);

  if (error) {
    throw new Error(`Failed to update failed alerts: ${error.message}`);
  }
}

async function sendNotification(alert: PriceAlertMatch, row: HistoricalPriceRow): Promise<void> {
  const boundsLabel = [
    alert.lower_bound !== null ? `lower ${alert.lower_bound.toLocaleString()}` : null,
    alert.upper_bound !== null ? `upper ${alert.upper_bound.toLocaleString()}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" / ");

  await webpush.sendNotification(
    {
      endpoint: alert.push_endpoint,
      keys: {
        p256dh: alert.push_p256dh,
        auth: alert.push_auth,
      },
    },
    JSON.stringify({
      title: "S2O price alert hit",
      body: `${formatTicketLabel(row)} is now at THB ${row.offer_price.toLocaleString()} (${boundsLabel}).`,
      tag: `price-alert-${alert.id}`,
      url: getAppUrl(),
    })
  );
}

async function processHistoricalPrice(
  supabase = getSupabaseAdmin(),
  row: HistoricalPriceRow
): Promise<void> {
  const alerts = await fetchMatchingAlerts(supabase, row);

  if (alerts.length === 0) {
    return;
  }

  const triggeredAlertIds: number[] = [];

  for (const alert of alerts) {
    try {
      await sendNotification(alert, row);
      triggeredAlertIds.push(alert.id);
      console.log(`Delivered push notification for alert ${alert.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to deliver push notification";
      const statusCode =
        error instanceof Error ? (error as PushErrorWithStatus).statusCode : undefined;
      const shouldDeactivate = statusCode === 404 || statusCode === 410;

      console.error(`Push delivery failed for alert ${alert.id}`, error);
      await markAlertsFailed(supabase, [alert.id], message, shouldDeactivate);
    }
  }

  await markAlertsTriggered(supabase, triggeredAlertIds, row.offer_price);
}

function toHistoricalPriceRow(payload: Record<string, string | number | null>): HistoricalPriceRow {
  const id = payload.id;
  const ticketLevel = payload.ticket_level;
  const ticketType = payload.ticket_type;
  const offerPrice = payload.offer_price;
  const offerVolume = payload.offer_volume;
  const createdAt = payload.created_at;

  if (
    typeof id !== "number" ||
    (ticketLevel !== "regular" && ticketLevel !== "vip") ||
    (ticketType !== "All 3 Days" &&
      ticketType !== "Day 1" &&
      ticketType !== "Day 2" &&
      ticketType !== "Day 3") ||
    typeof offerPrice !== "number" ||
    typeof offerVolume !== "number" ||
    typeof createdAt !== "string"
  ) {
    throw new Error("Realtime payload does not match s2o_historical_price");
  }

  return {
    id,
    ticket_level: ticketLevel,
    ticket_type: ticketType,
    offer_price: offerPrice,
    offer_volume: offerVolume,
    created_at: createdAt,
  };
}

async function main(): Promise<void> {
  configureWebPush();
  const supabase = getSupabaseAdmin();

  console.log("Starting S2O price alert notifier");

  const channel = supabase
    .channel("s2o-price-alert-notifier")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "temp",
        table: "s2o_historical_price",
      },
      (payload) => {
        try {
          const row = toHistoricalPriceRow(payload.new as Record<string, string | number | null>);
          void processHistoricalPrice(supabase, row);
        } catch (error) {
          console.error("Failed to process realtime payload", error);
        }
      }
    )
    .subscribe((status) => {
      console.log("Realtime status", status);
    });

  const shutdown = async () => {
    console.log("Stopping notifier");
    await supabase.removeChannel(channel);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error: Error) => {
  console.error("Notifier failed to start", error);
  process.exit(1);
});
