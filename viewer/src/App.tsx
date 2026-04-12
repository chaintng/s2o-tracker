import { useEffect, useState } from "react";
import { PriceChart } from "./components/PriceChart";
import { TicketDetailPane } from "./components/TicketDetailPane";
import { formatDateTime } from "./lib/ohlc";
import { useTicketData } from "./hooks/useTicketData";
import {
  ALL_TICKETS,
  ChartMode,
  Interval,
  TicketLevel,
  TicketKey,
  TicketType,
  TICKET_COLORS,
  isSameTicket,
  ticketKey,
  ticketShortLabel,
} from "./types";

type ViewMode = "market" | "detail";
const RESALE_URL = "https://resale.eventpop.me/e/s2o-2026?utm_source=chaintng-s2o-price-tracker";
const OFFICIAL_BUY_URL = "https://www.eventpop.me/e/87299?utm_source=chaintng-s2o-price-tracker";
const DEFAULT_FIXED_PRICES: Record<TicketLevel, Record<TicketType, number | null>> = {
  regular: {
    "All 3 Days": null,
    "Day 1": 2500,
    "Day 2": 2500,
    "Day 3": 2500,
  },
  vip: {
    "All 3 Days": null,
    "Day 1": null,
    "Day 2": null,
    "Day 3": null,
  },
};

const INTERVAL_OPTIONS: { label: string; value: Interval }[] = [
  { label: "10m", value: "10m" },
  { label: "1h", value: "1H" },
  { label: "6h", value: "6H" },
  { label: "1d", value: "1D" },
];
const TICKET_SECTIONS: { level: TicketLevel; label: string }[] = [
  { level: "vip", label: "VIP" },
  { level: "regular", label: "Regular" },
];
const INITIAL_WINDOW_HOURS_BY_INTERVAL: Record<Interval, number> = {
  "10m": 6,
  "1H": 24 * 3,
  "6H": 24 * 7,
  "1D": 24 * 30,
};

function formatPrice(value: number | null): string {
  return value === null ? "—" : `฿${value.toLocaleString()}`;
}

function formatChange(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("market");
  const [mode, setMode] = useState<ChartMode>("candlestick");
  const [interval, setInterval] = useState<Interval>("1H");
  const [focus, setFocus] = useState<TicketKey | null>({ level: "vip", type: "All 3 Days" });
  const [symbolMenuOpen, setSymbolMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const {
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
    activeLinePoints,
    activeCandles,
    focusOverview,
  } = useTicketData({
    interval,
    focus,
  });

  useEffect(() => {
    if (activeTicket && !isSameTicket(activeTicket, focus)) {
      setFocus(activeTicket);
    }
  }, [activeTicket, focus]);

  useEffect(() => {
    if (viewMode !== "detail") {
      setSymbolMenuOpen(false);
    }
  }, [viewMode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncDesktop = () => setIsDesktop(mediaQuery.matches);

    syncDesktop();
    mediaQuery.addEventListener("change", syncDesktop);
    return () => mediaQuery.removeEventListener("change", syncDesktop);
  }, []);

  const openDetail = (ticket: TicketKey) => {
    setFocus(ticket);
    if (!isDesktop) {
      setViewMode("detail");
    }
  };

  const detailSeries = activeTicket
    ? visibleSeries.filter((series) => isSameTicket(series.key, activeTicket))
    : visibleSeries;
  const orderedTicketStates = [...ALL_TICKETS]
    .sort((left, right) => {
      if (left.level !== right.level) {
        return left.level === "vip" ? -1 : 1;
      }

      return 0;
    })
    .map((ticket) => {
      const summary = summaries.find((item) => isSameTicket(item.key, ticket)) ?? null;

      return {
        key: ticket,
        summary,
      };
    });
  const durationLabel =
    seasonBounds.start && seasonBounds.end
      ? <><span>{formatDateTime(seasonBounds.start)}</span><span> to {formatDateTime(seasonBounds.end)}</span></>
      : "Waiting for season data";
  const footerCredit = (
    <>
      <a href="https://chaintng.com" target="_blank" rel="noreferrer" className="footer-link">
        chaintng.com
      </a>
      <span>, visit </span>
      <a
        href="https://github.com/chaintng/s2o-price-tracker"
        target="_blank"
        rel="noreferrer"
        className="footer-link"
      >
        GitHub ⭐
      </a>
    </>
  );
  const footerDisclaimer =
    "This is an independent website and is **NOT** associated with the official S2O brand.";

  return (
    <div className="market-shell">
      <main className="mx-auto h-[100dvh] max-h-[100dvh] w-full max-w-7xl overflow-hidden">
        {viewMode === "market" ? (
          <div className="h-full animate-rise lg:grid lg:grid-cols-[420px_minmax(0,1fr)]">
            <div className="flex h-full min-h-0 flex-col lg:border-r lg:border-[#1f2630]">
              <header className="market-page-header">
                <div className="flex items-center justify-between gap-3">
                  <p className="market-kicker lg:hidden">
                    Updated {lastCapturedAt ? formatDateTime(lastCapturedAt) : "—"}</p>
                  <div className="live-badge lg:hidden">
                    <span className="live-pulse" />
                    <span>Live</span>
                  </div>
                </div>
                <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#f0f4f8]">
                  S2O Price Tracker
                </h1>
                <p className="mt-1 text-xs text-[#848e9c]">This site is NOT associated with S2O
                </p>
              </header>

              {error && (
                <section className="border-y border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 sm:px-5">
                  Failed to load tracker data: {error}
                </section>
              )}

              <section className="market-list-wrap">
                <div>
                  {TICKET_SECTIONS.map((section, sectionIndex) => (
                    <div
                      key={section.level}
                    >
                      <div className="market-section-label">
                        <span>{section.label}</span>
                        <span className="text-right">Last</span>
                        <span className="text-right">Vol</span>
                        <span className="text-right">Change</span>
                      </div>
                      <div className="divide-y divide-[#1f2630]">
                        {orderedTicketStates
                          .filter(({ key }) => key.level === section.level)
                          .map(({ key, summary }, index) => {
                            const color = TICKET_COLORS[ticketKey(key)] ?? "#f0b90b";
                            const rowDelay = `${(sectionIndex * 4 + index) * 35}ms`;
                            const defaultFixedPrice = DEFAULT_FIXED_PRICES[key.level][key.type];
                            const shouldUseDefaultFixedPrice = !hasCurrentYearData;
                            const shouldShowOfficialBuy =
                              shouldUseDefaultFixedPrice && defaultFixedPrice !== null;
                            const priceLabel = shouldUseDefaultFixedPrice
                              ? defaultFixedPrice === null
                                ? "N/A"
                                : formatPrice(defaultFixedPrice)
                              : formatPrice(summary?.latestPrice ?? null);
                            const changeLabel = shouldUseDefaultFixedPrice
                              ? "N/A"
                              : formatChange(summary?.changeRate ?? null);

                            return (
                              <button
                                key={ticketKey(key)}
                                type="button"
                                onClick={() => openDetail(key)}
                                className="ticker-row animate-rise"
                                style={{ animationDelay: rowDelay }}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: color }}
                                  />
                                  <p className="text-sm font-medium text-[#f0f4f8]">
                                    {ticketShortLabel(key)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-medium text-[#f0f4f8]">
                                    {priceLabel}
                                  </p>
                                </div>
                                {shouldShowOfficialBuy ? (
                                  <div className="col-span-2 flex justify-end">
                                    <a
                                      href={OFFICIAL_BUY_URL}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="ticker-buy-link"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      Buy Official
                                    </a>
                                  </div>
                                ) : (
                                  <div className="text-right">
                                    <p className="text-sm font-medium text-[#f0f4f8]">
                                      {summary?.latestVolume?.toLocaleString() ?? "N/A"}
                                    </p>
                                  </div>
                                )}
                                {!shouldShowOfficialBuy ? (
                                  <div className="text-right">
                                    <p
                                      className={`text-sm font-medium ${shouldUseDefaultFixedPrice || summary?.changeRate === null
                                        ? "text-[#848e9c]"
                                        : (summary?.changeRate ?? 0) >= 0
                                          ? "text-[#0ecb81]"
                                          : "text-[#f6465d]"
                                        }`}
                                    >
                                      {changeLabel}
                                    </p>
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="market-section">
                <div className="flex flex-col gap-2 px-4 py-3 sm:px-5">
                  <p className="market-kicker">Technical chart · {INTERVAL_OPTIONS.find((option) => option.value === interval)?.label ?? interval} bars</p>
                  <div className="legend-row hidden">
                    {marketOverviewSeries.map((series) => (
                      <span key={ticketKey(series.key)} className="legend-chip">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
                        <span>{ticketShortLabel(series.key)}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <PriceChart
                  mode="line"
                  interval={interval}
                  loading={loading}
                  visibleSeries={marketOverviewSeries}
                  activeTicket={null}
                  activeLinePoints={[]}
                  activeCandles={[]}
                  heightClassName="h-[225px] sm:h-[255px] lg:h-[220px]"
                  initialWindowHours={INITIAL_WINDOW_HOURS_BY_INTERVAL[interval]}
                />
              </section>

              <footer className="market-footer lg:hidden gap-2">
                <span className="inline items-center gap-1">
                  <span>Built with 💚 by </span>
                  {footerCredit}
                </span>
              </footer>
            </div>

            <section className="hidden h-full min-h-0 overflow-hidden lg:flex lg:flex-col">
              <TicketDetailPane
                layout="desktop"
                loading={loading}
                lastCapturedAt={lastCapturedAt}
                activeTicket={activeTicket}
                activeSummary={activeSummary}
                focusOverview={focusOverview}
                durationLabel={durationLabel}
                symbolMenuOpen={symbolMenuOpen}
                orderedTicketStates={orderedTicketStates}
                interval={interval}
                intervalOptions={INTERVAL_OPTIONS}
                mode={mode}
                detailSeries={detailSeries}
                activeLinePoints={activeLinePoints}
                activeCandles={activeCandles}
                resaleUrl={RESALE_URL}
                onBack={null}
                onToggleSymbolMenu={() => setSymbolMenuOpen((open) => !open)}
                onSelectTicket={(ticket) => {
                  setFocus(ticket);
                  setSymbolMenuOpen(false);
                }}
                onIntervalChange={setInterval}
                onToggleMode={() => setMode(mode === "candlestick" ? "line" : "candlestick")}
                formatPrice={formatPrice}
                formatChange={formatChange}
              />

              <footer className="market-footer hidden lg:flex">
                <span className="footer-disclaimer">{footerDisclaimer}</span>
                <span className="inline items-center gap-1">
                  <span>Built with 💚 by </span>
                  {footerCredit}
                </span>
              </footer>
            </section>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col animate-rise">
            <TicketDetailPane
              layout="mobile"
              loading={loading}
              lastCapturedAt={lastCapturedAt}
              activeTicket={activeTicket}
              activeSummary={activeSummary}
              focusOverview={focusOverview}
              durationLabel={durationLabel}
              symbolMenuOpen={symbolMenuOpen}
              orderedTicketStates={orderedTicketStates}
              interval={interval}
              intervalOptions={INTERVAL_OPTIONS}
              mode={mode}
              detailSeries={detailSeries}
              activeLinePoints={activeLinePoints}
              activeCandles={activeCandles}
              resaleUrl={RESALE_URL}
              onBack={() => setViewMode("market")}
              onToggleSymbolMenu={() => setSymbolMenuOpen((open) => !open)}
              onSelectTicket={(ticket) => {
                setFocus(ticket);
                setSymbolMenuOpen(false);
              }}
              onIntervalChange={setInterval}
              onToggleMode={() => setMode(mode === "candlestick" ? "line" : "candlestick")}
              formatPrice={formatPrice}
              formatChange={formatChange}
            />

            <footer className="market-footer hidden gap-2 sm:flex lg:hidden">
              <span className="footer-disclaimer">{footerDisclaimer}</span>
              <span className="items-center gap-1">
                <span>Built with 💚 by </span>
                {footerCredit}
              </span>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}
