interface SparklineProps {
  data: number[]  // 7 daily USD values, oldest first
  width?: number
  height?: number
}

function buildPaths(values: number[], w: number, h: number) {
  const hasData = values.some((v) => v > 0)
  if (!hasData) return { line: "", area: "" }

  const max = Math.max(...values)
  const pad = 3
  const usableH = h - pad * 2
  const stepX = w / Math.max(values.length - 1, 1)

  const pts = values.map((v, i) => ({
    x: +(i * stepX).toFixed(2),
    y: +(pad + usableH - (v / max) * usableH).toFixed(2),
  }))

  const line = "M " + pts.map((p) => `${p.x} ${p.y}`).join(" L ")
  const area = line + ` L ${pts[pts.length - 1].x} ${h} L 0 ${h} Z`
  return { line, area }
}

function trendColor(data: number[]): string {
  const first = data.slice(0, 3).reduce((a, b) => a + b, 0) / 3
  const last = data.slice(-3).reduce((a, b) => a + b, 0) / 3
  if (first === 0 && last === 0) return "#d4d4d8" // zinc-300
  if (last > first * 1.1) return "#f97316" // orange-500 — spending up
  if (last < first * 0.9) return "#22c55e" // green-500 — spending down
  return "#a1a1aa" // zinc-400 — flat
}

export function ConnectionSparkline({ data, width = 72, height = 28 }: SparklineProps) {
  const hasData = data.some((v) => v > 0)
  const { line, area } = buildPaths(data, width, height)
  const color = trendColor(data)
  const id = `spark-${Math.random().toString(36).slice(2, 8)}`

  if (!hasData) {
    return (
      <svg width={width} height={height} className="opacity-30">
        <line
          x1={0} y1={height / 2}
          x2={width} y2={height / 2}
          stroke="#d4d4d8"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      </svg>
    )
  }

  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {area && (
        <path d={area} fill={`url(#${id})`} />
      )}
      {line && (
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}
