import { useEffect, useMemo, useState } from "react";
import { getSeasonBounds } from "../lib/ohlc";
import { supabase } from "../lib/supabase";
import {
  ALL_TICKETS,
  BucketedRecord,
  Interval,
  LinePoint,
  OHLCPoint,
  RawRecord,
  SeasonBounds,
  TicketKey,
  TicketSummary,
  TICKET_COLORS,
  isSameTicket,
  ticketKey,
} from "../types";

interface UseTicketDataOptions {
  interval: Interval;
  focus: TicketKey | null;
}

interface ChartSeries {
  key: TicketKey;
  color: string;
  points: LinePoint[];
  latestPrice: number | null;
  latestVolume: number | null;
  changeRate: number | null;
}

interface MarketOverview {
  highestPrice: number | null;
  lowestPrice: number | null;
  averagePrice: number | null;
  totalVolume: number;
  recordCount: number;
  visibleTicketCount: number;
}

interface FocusOverview {
  currentPrice: number | null;
  highestPrice: number | null;
  lowestPrice: number | null;
  averagePrice: number | null;
  totalVolume: number;
  pointCount: number;
}

interface UseTicketDataReturn {
  loading: boolean;
  error: string | null;
  lastCapturedAt: string | null;
  fetchedAt: Date | null;
  seasonBounds: SeasonBounds;
  visibleSeries: ChartSeries[];
  marketOverviewSeries: ChartSeries[];
  summaries: TicketSummary[];
  activeTicket: TicketKey | null;
  activeSummary: TicketSummary | null;
  activeLinePoints: LinePoint[];
  activeCandles: OHLCPoint[];
  overview: MarketOverview;
  focusOverview: FocusOverview;
}

interface RecordsCache {
  data: RawRecord[];
  fetchedAt: number;
  bucketedByInterval: Partial<Record<Interval, BucketedRecord[]>>;
}

let cache: RecordsCache | null = null;
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

function buildSummary(records: RawRecord[], key: TicketKey): TicketSummary {
  if (records.length === 0) {
    return {
      key,
      latestPrice: null,
      latestVolume: null,
      changeRate: null,
      points: 0,
    };
  }

  const sorted = [...records].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const latestMs = new Date(latest.created_at).getTime();
  const oneHourAgoMs = latestMs - 60 * 60 * 1000;
  const previous =
    [...sorted]
      .reverse()
      .find((record) => new Date(record.created_at).getTime() <= oneHourAgoMs) ?? null;
  const changeRate =
    previous && previous.offer_price > 0
      ? ((latest.offer_price - previous.offer_price) / previous.offer_price) * 100
      : null;

  return {
    key,
    latestPrice: latest.offer_price,
    latestVolume: latest.offer_volume,
    changeRate,
    points: records.length,
  };
}

async function fetchBucketedRecords(interval: Interval): Promise<BucketedRecord[]> {
  const { data, error } = await supabase.schema("temp").rpc("s2o_price_buckets", {
    p_interval: interval,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(`Missing bucketed data for interval ${interval}`);
  }

  return (data as BucketedRecord[]).sort(
    (left, right) => new Date(left.bucket_at).getTime() - new Date(right.bucket_at).getTime()
  );
}

export function useTicketData(options: UseTicketDataOptions): UseTicketDataReturn {
  const [records, setRecords] = useState<RawRecord[]>([]);
  const [intervalBuckets, setIntervalBuckets] = useState<BucketedRecord[]>([]);
  const [overviewBuckets, setOverviewBuckets] = useState<BucketedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run(forceRefresh = false) {
      if (
        !forceRefresh &&
        cache &&
        Date.now() - cache.fetchedAt < REFRESH_INTERVAL_MS &&
        cache.bucketedByInterval[options.interval] &&
        cache.bucketedByInterval["10m"]
      ) {
        setRecords(cache.data);
        setIntervalBuckets(cache.bucketedByInterval[options.interval] ?? []);
        setOverviewBuckets(cache.bucketedByInterval["10m"] ?? []);
        setFetchedAt(new Date(cache.fetchedAt));
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .schema("temp")
        .from("s2o_historical_price")
        .select("ticket_level, ticket_type, offer_price, offer_volume, created_at")
        .order("created_at", { ascending: false });

      if (!mounted) {
        return;
      }

      if (dbError) {
        setError(dbError.message);
        setLoading(false);
        return;
      }

      const nextRecords = (data ?? []) as RawRecord[];
      const nextIntervalBuckets = await fetchBucketedRecords(options.interval);
      const nextOverviewBuckets =
        options.interval === "10m"
          ? nextIntervalBuckets
          : await fetchBucketedRecords("10m");

      cache = {
        data: nextRecords,
        fetchedAt: Date.now(),
        bucketedByInterval: {
          ...(cache?.bucketedByInterval ?? {}),
          [options.interval]: nextIntervalBuckets,
          "10m": nextOverviewBuckets,
        },
      };
      setRecords(nextRecords);
      setIntervalBuckets(nextIntervalBuckets);
      setOverviewBuckets(nextOverviewBuckets);
      setFetchedAt(new Date(cache.fetchedAt));
      setLoading(false);
    }

    run().catch((runError: Error) => {
      if (!mounted) {
        return;
      }

      setError(runError.message);
      setLoading(false);
    });

    const intervalId = window.setInterval(() => {
      run(true).catch((runError: Error) => {
        if (!mounted) {
          return;
        }

        setError(runError.message);
      });
    }, REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [options.interval]);

  return useMemo<UseTicketDataReturn>(() => {
    const seasonBounds = getSeasonBounds(records);
    const lastCapturedAt = seasonBounds.end;
    const filteredRecords = records;

    const grouped = new Map<string, RawRecord[]>();
    const bucketedGrouped = new Map<string, BucketedRecord[]>();
    const overviewGrouped = new Map<string, BucketedRecord[]>();
    for (const ticket of ALL_TICKETS) {
      const bucket = filteredRecords.filter(
        (record) => record.ticket_level === ticket.level && record.ticket_type === ticket.type
      );
      if (bucket.length > 0) {
        grouped.set(ticketKey(ticket), bucket);
      }

      const intervalBucket = intervalBuckets.filter(
        (record) => record.ticket_level === ticket.level && record.ticket_type === ticket.type
      );
      if (intervalBucket.length > 0) {
        bucketedGrouped.set(ticketKey(ticket), intervalBucket);
      }

      const overviewBucket = overviewBuckets.filter(
        (record) => record.ticket_level === ticket.level && record.ticket_type === ticket.type
      );
      if (overviewBucket.length > 0) {
        overviewGrouped.set(ticketKey(ticket), overviewBucket);
      }
    }

    const visibleSeries: ChartSeries[] = [...bucketedGrouped.entries()]
      .map(([seriesKey, seriesRecords]) => {
        const key = ALL_TICKETS.find((ticket) => ticketKey(ticket) === seriesKey);
        if (!key) {
          return null;
        }

        const summary = buildSummary(grouped.get(seriesKey) ?? [], key);
        return {
          key,
          color: TICKET_COLORS[seriesKey] ?? "#38bdf8",
          points: seriesRecords.map((record) => ({
            time: record.bucket_at,
            price: record.close,
            volume: record.volume,
          })),
          latestPrice: summary.latestPrice,
          latestVolume: summary.latestVolume,
          changeRate: summary.changeRate,
        };
      })
      .filter((series): series is ChartSeries => series !== null);

    const marketOverviewSeries: ChartSeries[] = ALL_TICKETS.map((ticket) => {
      const summary = buildSummary(grouped.get(ticketKey(ticket)) ?? [], ticket);
      const seriesRecords = overviewGrouped.get(ticketKey(ticket)) ?? [];

      return {
        key: ticket,
        color: TICKET_COLORS[ticketKey(ticket)] ?? "#38bdf8",
        points: seriesRecords.map((record) => ({
          time: record.bucket_at,
          price: record.close,
          volume: record.volume,
        })),
        latestPrice: summary.latestPrice,
        latestVolume: summary.latestVolume,
        changeRate: summary.changeRate,
      };
    }).filter((series) => series.points.length > 0);

    const summaries = visibleSeries.map((series) => ({
      key: series.key,
      latestPrice: series.latestPrice,
      latestVolume: series.latestVolume,
      changeRate: series.changeRate,
      points: series.points.length,
    }));

    const activeTicket =
      visibleSeries.find((series) => isSameTicket(series.key, options.focus))?.key ??
      visibleSeries[0]?.key ??
      null;

    const activeRecords = activeTicket
      ? filteredRecords.filter(
        (record) =>
          record.ticket_level === activeTicket.level && record.ticket_type === activeTicket.type
      )
      : [];
    const activeSummary =
      summaries.find((summary) => isSameTicket(summary.key, activeTicket)) ?? null;
    const activeBucketedRecords = activeTicket
      ? bucketedGrouped.get(ticketKey(activeTicket)) ?? []
      : [];

    const numericPrices = filteredRecords.map((record) => record.offer_price);
    const focusPrices = activeRecords.map((record) => record.offer_price);
    const overview: MarketOverview = {
      highestPrice: numericPrices.length > 0 ? Math.max(...numericPrices) : null,
      lowestPrice: numericPrices.length > 0 ? Math.min(...numericPrices) : null,
      averagePrice:
        numericPrices.length > 0
          ? Math.round(numericPrices.reduce((total, price) => total + price, 0) / numericPrices.length)
          : null,
      totalVolume: filteredRecords.reduce((total, record) => total + record.offer_volume, 0),
      recordCount: filteredRecords.length,
      visibleTicketCount: visibleSeries.length,
    };
    const focusOverview: FocusOverview = {
      currentPrice: activeSummary?.latestPrice ?? null,
      highestPrice: focusPrices.length > 0 ? Math.max(...focusPrices) : null,
      lowestPrice: focusPrices.length > 0 ? Math.min(...focusPrices) : null,
      averagePrice:
        focusPrices.length > 0
          ? Math.round(focusPrices.reduce((total, price) => total + price, 0) / focusPrices.length)
          : null,
      totalVolume: activeRecords.reduce((total, record) => total + record.offer_volume, 0),
      pointCount: activeRecords.length,
    };

    return {
      loading,
      error,
      lastCapturedAt,
      fetchedAt,
      seasonBounds,
      visibleSeries,
      marketOverviewSeries,
      summaries,
      activeTicket,
      activeSummary,
      activeLinePoints: activeBucketedRecords.map((record) => ({
        time: record.bucket_at,
        price: record.close,
        volume: record.volume,
      })),
      activeCandles: activeBucketedRecords.map((record) => ({
        time: record.bucket_at,
        open: record.open,
        high: record.high,
        low: record.low,
        close: record.close,
        volume: record.volume,
      })),
      overview,
      focusOverview,
    };
  }, [
    records,
    intervalBuckets,
    overviewBuckets,
    loading,
    error,
    fetchedAt,
    options.focus,
    options.interval,
  ]);
}
