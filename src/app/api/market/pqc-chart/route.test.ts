import { describe, expect, test } from "bun:test";
import { GECKO_RANGES, normalizeCandle, VALID_RANGES } from "./route";

describe("market chart input validation", () => {
  test("supports all four public chart ranges", () => {
    expect([...VALID_RANGES].sort()).toEqual(["1D", "1H", "1M", "1W"]);
    expect(Object.keys(GECKO_RANGES).sort()).toEqual(["1D", "1H", "1M", "1W"]);
  });

  test("normalizes a valid OHLCV candle", () => {
    expect(normalizeCandle([1_800_000_000, 10, 12, 9, 11, 100])).toEqual({
      t: 1_800_000_000, o: 10, h: 12, l: 9, c: 11, v: 100,
    });
  });

  test("rejects zero and negative prices", () => {
    expect(normalizeCandle([1_800_000_000, 0, 12, 9, 11, 100])).toBeNull();
    expect(normalizeCandle([1_800_000_000, 10, 12, 9, -1, 100])).toBeNull();
  });

  test("rejects inconsistent OHLC high/low bounds", () => {
    expect(normalizeCandle([1_800_000_000, 10, 9, 8, 11, 100])).toBeNull();
    expect(normalizeCandle([1_800_000_000, 10, 12, 11, 9, 100])).toBeNull();
  });

  test("rejects malformed timestamps and negative volume", () => {
    expect(normalizeCandle(["not-a-time", 10, 12, 9, 11, 100])).toBeNull();
    expect(normalizeCandle([1_800_000_000, 10, 12, 9, 11, -1])).toBeNull();
  });
});
