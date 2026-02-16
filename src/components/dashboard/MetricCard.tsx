// src/components/dashboard/MetricCard.tsx
type Props = {
  title: string;
  value: string | number;
  total?: number;
  icon: string;
  color: "blue" | "green" | "yellow" | "red";
  trend?: number;
  subtitle?: string;
};

export default function MetricCard({
  title,
  value,
  total,
  icon,
  color,
  trend,
  subtitle,
}: Props) {
  const colorClasses = {
    blue: "from-blue-50 to-indigo-50 border-blue-200",
    green: "from-emerald-50 to-green-50 border-emerald-200",
    yellow: "from-amber-50 to-orange-50 border-amber-200",
    red: "from-red-50 to-rose-50 border-red-200",
  };

  const iconBgClasses = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-emerald-100 text-emerald-600",
    yellow: "bg-amber-100 text-amber-600",
    red: "bg-red-100 text-red-600",
  };

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-6 shadow-sm ${colorClasses[color]}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="text-sm font-medium text-zinc-700">{title}</div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${iconBgClasses[color]}`}>
          {icon}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <div className="text-3xl font-bold text-zinc-900">
            {typeof value === "number" && !String(value).includes("R$")
              ? value.toLocaleString()
              : value}
          </div>
          {total !== undefined && (
            <div className="text-sm text-zinc-500">/ {total}</div>
          )}
        </div>

        {trend !== undefined && (
          <div
            className={`text-sm font-medium ${
              trend >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
          </div>
        )}

        {subtitle && (
          <div className="text-xs text-zinc-600 pt-1">{subtitle}</div>
        )}
      </div>
    </div>
  );
}
