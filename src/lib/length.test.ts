import { describe, expect, it } from "vitest";
import { computeCableLength, metersPerNormUnit, normDistance, polylineNormLength } from "./length";

describe("length engine", () => {
  it("computes normalized distance", () => {
    expect(normDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 10);
  });

  it("computes meters-per-norm-unit from calibration", () => {
    // 0.1 units apart → 10 m real → 100 m per unit
    const mpu = metersPerNormUnit({
      a: { x: 0.1, y: 0.5 },
      b: { x: 0.2, y: 0.5 },
      real_distance_m: 10,
    });
    expect(mpu).toBeCloseTo(100, 10);
  });

  it("rejects invalid calibration", () => {
    expect(metersPerNormUnit(null)).toBeNull();
    expect(
      metersPerNormUnit({ a: { x: 0.5, y: 0.5 }, b: { x: 0.5, y: 0.5 }, real_distance_m: 10 }),
    ).toBeNull();
    expect(
      metersPerNormUnit({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, real_distance_m: 0 }),
    ).toBeNull();
  });

  it("sums polyline length", () => {
    expect(
      polylineNormLength([
        { x: 0, y: 0 },
        { x: 0.1, y: 0 },
        { x: 0.1, y: 0.1 },
      ]),
    ).toBeCloseTo(0.2, 10);
  });

  it("returns override when set", () => {
    const r = computeCableLength({
      routePoints: [],
      calibration: null,
      reserveM: 3,
      overrideCableLengthM: 42,
    });
    expect(r).toEqual({ meters: 42, source: "override" });
  });

  it("returns manual route length + 2*reserve", () => {
    const r = computeCableLength({
      routePoints: [],
      calibration: null,
      reserveM: 3,
      manualRouteLengthM: 20,
    });
    expect(r).toEqual({ meters: 26, source: "manual_route" });
  });

  it("returns null when no calibration", () => {
    const r = computeCableLength({
      routePoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      calibration: null,
      reserveM: 3,
    });
    expect(r.meters).toBeNull();
    expect(r.source).toBe("no_calibration");
  });

  it("returns null when route has less than 2 points", () => {
    const r = computeCableLength({
      routePoints: [{ x: 0, y: 0 }],
      calibration: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, real_distance_m: 100 },
      reserveM: 3,
    });
    expect(r.source).toBe("no_route");
  });

  it("computes polyline * calibration + reserve", () => {
    // 1 unit == 100 m, polyline 0.2 units → 20 m, + 2*3 reserve → 26 m
    const r = computeCableLength({
      routePoints: [
        { x: 0, y: 0 },
        { x: 0.1, y: 0 },
        { x: 0.1, y: 0.1 },
      ],
      calibration: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, real_distance_m: 100 },
      reserveM: 3,
    });
    expect(r.source).toBe("polyline");
    expect(r.meters).toBeCloseTo(26, 10);
  });
});
