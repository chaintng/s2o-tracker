import * as echarts from "echarts/core";
import { BarChart, CandlestickChart, LineChart } from "echarts/charts";
import {
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
} from "echarts/components";
import type { ComposeOption } from "echarts/core";
import type { BarSeriesOption, CandlestickSeriesOption, LineSeriesOption } from "echarts/charts";
import type {
  AxisPointerComponentOption,
  DataZoomComponentOption,
  GridComponentOption,
  TooltipComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef, useState } from "react";
import { formatAxisTime } from "../lib/ohlc";
import { ChartMode, Interval, LinePoint, OHLCPoint, TicketKey, ticketLabel } from "../types";

echarts.use([
  LineChart,
  CandlestickChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

type ECOption = ComposeOption<
  | LineSeriesOption
  | CandlestickSeriesOption
  | BarSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | AxisPointerComponentOption
  | DataZoomComponentOption
>;

interface SeriesData {
  key: TicketKey;
  color: string;
  points: LinePoint[];
}

interface Props {
  mode: ChartMode;
  interval: Interval;
  loading: boolean;
  visibleSeries: SeriesData[];
  activeTicket: TicketKey | null;
  activeLinePoints: LinePoint[];
  activeCandles: OHLCPoint[];
  heightClassName?: string;
  initialWindowHours?: number | null;
}

const CHART_BG = "transparent";
const GRID = "#243149";
const TEXT = "#9fb0cb";
const BORDER = "#22304a";
const TOOLTIP_BG = "#081120";

function formatPrice(price: number): string {
  return `฿${price.toLocaleString()}`;
}

function buildLineOption(
  visibleSeries: SeriesData[],
  activeTicket: TicketKey | null,
  activeLinePoints: LinePoint[],
  interval: Interval,
  zoomWindow: { start: number; end: number }
): ECOption {
  const showVolume = activeTicket !== null && activeLinePoints.length > 0;

  return {
    backgroundColor: CHART_BG,
    animationDuration: 700,
    animationDurationUpdate: 350,
    animationEasing: "cubicOut",
    grid: showVolume
      ? [
        { left: 56, right: 18, top: 24, height: "60%" },
        { left: 56, right: 18, top: "74%", bottom: 38 },
      ]
      : [{ left: 56, right: 18, top: 24, bottom: 36 }],
    tooltip: {
      trigger: "axis",
      appendToBody: true,
      confine: false,
      axisPointer: {
        type: "line",
        lineStyle: { color: "#36507c", width: 1 },
      },
      backgroundColor: TOOLTIP_BG,
      borderColor: BORDER,
      borderWidth: 1,
      textStyle: { color: "#ecf4ff", fontSize: 12 },
      extraCssText: "border-radius: 16px; box-shadow: 0 20px 45px rgba(0,0,0,0.3);",
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        if (list.length === 0) {
          return "";
        }

        const title = String(list[0].name ?? "");
        const rows = list
          .filter((item) => item.seriesName !== "Focused volume")
          .map((item) => {
            const value = Array.isArray(item.value) ? item.value[1] : item.value;
            const label = item.seriesName;
            return `<div style="display:flex;justify-content:space-between;gap:24px">
              <span style="color:${item.color};font-weight:600">${label}</span>
              <span>${formatPrice(Number(value))}</span>
            </div>`;
          })
          .join("");

        return `<div style="display:flex;flex-direction:column;gap:8px;min-width:220px">
          <div style="color:${TEXT};font-size:11px">${title}</div>
          ${rows}
        </div>`;
      },
    },
    xAxis: showVolume
      ? [
        {
          type: "time",
          gridIndex: 0,
          axisLine: { lineStyle: { color: BORDER } },
          axisLabel: { show: false },
          splitLine: { show: false },
        },
        {
          type: "time",
          gridIndex: 1,
          axisLine: { lineStyle: { color: BORDER } },
          axisLabel: {
            color: TEXT,
            fontSize: 10,
            hideOverlap: true,
            margin: 10,
            formatter: (value: number) => formatAxisTime(new Date(value).toISOString(), interval),
          },
          splitLine: { show: false },
        },
      ]
      : [
        {
          type: "time",
          gridIndex: 0,
          axisLine: { lineStyle: { color: BORDER } },
            axisLabel: {
              color: TEXT,
              fontSize: 10,
              hideOverlap: true,
              margin: 10,
              formatter: (value: number) => formatAxisTime(new Date(value).toISOString(), interval),
            },
          splitLine: { show: false },
        },
      ],
    yAxis: showVolume
      ? [
        {
          type: "value",
          gridIndex: 0,
          scale: true,
          axisLabel: {
            color: TEXT,
            formatter: (value: number) => formatPrice(value),
          },
          splitLine: { lineStyle: { color: GRID, type: "dashed" } },
        },
        {
          type: "value",
          gridIndex: 1,
          axisLabel: { color: TEXT },
          splitLine: { show: false },
        },
      ]
      : [
        {
          type: "value",
          gridIndex: 0,
          scale: true,
          axisLabel: {
            color: TEXT,
            formatter: (value: number) => formatPrice(value),
          },
          splitLine: { lineStyle: { color: GRID, type: "dashed" } },
        },
      ],
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: showVolume ? [0, 1] : [0],
        filterMode: "none",
        start: zoomWindow.start,
        end: zoomWindow.end,
      },
    ],
    series: [
      ...visibleSeries.map<LineSeriesOption>((series) => ({
        name: ticketLabel(series.key),
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        smooth: 0.22,
        lineStyle: {
          width: activeTicket && ticketLabel(activeTicket) === ticketLabel(series.key) ? 3.5 : 2.25,
          color: series.color,
          opacity: activeTicket && ticketLabel(activeTicket) !== ticketLabel(series.key) ? 0.55 : 1,
        },
        emphasis: { focus: "series" },
        itemStyle: { color: series.color },
        areaStyle:
          activeTicket && ticketLabel(activeTicket) === ticketLabel(series.key)
            ? {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: `${series.color}55` },
                { offset: 1, color: `${series.color}00` },
              ]),
            }
            : undefined,
        data: series.points.map((point) => [point.time, point.price]),
      })),
      ...(showVolume
        ? [
          {
            name: "Focused volume",
            type: "bar" as const,
            xAxisIndex: 1,
            yAxisIndex: 1,
            barMaxWidth: 18,
            silent: true,
            itemStyle: {
              color: activeTicket ? "#7dd3fc99" : "#64748b80",
              borderRadius: [4, 4, 0, 0],
            },
            data: activeLinePoints.map((point) => [point.time, point.volume]),
          },
        ]
        : []),
    ],
  };
}

function buildCandlestickOption(
  candles: OHLCPoint[],
  activeTicket: TicketKey | null,
  interval: Interval,
  zoomWindow: { start: number; end: number }
): ECOption {
  const categories = candles.map((point) => formatAxisTime(point.time, interval));

  return {
    backgroundColor: CHART_BG,
    animationDuration: 600,
    animationDurationUpdate: 300,
    animationEasing: "cubicOut",
    grid: [
      { left: 56, right: 18, top: 24, height: "60%" },
      { left: 56, right: 18, top: "74%", bottom: 38 },
    ],
    tooltip: {
      trigger: "axis",
      appendToBody: true,
      confine: false,
      axisPointer: {
        type: "cross",
        lineStyle: { color: "#36507c" },
      },
      backgroundColor: TOOLTIP_BG,
      borderColor: BORDER,
      borderWidth: 1,
      textStyle: { color: "#ecf4ff", fontSize: 12 },
      extraCssText: "border-radius: 16px; box-shadow: 0 20px 45px rgba(0,0,0,0.3);",
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        const candle = list.find((item) => item.seriesType === "candlestick");
        const volume = list.find((item) => item.seriesType === "bar");
        if (!candle || !Array.isArray(candle.data)) {
          return "";
        }

        const [open, close, low, high] = candle.data as [number, number, number, number];
        const volumeValue = Array.isArray(volume?.data) ? Number(volume.data[1]) : 0;

        return `<div style="display:flex;flex-direction:column;gap:6px;min-width:220px">
          <div style="color:${TEXT};font-size:11px">${String(candle.name ?? "")}</div>
          <div style="display:flex;justify-content:space-between"><span>Ticket</span><span>${activeTicket ? ticketLabel(activeTicket) : "N/A"}</span></div>
          <div style="display:flex;justify-content:space-between"><span>Open</span><span>${formatPrice(open)}</span></div>
          <div style="display:flex;justify-content:space-between"><span>High</span><span>${formatPrice(high)}</span></div>
          <div style="display:flex;justify-content:space-between"><span>Low</span><span>${formatPrice(low)}</span></div>
          <div style="display:flex;justify-content:space-between"><span>Close</span><span>${formatPrice(close)}</span></div>
          <div style="display:flex;justify-content:space-between"><span>Volume</span><span>${volumeValue.toLocaleString()}</span></div>
        </div>`;
      },
    },
    xAxis: [
      {
        type: "category",
        data: categories,
        gridIndex: 0,
        axisLine: { lineStyle: { color: BORDER } },
        axisLabel: { show: false },
        axisTick: { show: false },
      },
      {
        type: "category",
        data: categories,
        gridIndex: 1,
        axisLine: { lineStyle: { color: BORDER } },
        axisTick: { show: false },
        axisLabel: { color: TEXT, fontSize: 11 },
      },
    ],
    yAxis: [
      {
        type: "value",
        scale: true,
        gridIndex: 0,
        axisLabel: {
          color: TEXT,
          formatter: (value: number) => formatPrice(value),
        },
        splitLine: { lineStyle: { color: GRID, type: "dashed" } },
      },
      {
        type: "value",
        gridIndex: 1,
        axisLabel: { color: TEXT },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: [0, 1],
        filterMode: "none",
        start: zoomWindow.start,
        end: zoomWindow.end,
      },
    ],
    series: [
      {
        name: "Price",
        type: "candlestick",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: candles.map((point) => [point.open, point.close, point.low, point.high]),
        itemStyle: {
          color: "#36c78b",
          color0: "#fb7185",
          borderColor: "#36c78b",
          borderColor0: "#fb7185",
        },
      },
      {
        name: "Volume",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        barMaxWidth: 18,
        itemStyle: {
          color: "#7dd3fc80",
          borderRadius: [4, 4, 0, 0],
        },
        data: candles.map((point, index) => [categories[index], point.volume]),
      },
    ],
  };
}

export function PriceChart({
  mode,
  interval,
  loading,
  visibleSeries,
  activeTicket,
  activeLinePoints,
  activeCandles,
  heightClassName = "h-[460px]",
  initialWindowHours = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [zoomWindow, setZoomWindow] = useState({ start: 0, end: 100 });

  const applyZoom = (start: number, end: number) => {
    const nextStart = Math.max(0, Math.min(start, 95));
    const nextEnd = Math.max(nextStart + 5, Math.min(end, 100));
    setZoomWindow({ start: nextStart, end: nextEnd });
    chartRef.current?.dispatchAction({
      type: "dataZoom",
      start: nextStart,
      end: nextEnd,
    });
  };

  const zoomIn = () => {
    const span = zoomWindow.end - zoomWindow.start;
    const nextSpan = Math.max(15, span - 15);
    const center = zoomWindow.start + span / 2;
    applyZoom(center - nextSpan / 2, center + nextSpan / 2);
  };

  const zoomOut = () => {
    const span = zoomWindow.end - zoomWindow.start;
    const nextSpan = Math.min(100, span + 15);
    const center = zoomWindow.start + span / 2;
    applyZoom(center - nextSpan / 2, center + nextSpan / 2);
  };

  const getInitialZoomWindow = () => {
    if (initialWindowHours === null || initialWindowHours <= 0) {
      return { start: 0, end: 100 };
    }

    const seriesTimestamps = visibleSeries.flatMap((series) =>
      series.points.map((point) => new Date(point.time).getTime())
    );

    if (seriesTimestamps.length === 0) {
      return { start: 0, end: 100 };
    }

    const latestMs = Math.max(...seriesTimestamps);
    const earliestMs = Math.min(...seriesTimestamps);
    const totalSpanMs = latestMs - earliestMs;

    if (totalSpanMs <= 0) {
      return { start: 0, end: 100 };
    }

    const windowStartMs = latestMs - initialWindowHours * 60 * 60 * 1000;
    const clampedStartMs = Math.max(earliestMs, windowStartMs);
    const start = ((clampedStartMs - earliestMs) / totalSpanMs) * 100;

    return { start, end: 100 };
  };

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const resize = () => chart.resize();
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        chart.dispatchAction({ type: "hideTip" });
      }
    };

    window.addEventListener("resize", resize);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("mousedown", handlePointerDown);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    const nextZoomWindow =
      mode === "candlestick" ? { start: 0, end: 100 } : getInitialZoomWindow();
    setZoomWindow(nextZoomWindow);

    if (mode === "candlestick") {
      if (activeCandles.length === 0) {
        chartRef.current.clear();
        return;
      }

      chartRef.current.setOption(
        buildCandlestickOption(activeCandles, activeTicket, interval, nextZoomWindow),
        {
          notMerge: true,
        }
      );
      return;
    }

    if (visibleSeries.length === 0) {
      chartRef.current.clear();
      return;
    }

    chartRef.current.setOption(
      buildLineOption(visibleSeries, activeTicket, activeLinePoints, interval, nextZoomWindow),
      {
        notMerge: true,
      }
    );
  }, [mode, interval, visibleSeries, activeTicket, activeLinePoints, activeCandles, initialWindowHours]);

  const emptyState =
    mode === "candlestick"
      ? "No candle data for this ticket in the selected window."
      : "No chart data for the selected filters.";

  const hasData = mode === "candlestick" ? activeCandles.length > 0 : visibleSeries.length > 0;

  return (
    <div className={`relative border-[#1f2630] bg-[#0b0e11] ${heightClassName}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#f0b90b]/8 to-transparent" />
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0e11]/78 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#f0b90b]/60 border-t-transparent" />
            <p className="text-sm text-[#c8d1dc]">Loading historical tracker</p>
          </div>
        </div>
      )}
      {!loading && !hasData && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center">
          <div className="max-w-sm space-y-2">
            <p className="text-lg font-semibold text-[#f0f4f8]">Nothing to plot</p>
            <p className="text-sm text-[#848e9c]">{emptyState}</p>
          </div>
        </div>
      )}
      <div className="absolute right-3 top-3 z-20 flex flex-col gap-2">
        <button type="button" onClick={zoomIn} className="chart-zoom-btn" aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={zoomOut} className="chart-zoom-btn" aria-label="Zoom out">
          −
        </button>
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
