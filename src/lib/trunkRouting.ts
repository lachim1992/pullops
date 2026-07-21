// Trunk-aware routing: rack -> nearest bundle (kmen) -> walk along bundle -> endpoint.
// Pure functions; work in normalized 0..1 coordinates.

import { normDistance, type NormPoint } from "./length";

export type Bundle = {
  id: string;
  points: NormPoint[];
  rackId: string | null;
  isPrimary: boolean;
};

type LocateResult = { segIndex: number; t: number; point: NormPoint; dist2: number };

function locateOnPolyline(p: NormPoint, poly: NormPoint[]): LocateResult | null {
  if (poly.length < 2) return null;
  let best: LocateResult | null = null;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) {
      t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const point = { x: a.x + t * dx, y: a.y + t * dy };
    const ddx = p.x - point.x;
    const ddy = p.y - point.y;
    const d2 = ddx * ddx + ddy * ddy;
    if (!best || d2 < best.dist2) best = { segIndex: i - 1, t, point, dist2: d2 };
  }
  return best;
}

/** Distance along a polyline between two located points. */
function walkAlong(poly: NormPoint[], a: LocateResult, b: LocateResult): number {
  let from = a;
  let to = b;
  if (from.segIndex > to.segIndex || (from.segIndex === to.segIndex && from.t > to.t)) {
    const tmp = from;
    from = to;
    to = tmp;
  }
  if (from.segIndex === to.segIndex) return normDistance(from.point, to.point);
  let sum = normDistance(from.point, poly[from.segIndex + 1]);
  for (let i = from.segIndex + 1; i < to.segIndex; i++) {
    sum += normDistance(poly[i], poly[i + 1]);
  }
  sum += normDistance(poly[to.segIndex], to.point);
  return sum;
}

export type TrunkRouteResult = {
  normLen: number;
  bundleId: string;
  /** rack -> bundle entry point (norm), useful for future viz */
  jumpIn: number;
  along: number;
  jumpOut: number;
};

/**
 * Pick best trunk route: prefer is_primary; among equals, minimize total length.
 * Returns null if no usable bundle.
 */
export function computeRouteViaTrunk(opts: {
  rack: NormPoint;
  endpoint: NormPoint;
  bundles: Bundle[];
  rackId?: string | null;
}): TrunkRouteResult | null {
  let best: (TrunkRouteResult & { rank: number }) | null = null;
  for (const b of opts.bundles) {
    if (!b.points || b.points.length < 2) continue;
    const entry = locateOnPolyline(opts.rack, b.points);
    const exit = locateOnPolyline(opts.endpoint, b.points);
    if (!entry || !exit) continue;
    const jumpIn = normDistance(opts.rack, entry.point);
    const along = walkAlong(b.points, entry, exit);
    const jumpOut = normDistance(exit.point, opts.endpoint);
    const total = jumpIn + along + jumpOut;
    // Rank: is_primary always wins; then bundle explicitly tied to this rack; else generic.
    const rank =
      b.isPrimary ? 0 : opts.rackId && b.rackId === opts.rackId ? 1 : 2;
    if (
      !best ||
      rank < best.rank ||
      (rank === best.rank && total < best.normLen)
    ) {
      best = { normLen: total, bundleId: b.id, jumpIn, along, jumpOut, rank };
    }
  }
  if (!best) return null;
  const { rank: _r, ...out } = best;
  return out;
}
