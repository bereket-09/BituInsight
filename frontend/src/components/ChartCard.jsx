import { useState } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Maximize2, Download, Image as ImageIcon } from 'lucide-react';
import clsx from 'clsx';
import { useChartTheme } from '../hooks/useChartTheme';
import ChartFullscreenModal from './ChartFullscreenModal';

const ICON_STROKE = 1.75;

/**
 * Chart chrome stays quiet until the pointer (or keyboard focus) arrives — the
 * data is the subject, the toolbar is not.
 */
function ChartAction({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-lg p-1.5 text-noc-muted transition-colors duration-200 hover:bg-noc-accent/10 hover:text-noc-accent active:translate-y-px"
    >
      <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} />
    </button>
  );
}

const PIE_COLORS = ['#FF6B35', '#3B9EFF', '#4ADE80', '#00D4AA'];

/** Pie slice share — do not round to whole % (e.g. 50.73%, not 51%). */
function formatPieSharePercent(value, total) {
  const v = Number(value);
  const t = Number(total);
  if (!Number.isFinite(v) || !Number.isFinite(t) || t <= 0) return '—%';
  return `${((v / t) * 100).toFixed(2)}%`;
}

function formatPieValue(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  if (Math.abs(v) >= 100) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function PieTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = Number(item.value);
  const name = item.name;
  const share = formatPieSharePercent(value, total);
  const valueLabel = formatPieValue(value);

  return (
    <div className="tabular rounded-xl border border-noc-border bg-noc-card px-3 py-2 text-xs shadow-lift">
      <p className="font-semibold text-noc-text">{name}</p>
      <p className="mt-1 font-mono text-noc-muted">{valueLabel}</p>
      <p className="mt-0.5 font-mono text-noc-accent">{share}</p>
    </div>
  );
}

export default function ChartCard({
  title,
  eyebrow,
  type,
  data,
  height = 280,
  onDownloadPng,
  onExpandPng,
}) {
  const chartTheme = useChartTheme();
  const [fullscreen, setFullscreen] = useState(false);

  const renderChart = (chartHeight) => {
    if (!data || !data.labels) return null;

    const chartData = data.labels.map((label, i) => {
      const point = { name: label };
      data.datasets?.forEach((ds) => {
        point[ds.label] = ds.data[i];
      });
      return point;
    });

    const tickStyle = { fill: chartTheme.axis, fontSize: 11 };
    const tooltipProps = {
      contentStyle: {
        backgroundColor: chartTheme.tooltipBg,
        border: `1px solid ${chartTheme.tooltipBorder}`,
        borderRadius: '8px',
        fontSize: '12px',
      },
      labelStyle: { color: chartTheme.axis },
    };

    switch (type) {
      case 'doughnut':
      case 'pie': {
        const pieData = data.labels.map((label, i) => ({
          name: label,
          value: data.datasets[0].data[i],
        }));
        const pieTotal = pieData.reduce((sum, row) => sum + (Number(row.value) || 0), 0);

        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={type === 'doughnut' ? 72 : 0}
                outerRadius={110}
                dataKey="value"
                label={({ name, value }) =>
                  `${name} ${formatPieSharePercent(value, pieTotal)}`
                }
              >
                {data.labels.map((_, i) => (
                  <Cell
                    key={i}
                    fill={
                      data.datasets[0].backgroundColor?.[i] || PIE_COLORS[i % PIE_COLORS.length]
                    }
                  />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip total={pieTotal} />} />
              <Legend
                wrapperStyle={{ color: chartTheme.axis }}
                formatter={(value, entry) => {
                  const v = entry?.payload?.value;
                  return `${value} (${formatPieSharePercent(v, pieTotal)})`;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      }

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey="name" tick={tickStyle} />
              <YAxis tick={tickStyle} />
              <Tooltip {...tooltipProps} />
              <Legend wrapperStyle={{ color: chartTheme.axis }} />
              {data.datasets.map((ds, i) => (
                <Area
                  key={i}
                  type="monotone"
                  dataKey={ds.label}
                  stroke={ds.borderColor || PIE_COLORS[i]}
                  fill={ds.backgroundColor || `${PIE_COLORS[i]}33`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey="name" tick={tickStyle} />
              <YAxis tick={tickStyle} />
              <Tooltip {...tooltipProps} />
              <Legend wrapperStyle={{ color: chartTheme.axis }} />
              {data.datasets.map((ds, i) => (
                <Bar key={i} dataKey={ds.label} fill={ds.backgroundColor || PIE_COLORS[i]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      default:
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey="name" tick={tickStyle} />
              <YAxis tick={tickStyle} />
              <Tooltip {...tooltipProps} />
              <Legend wrapperStyle={{ color: chartTheme.axis }} />
              {data.datasets.map((ds, i) => (
                <Line
                  key={i}
                  type="monotone"
                  dataKey={ds.label}
                  stroke={ds.borderColor || PIE_COLORS[i]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <>
      <figure className="card group relative flex h-full flex-col p-0">
        <figcaption className="flex items-start justify-between gap-3 border-b border-noc-border/70 px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            <h3 className="truncate text-[13px] font-semibold tracking-tight text-noc-text">
              {title}
            </h3>
          </div>
          <div
            className={clsx(
              'flex shrink-0 items-center gap-0.5 transition-opacity duration-200',
              'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
            )}
          >
            {onExpandPng && (
              <ChartAction icon={ImageIcon} label="View exported image" onClick={onExpandPng} />
            )}
            {onDownloadPng && (
              <ChartAction icon={Download} label="Download image" onClick={onDownloadPng} />
            )}
            <ChartAction
              icon={Maximize2}
              label="Expand chart"
              onClick={() => setFullscreen(true)}
            />
          </div>
        </figcaption>
        <div className="flex-1 px-2 pb-4 pt-5">{renderChart(height)}</div>
      </figure>

      <ChartFullscreenModal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title={title}
        onDownload={onDownloadPng}
      >
        {renderChart(480)}
      </ChartFullscreenModal>
    </>
  );
}
