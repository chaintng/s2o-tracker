import { useEffect, useMemo, useState } from "react";
import { fetchTicketBuckets } from "../lib/ticketDataApi";
import {
  ALL_TICKETS,
  BucketedRecord,
  Interval,
  LinePoint,
  OHLCPoint,
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

interface FocusOverview {
  currentPrice: number | null;
  highestPrice: number | null;
  lowestPrice: number | null;
  averagePrice: number | null;
}

interface UseTicketDataReturn {
  loading: boolean;
  error: string | null;
  hasCurrentYearData: boolean;
  lastCapturedAt: string | null;
  seasonBounds: SeasonBounds;
  visibleSeries: ChartSeries[];
  marketOverviewSeries: ChartSeries[];
  summaries: TicketSummary[];
  activeTicket: TicketKey | null;
  activeSummary: TicketSummary | null;
  activeLinePoints: LinePoint[];
  activeCandles: OHLCPoint[];
  focusOverview: FocusOverview;
}

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const CHANGE_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const APP_TIME_ZONE = "Asia/Bangkok";

function getBangkokYear(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIME_ZONE,
      year: "numeric",
    }).format(date)
  );
}

function isCurrentBangkokYear(value: string): boolean {
  return getBangkokYear(new Date(value)) === getBangkokYear(new Date());
}

function getSeasonBounds(records: BucketedRecord[]): SeasonBounds {
  if (records.length === 0) {
    return { start: null, end: null };
  }

  return {
    start: records[0].bucket_at,
    end: records[records.length - 1].bucket_at,
  };
}

function buildSummary(records: BucketedRecord[], key: TicketKey): TicketSummary {
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
    (left, right) => new Date(left.bucket_at).getTime() - new Date(right.bucket_at).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const latestMs = new Date(latest.bucket_at).getTime();
  const previousWindowStartMs = latestMs - CHANGE_RATE_WINDOW_MS;
  const previous =
    [...sorted]
      .reverse()
      .find((record) => new Date(record.bucket_at).getTime() <= previousWindowStartMs) ?? null;
  const changeRate =
    previous && previous.close > 0
      ? ((latest.close - previous.close) / previous.close) * 100
      : null;

  return {
    key,
    latestPrice: latest.close,
    latestVolume: latest.volume,
    changeRate,
    points: records.length,
  };
}

export function useTicketData(options: UseTicketDataOptions): UseTicketDataReturn {
  const [buckets, setBuckets] = useState<BucketedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);
      setError(null);

      const nextBuckets = await fetchTicketBuckets(options.interval);

      if (!mounted) {
        return;
      }

      setBuckets(nextBuckets);
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
      run().catch((runError: Error) => {
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
    const currentYearBuckets = buckets.filter((bucket) => isCurrentBangkokYear(bucket.bucket_at));
    const hasCurrentYearData = currentYearBuckets.length > 0;
    const displayBuckets = hasCurrentYearData ? currentYearBuckets : [];
    const seasonBounds = getSeasonBounds(displayBuckets);
    const lastCapturedAt = seasonBounds.end;
    const grouped = new Map<string, BucketedRecord[]>();

    for (const ticket of ALL_TICKETS) {
      const records = displayBuckets.filter(
        (record) => record.ticket_level === ticket.level && record.ticket_type === ticket.type
      );
      if (records.length > 0) {
        grouped.set(ticketKey(ticket), records);
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
      const seriesRecords = grouped.get(ticketKey(ticket)) ?? [];
      const summary = buildSummary(seriesRecords, ticket);

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

    const summaries = ALL_TICKETS.map((ticket) =>
      buildSummary(grouped.get(ticketKey(ticket)) ?? [], ticket)
    );

    const activeTicket =
      summaries.find((summary) => isSameTicket(summary.key, options.focus) && summary.points > 0)?.key ??
      marketOverviewSeries[0]?.key ??
      null;
    const activeSummary =
      summaries.find((summary) => isSameTicket(summary.key, activeTicket)) ?? null;
    const activeBucketedRecords = activeTicket
      ? grouped.get(ticketKey(activeTicket)) ?? []
      : [];

    const focusPrices = activeBucketedRecords.map((record) => record.close);
    const focusOverview: FocusOverview = {
      currentPrice: activeSummary?.latestPrice ?? null,
      highestPrice: focusPrices.length > 0 ? Math.max(...focusPrices) : null,
      lowestPrice: focusPrices.length > 0 ? Math.min(...focusPrices) : null,
      averagePrice:
        focusPrices.length > 0
          ? Math.round(focusPrices.reduce((total, price) => total + price, 0) / focusPrices.length)
          : null,
    };

    return {
      loading,
      error,
      hasCurrentYearData,
      lastCapturedAt,
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
      focusOverview,
    };
  }, [buckets, error, loading, options.focus]);
}
