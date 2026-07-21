// Trunk-aware routing (Dijkstra over rack + endpoint + trunk projections/vertices).
//
// Rules:
// - Kabel se může kdykoliv připojit/odpojit na kmen (kolmý průmět na nejbližší bod).
// - Po připojení se pohybuje po kmeni (souběh) a kdykoliv se kolmo odpojí.
// - Kmeny lze řetězit (přeskok mezi kmeny přes volný prostor).
// - Když je přímá cesta rack→endpoint kratší než přes kmen, jde přímo.
//
// Vše v normalizovaných souřadnicích 0..1.

import { normDistance, type NormPoint } from "./length";

export type Bundle = {
  id: string;
  points: NormPoint[];
  rackId: string | null;
  isPrimary: boolean;
};

type LocateResult = { segIndex: number; t: number; point: NormPoint; arc: number };

function cumulativeArcs(poly: NormPoint[]): number[] {
  const arcs = [0];
  for (let i = 1; i < poly.length; i++) {
    arcs.push(arcs[i - 1] + normDistance(poly[i - 1], poly[i]));
  }
  return arcs;
}

function locate(p: NormPoint, poly: NormPoint[], arcs: number[]): LocateResult | null {
  if (poly.length < 2) return null;
  let best: { segIndex: number; t: number; point: NormPoint; d2: number } | null = null;
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
    if (!best || d2 < best.d2) best = { segIndex: i - 1, t, point, d2 };
  }
  if (!best) return null;
  const segLen = normDistance(poly[best.segIndex], poly[best.segIndex + 1]);
  const arc = arcs[best.segIndex] + segLen * best.t;
  return { segIndex: best.segIndex, t: best.t, point: best.point, arc };
}

type Node = {
  idx: number;
  point: NormPoint;
  bundleId: string | null;
  arc: number; // position along bundle if on one
};

export type RoutedPath = {
  normLen: number;
  polyline: NormPoint[];
  usedBundleIds: string[];
};

/**
 * Compute the best rack→endpoint route respecting trunks. Always returns a
 * path (falls back to a direct segment if no trunk helps).
 */
export function computeBestRoute(opts: {
  rack: NormPoint;
  endpoint: NormPoint;
  bundles: Bundle[];
}): RoutedPath {
  const { rack, endpoint, bundles } = opts;

  const nodes: Node[] = [];
  const push = (n: Omit<Node, "idx">): number => {
    const idx = nodes.length;
    nodes.push({ ...n, idx });
    return idx;
  };

  const RACK = push({ point: rack, bundleId: null, arc: 0 });
  const EP = push({ point: endpoint, bundleId: null, arc: 0 });

  // Per-bundle node lists (sorted by arc) so we can add along-trunk edges.
  const bundleNodes = new Map<string, Node[]>();

  for (const b of bundles) {
    if (!b.points || b.points.length < 2) continue;
    const arcs = cumulativeArcs(b.points);
    // Vertex nodes
    const list: Node[] = [];
    for (let i = 0; i < b.points.length; i++) {
      const idx = push({ point: b.points[i], bundleId: b.id, arc: arcs[i] });
      list.push(nodes[idx]);
    }
    // Perpendicular projections of rack and endpoint
    for (const p of [rack, endpoint]) {
      const loc = locate(p, b.points, arcs);
      if (loc) {
        const idx = push({ point: loc.point, bundleId: b.id, arc: loc.arc });
        list.push(nodes[idx]);
      }
    }
    list.sort((a, b2) => a.arc - b2.arc);
    bundleNodes.set(b.id, list);
  }

  // Adjacency list
  const N = nodes.length;
  const adj: Array<Array<{ to: number; w: number }>> = Array.from({ length: N }, () => []);
  const addEdge = (a: number, b: number, w: number) => {
    if (a === b) return;
    adj[a].push({ to: b, w });
    adj[b].push({ to: a, w });
  };

  // Direct rack↔endpoint
  addEdge(RACK, EP, normDistance(rack, endpoint));

  // Along-trunk edges: consecutive nodes on same bundle by arc.
  for (const list of bundleNodes.values()) {
    for (let i = 1; i < list.length; i++) {
      addEdge(list[i - 1].idx, list[i].idx, list[i].arc - list[i - 1].arc);
    }
  }

  // Free-space jumps: rack/endpoint to every trunk node.
  for (let i = 2; i < N; i++) {
    addEdge(RACK, i, normDistance(rack, nodes[i].point));
    addEdge(EP, i, normDistance(endpoint, nodes[i].point));
  }

  // Free-space jumps between nodes on DIFFERENT bundles (trunk chaining).
  // Only between projection-worthy pairs: for each pair of bundles, connect
  // every node of A to every node of B. Small N; fine.
  const bundleIds = Array.from(bundleNodes.keys());
  for (let i = 0; i < bundleIds.length; i++) {
    const A = bundleNodes.get(bundleIds[i])!;
    for (let j = i + 1; j < bundleIds.length; j++) {
      const B = bundleNodes.get(bundleIds[j])!;
      for (const a of A) {
        for (const b of B) {
          addEdge(a.idx, b.idx, normDistance(a.point, b.point));
        }
      }
    }
  }

  // Dijkstra
  const dist = new Array<number>(N).fill(Infinity);
  const prev = new Array<number>(N).fill(-1);
  const visited = new Array<boolean>(N).fill(false);
  dist[RACK] = 0;
  // simple O(N^2) Dijkstra; N is small
  for (let k = 0; k < N; k++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < N; i++) if (!visited[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u === -1) break;
    visited[u] = true;
    if (u === EP) break;
    for (const { to, w } of adj[u]) {
      const nd = dist[u] + w;
      if (nd < dist[to]) { dist[to] = nd; prev[to] = u; }
    }
  }

  // Reconstruct
  const path: number[] = [];
  for (let cur = EP; cur !== -1; cur = prev[cur]) path.push(cur);
  path.reverse();
  const polyline: NormPoint[] = [];
  const used = new Set<string>();
  for (const idx of path) {
    const n = nodes[idx];
    // Deduplicate consecutive identical points (rack-proj coinciding with vertex).
    const last = polyline[polyline.length - 1];
    if (!last || last.x !== n.point.x || last.y !== n.point.y) polyline.push(n.point);
    if (n.bundleId) used.add(n.bundleId);
  }

  return {
    normLen: dist[EP],
    polyline,
    usedBundleIds: Array.from(used),
  };
}

/** Back-compat wrapper used by cables.functions.ts. */
export function computeRouteViaTrunk(opts: {
  rack: NormPoint;
  endpoint: NormPoint;
  bundles: Bundle[];
  rackId?: string | null;
}): { normLen: number; bundleId: string | null; polyline: NormPoint[] } | null {
  const r = computeBestRoute(opts);
  if (!Number.isFinite(r.normLen)) return null;
  return { normLen: r.normLen, bundleId: r.usedBundleIds[0] ?? null, polyline: r.polyline };
}
