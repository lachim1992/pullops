// PullOps length engine — pure functions, no I/O.
// Converts normalized (0..1) coordinates through a two-point calibration
// into real meters and computes cable length.

export type NormPoint = { x: number; y: number };

export type Calibration = {
  a: NormPoint;
  b: NormPoint;
  real_distance_m: number;
};

/** Euclidean distance between two normalized points. */
export function normDistance(p: NormPoint, q: NormPoint): number {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Meters-per-normalized-unit for a plan. Returns null when calibration is invalid. */
export function metersPerNormUnit(cal: Calibration | null | undefined): number | null {
  if (!cal) return null;
  const nd = normDistance(cal.a, cal.b);
  if (nd <= 0) return null;
  if (!(cal.real_distance_m > 0)) return null;
  return cal.real_distance_m / nd;
}

/** Sum of segment lengths along a polyline in normalized coordinates. */
export function polylineNormLength(points: NormPoint[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += normDistance(points[i - 1], points[i]);
  }
  return sum;
}

export type LengthInput = {
  /** ordered polyline in normalized coords, or [] when route has no points */
  routePoints: NormPoint[];
  /** manual route length override in meters (route.manual_length_m) */
  manualRouteLengthM?: number | null;
  /** two-point calibration for the plan the route belongs to */
  calibration: Calibration | null | undefined;
  /**
   * Legacy: single reserve applied 2×. Used only when reserveFromM / reserveToM are both undefined.
   * Kept for backward compatibility.
   */
  reserveM?: number;
  /** Reserve at the "from" endpoint (m). Preferred over reserveM. */
  reserveFromM?: number;
  /** Reserve at the "to" endpoint (m). */
  reserveToM?: number;
  /** per-cable manual override; when set, engine returns this value */
  overrideCableLengthM?: number | null;
};

export type LengthResult = {
  meters: number | null;
  /** why the engine chose this value */
  source: "override" | "manual_route" | "polyline" | "no_route" | "no_calibration";
};

/**
 * Compute cable length in meters:
 *   1. explicit cable override
 *   2. manual route length + reserves
 *   3. polyline × calibration + reserve_from + reserve_to
 *
 * Reserve: if reserveFromM / reserveToM given, use their sum; otherwise 2 × reserveM.
 */
export function computeCableLength(input: LengthInput): LengthResult {
  const hasPerSide = input.reserveFromM != null || input.reserveToM != null;
  const totalReserve = hasPerSide
    ? Math.max(0, input.reserveFromM ?? 0) + Math.max(0, input.reserveToM ?? 0)
    : 2 * Math.max(0, input.reserveM ?? 0);

  if (input.overrideCableLengthM != null && input.overrideCableLengthM >= 0) {
    return { meters: input.overrideCableLengthM, source: "override" };
  }
  if (input.manualRouteLengthM != null && input.manualRouteLengthM >= 0) {
    return { meters: input.manualRouteLengthM + totalReserve, source: "manual_route" };
  }
  if (!input.routePoints || input.routePoints.length < 2) {
    return { meters: null, source: "no_route" };
  }
  const mpu = metersPerNormUnit(input.calibration);
  if (mpu == null) {
    return { meters: null, source: "no_calibration" };
  }
  const meters = polylineNormLength(input.routePoints) * mpu + totalReserve;
  return { meters, source: "polyline" };
}

/** Closest point on a segment (a→b) to p, plus the squared distance. */
function projectOnSegment(p: NormPoint, a: NormPoint, b: NormPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ddx = p.x - a.x;
    const ddy = p.y - a.y;
    return { point: { ...a }, dist2: ddx * ddx + ddy * ddy };
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  const ddx = p.x - point.x;
  const ddy = p.y - point.y;
  return { point, dist2: ddx * ddx + ddy * ddy };
}

/** Closest point on a polyline to p; returns null if <2 points. */
export function closestPointOnPolyline(p: NormPoint, poly: NormPoint[]) {
  if (poly.length < 2) return null;
  let best: { point: NormPoint; dist2: number } | null = null;
  for (let i = 1; i < poly.length; i++) {
    const r = projectOnSegment(p, poly[i - 1], poly[i]);
    if (!best || r.dist2 < best.dist2) best = r;
  }
  return best;
}

/** Pick nearest bundle from a list; returns bundle id + anchor point + distance. */
export function nearestBundle(
  p: NormPoint,
  bundles: Array<{ id: string; points: NormPoint[] }>,
): { id: string; anchor: NormPoint; dist: number } | null {
  let best: { id: string; anchor: NormPoint; dist: number } | null = null;
  for (const b of bundles) {
    const r = closestPointOnPolyline(p, b.points);
    if (!r) continue;
    const d = Math.sqrt(r.dist2);
    if (!best || d < best.dist) best = { id: b.id, anchor: r.point, dist: d };
  }
  return best;
}

