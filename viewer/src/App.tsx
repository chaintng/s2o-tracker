import { useEffect, useState } from "react";
import { PriceChart } from "./components/PriceChart";
import { formatDateTime } from "./lib/ohlc";
import { useTicketData } from "./hooks/useTicketData";
import {
  ALL_TICKETS,
  ChartMode,
  Interval,
  TicketLevel,
  TicketKey,
  TICKET_COLORS,
  isSameTicket,
  ticketKey,
  ticketLabel,
  ticketShortLabel,
} from "./types";

type ViewMode = "market" | "detail";
const RESALE_URL = "https://resale.eventpop.me/e/s2o-2026?utm_source=chaintng-s2o-price-tracker";

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

function formatPrice(value: number | null): string {
  return value === null ? "—" : `฿${value.toLocaleString()}`;
}

function formatChange(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function CompactTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (nextValue: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`compact-tab ${value === option.value ? "compact-tab-active" : ""}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("market");
  const [mode, setMode] = useState<ChartMode>("candlestick");
  const [interval, setInterval] = useState<Interval>("10m");
  const [focus, setFocus] = useState<TicketKey | null>(ALL_TICKETS[0]);
  const [symbolMenuOpen, setSymbolMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const {
    loading,
    error,
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
        href="https://instagram.com/chaintng"
        target="_blank"
        rel="noreferrer"
        className="footer-link"
      >
        Instagram
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
                            return (
                              <button
                                key={ticketKey(key)}
                                type="button"
                                onClick={() => openDetail(key)}
                                disabled={summary === null}
                                className={`ticker-row animate-rise ${summary === null ? "ticker-row-disabled" : ""
                                  }`}
                                style={{ animationDelay: `${(sectionIndex * 4 + index) * 35}ms` }}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: color }}
                                  />
                                  <p
                                    className={`text-sm font-medium ${summary ? "text-[#f0f4f8]" : "text-[#5f6b7a]"
                                      }`}
                                  >
                                    {ticketShortLabel(key)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p
                                    className={`text-sm font-medium ${summary ? "text-[#f0f4f8]" : "text-[#5f6b7a]"
                                      }`}
                                  >
                                    {summary ? formatPrice(summary.latestPrice) : "N/A"}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p
                                    className={`text-sm font-medium ${summary ? "text-[#f0f4f8]" : "text-[#5f6b7a]"
                                      }`}
                                  >
                                    {summary ? summary.latestVolume?.toLocaleString() ?? "N/A" : "N/A"}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p
                                    className={`text-sm font-medium ${summary === null
                                      ? "text-[#5f6b7a]"
                                      : summary.changeRate === null
                                        ? "text-[#848e9c]"
                                        : summary.changeRate >= 0
                                          ? "text-[#0ecb81]"
                                          : "text-[#f6465d]"
                                      }`}
                                  >
                                    {summary ? formatChange(summary.changeRate) : "N/A"}
                                  </p>
                                </div>
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
                  <p className="market-kicker">Technical chart · 10m bars</p>
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
                  interval="10m"
                  loading={loading}
                  visibleSeries={marketOverviewSeries}
                  activeTicket={null}
                  activeLinePoints={[]}
                  activeCandles={[]}
                  heightClassName="h-[225px] sm:h-[255px] lg:h-[220px]"
                  initialWindowHours={24}
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
              <header className="detail-header">
                <div className="py-4">
                  <div className="relative min-w-0 overflow-hidden px-4">
                    <div className="flex items-start justify-between gap-3 lg:flex-wrap">
                      <div className="min-w-0">
                        <p className="market-kicker">
                          Updated {lastCapturedAt ? formatDateTime(lastCapturedAt) : "—"}
                        </p>
                        <button
                          type="button"
                          onClick={() => setSymbolMenuOpen((open) => !open)}
                          className="symbol-trigger"
                        >
                          <span className="truncate">
                            {activeTicket ? ticketLabel(activeTicket) : "Ticket"}
                          </span>
                          <span className={`transition-transform ${symbolMenuOpen ? "rotate-180" : ""}`}>
                            ▾
                          </span>
                        </button>
                      </div>
                      <div className="hidden lg:flex lg:max-w-full lg:flex-col lg:items-end lg:gap-2">
                        <div className="live-badge">
                          <span className="live-pulse" />
                          <span>Live</span>
                        </div>
                        <div className="desktop-trade-actions">
                          <a
                            href={RESALE_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="trade-btn trade-btn-buy"
                          >
                            Buy
                          </a>
                          <a
                            href={RESALE_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="trade-btn trade-btn-sell"
                          >
                            Sell
                          </a>
                        </div>
                      </div>
                    </div>
                    {symbolMenuOpen && (
                      <div className="symbol-menu">
                        {orderedTicketStates.map(({ key, summary }) => (
                          <button
                            key={ticketKey(key)}
                            type="button"
                            disabled={summary === null}
                            onClick={() => {
                              if (summary === null) {
                                return;
                              }
                              setFocus(key);
                              setSymbolMenuOpen(false);
                            }}
                            className={`symbol-menu-item ${isSameTicket(key, activeTicket) ? "symbol-menu-item-active" : ""
                              }`}
                          >
                            <span>{ticketShortLabel(key)}</span>
                            {!summary && <span className="symbol-menu-item-meta">N/A</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-start justify-between gap-4 border-t border-[#1f2630] pt-4 lg:flex-wrap px-4">
                    <div className="min-w-0 flex-1">
                      <p className="market-stat-label">Spot price</p>
                      <div className="mt-1 flex items-end gap-2">
                        <p className="text-[38px] font-semibold leading-none text-[#f0f4f8]">
                          {formatPrice(focusOverview.currentPrice)}
                        </p>
                        <p
                          className={`pb-1 text-base font-medium ${activeSummary?.changeRate === null
                            ? "text-[#848e9c]"
                            : (activeSummary?.changeRate ?? 0) >= 0
                              ? "text-[#0ecb81]"
                              : "text-[#f6465d]"
                            }`}
                        >
                          {formatChange(activeSummary?.changeRate ?? null)}
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-[#848e9c]">
                        {durationLabel}
                      </p>
                    </div>

                    <div className="grid max-w-full flex-shrink-0 grid-cols-2 gap-x-5 gap-y-2 text-sm">
                      <div>
                        <p className="market-stat-label">Volume</p>
                        <p className="market-stat-value">
                          {activeSummary?.latestVolume?.toLocaleString() ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="market-stat-label">Avg</p>
                        <p className="market-stat-value">{formatPrice(focusOverview.averagePrice)}</p>
                      </div>
                      <div>
                        <p className="market-stat-label">High</p>
                        <p className="market-stat-value">{formatPrice(focusOverview.highestPrice)}</p>
                      </div>
                      <div>
                        <p className="market-stat-label">Low</p>
                        <p className="market-stat-value">{formatPrice(focusOverview.lowestPrice)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </header>

              <section className="detail-toolbar">
                <div className="detail-toolbar-inner">
                  <div className="detail-toolbar-row">
                    <CompactTabs options={INTERVAL_OPTIONS} value={interval} onChange={setInterval} />
                    <button
                      type="button"
                      onClick={() => setMode(mode === "candlestick" ? "line" : "candlestick")}
                      className="micro-toggle"
                    >
                      {mode === "candlestick" ? "Candles" : "Line"}
                    </button>
                  </div>
                </div>
              </section>

              <div className="flex-1 min-h-0 overflow-hidden">
                <PriceChart
                  mode={mode}
                  interval={interval}
                  loading={loading}
                  visibleSeries={detailSeries}
                  activeTicket={activeTicket}
                  activeLinePoints={activeLinePoints}
                  activeCandles={activeCandles}
                  heightClassName="h-[320px] sm:h-[360px] lg:h-[min(62vh,560px)]"
                />
              </div>

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
            <header className="detail-header">
              <div className="flex items-center gap-3 px-4 pt-4">
                <button type="button" onClick={() => setViewMode("market")} className="back-button">
                  ←
                </button>
                <div className="relative min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="market-kicker">
                      Updated {lastCapturedAt ? formatDateTime(lastCapturedAt) : "—"}</p>
                    <div className="live-badge">
                      <span className="live-pulse" />
                      <span>Live</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSymbolMenuOpen((open) => !open)}
                    className="symbol-trigger"
                  >
                    <span className="truncate">
                      {activeTicket ? ticketLabel(activeTicket) : "Ticket"}
                    </span>
                    <span className={`transition-transform ${symbolMenuOpen ? "rotate-180" : ""}`}>
                      ▾
                    </span>
                  </button>
                  {symbolMenuOpen && (
                    <div className="symbol-menu">
                      {orderedTicketStates.map(({ key, summary }) => (
                        <button
                          key={ticketKey(key)}
                          type="button"
                          disabled={summary === null}
                          onClick={() => {
                            if (summary === null) {
                              return;
                            }
                            setFocus(key);
                            setSymbolMenuOpen(false);
                          }}
                          className={`symbol-menu-item ${isSameTicket(key, activeTicket) ? "symbol-menu-item-active" : ""
                            }`}
                        >
                          <span>{ticketShortLabel(key)}</span>
                          {!summary && <span className="symbol-menu-item-meta">N/A</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-start justify-between gap-4 border-t border-[#1f2630] p-4">
                <div className="min-w-0">
                  <p className="market-stat-label">Spot price</p>
                  <div className="mt-1 flex items-end gap-2">
                    <p className="text-[34px] font-semibold leading-none text-[#f0f4f8] sm:text-[44px]">
                      {formatPrice(focusOverview.currentPrice)}
                    </p>
                    <p
                      className={`pb-1 text-base font-medium text-sm sm:text-lg ${activeSummary?.changeRate === null
                        ? "text-[#848e9c]"
                        : (activeSummary?.changeRate ?? 0) >= 0
                          ? "text-[#0ecb81]"
                          : "text-[#f6465d]"
                        }`}
                    >
                      {formatChange(activeSummary?.changeRate ?? null)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-[#848e9c]">
                    {durationLabel}
                  </p>
                </div>

                <div className="grid flex-shrink-0 grid-cols-2 gap-x-5 gap-y-2 text-sm">
                  <div>
                    <p className="market-stat-label">Volume</p>
                    <p className="market-stat-value">
                      {activeSummary?.latestVolume?.toLocaleString() ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="market-stat-label">Avg</p>
                    <p className="market-stat-value">{formatPrice(focusOverview.averagePrice)}</p>
                  </div>
                  <div>
                    <p className="market-stat-label">High</p>
                    <p className="market-stat-value">{formatPrice(focusOverview.highestPrice)}</p>
                  </div>
                  <div>
                    <p className="market-stat-label">Low</p>
                    <p className="market-stat-value">{formatPrice(focusOverview.lowestPrice)}</p>
                  </div>
                </div>
              </div>
            </header>

            <section className="detail-toolbar">
              <div className="detail-toolbar-inner">
                <div className="detail-toolbar-row">
                  <CompactTabs options={INTERVAL_OPTIONS} value={interval} onChange={setInterval} />
                  <button
                    type="button"
                    onClick={() => setMode(mode === "candlestick" ? "line" : "candlestick")}
                    className="micro-toggle"
                  >
                    {mode === "candlestick" ? "Candles" : "Line"}
                  </button>
                </div>
              </div>
            </section>

            <div className="flex-1 min-h-[220px] sm:min-h-[260px]">
              <PriceChart
                mode={mode}
                interval={interval}
                loading={loading}
                visibleSeries={detailSeries}
                activeTicket={activeTicket}
                activeLinePoints={activeLinePoints}
                activeCandles={activeCandles}
                heightClassName="h-full"
              />
            </div>

            <section className="trade-actions">
              <a
                href={RESALE_URL}
                target="_blank"
                rel="noreferrer"
                className="trade-btn trade-btn-buy"
              >
                Buy
              </a>
              <a
                href={RESALE_URL}
                target="_blank"
                rel="noreferrer"
                className="trade-btn trade-btn-sell"
              >
                Sell
              </a>
            </section>

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
