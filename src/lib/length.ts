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
  /** per-cable-type reserve added to both endpoints, in meters */
  reserveM: number;
  /** per-cable manual override; when set, engine returns this value */
  overrideCableLengthM?: number | null;
};

export type LengthResult = {
  meters: number | null;
  /** why the engine chose this value */
  source: "override" | "manual_route" | "polyline" | "no_route" | "no_calibration";
};

/**
 * Compute cable length in meters, honouring:
 *   1. explicit cable override
 *   2. manual route length
 *   3. polyline * calibration + 2 * reserve
 */
export function computeCableLength(input: LengthInput): LengthResult {
  const reserve = Math.max(0, input.reserveM ?? 0);

  if (input.overrideCableLengthM != null && input.overrideCableLengthM >= 0) {
    return { meters: input.overrideCableLengthM, source: "override" };
  }
  if (input.manualRouteLengthM != null && input.manualRouteLengthM >= 0) {
    return { meters: input.manualRouteLengthM + 2 * reserve, source: "manual_route" };
  }
  if (!input.routePoints || input.routePoints.length < 2) {
    return { meters: null, source: "no_route" };
  }
  const mpu = metersPerNormUnit(input.calibration);
  if (mpu == null) {
    return { meters: null, source: "no_calibration" };
  }
  const meters = polylineNormLength(input.routePoints) * mpu + 2 * reserve;
  return { meters, source: "polyline" };
}
