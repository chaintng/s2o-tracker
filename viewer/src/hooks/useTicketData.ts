import { useEffect, useMemo, useState } from "react";
import { getSeasonBounds, toLineSeries, toOHLC } from "../lib/ohlc";
import { supabase } from "../lib/supabase";
import {
  ALL_TICKETS,
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

let cache: { data: RawRecord[]; fetchedAt: number } | null = null;
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

export function useTicketData(options: UseTicketDataOptions): UseTicketDataReturn {
  const [records, setRecords] = useState<RawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run(forceRefresh = false) {
      if (!forceRefresh && cache && Date.now() - cache.fetchedAt < REFRESH_INTERVAL_MS) {
        setRecords(cache.data);
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
        .order("created_at", { ascending: true });

      if (!mounted) {
        return;
      }

      if (dbError) {
        setError(dbError.message);
        setLoading(false);
        return;
      }

      const nextRecords = (data ?? []) as RawRecord[];
      cache = { data: nextRecords, fetchedAt: Date.now() };
      setRecords(nextRecords);
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
  }, []);

  return useMemo<UseTicketDataReturn>(() => {
    const seasonBounds = getSeasonBounds(records);
    const lastCapturedAt = seasonBounds.end;
    const filteredRecords = records;

    const grouped = new Map<string, RawRecord[]>();
    for (const ticket of ALL_TICKETS) {
      const bucket = filteredRecords.filter(
        (record) => record.ticket_level === ticket.level && record.ticket_type === ticket.type
      );
      if (bucket.length > 0) {
        grouped.set(ticketKey(ticket), bucket);
      }
    }

    const visibleSeries: ChartSeries[] = [...grouped.entries()]
      .map(([seriesKey, seriesRecords]) => {
        const key = ALL_TICKETS.find((ticket) => ticketKey(ticket) === seriesKey);
        if (!key) {
          return null;
        }

        const summary = buildSummary(seriesRecords, key);
        return {
          key,
          color: TICKET_COLORS[seriesKey] ?? "#38bdf8",
          points: toLineSeries(seriesRecords, options.interval),
          latestPrice: summary.latestPrice,
          latestVolume: summary.latestVolume,
          changeRate: summary.changeRate,
        };
      })
      .filter((series): series is ChartSeries => series !== null);

    const marketOverviewSeries: ChartSeries[] = ALL_TICKETS.map((ticket) => {
      const seriesRecords = filteredRecords.filter(
        (record) => record.ticket_level === ticket.level && record.ticket_type === ticket.type
      );
      const summary = buildSummary(seriesRecords, ticket);

      return {
        key: ticket,
        color: TICKET_COLORS[ticketKey(ticket)] ?? "#38bdf8",
        points: toLineSeries(seriesRecords, "10m"),
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
      activeLinePoints: toLineSeries(activeRecords, options.interval),
      activeCandles: toOHLC(activeRecords, options.interval),
      overview,
      focusOverview,
    };
  }, [
    records,
    loading,
    error,
    fetchedAt,
    options.focus,
    options.interval,
  ]);
}
