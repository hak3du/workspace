import { describe, expect, test } from "bun:test";
import { validateFeeShares } from "./fee-sharing";

const creator = "11111111111111111111111111111111";
const ahe = "Vote111111111111111111111111111111111111111";

describe("validateFeeShares", () => {
  test("accepts a complete 100% creator/platform split", () => {
    const result = validateFeeShares([
      { address: creator, shareBps: 8_000, label: "Creator" },
      { address: ahe, shareBps: 2_000, label: "AHE" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.totalBps).toBe(10_000);
    expect(result.shares.map((share) => share.percentage)).toEqual([80, 20]);
  });

  test("rejects shares that do not total exactly 100%", () => {
    const result = validateFeeShares([
      { address: creator, shareBps: 8_000 },
      { address: ahe, shareBps: 1_000 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("total 10000"))).toBe(true);
  });

  test("rejects duplicate recipient addresses", () => {
    const result = validateFeeShares([
      { address: creator, shareBps: 5_000 },
      { address: creator, shareBps: 5_000 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("duplicated"))).toBe(true);
  });

  test("rejects invalid addresses and non-positive/non-integer shares", () => {
    const result = validateFeeShares([
      { address: "not-a-wallet", shareBps: 0 },
      { address: ahe, shareBps: 10_000.5 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("address"))).toBe(true);
    expect(result.errors.some((error) => error.includes("shareBps"))).toBe(true);
  });

  test("rejects non-array payloads and out-of-range recipient counts", () => {
    expect(validateFeeShares(null).valid).toBe(false);
    expect(validateFeeShares([]).valid).toBe(false);
    expect(validateFeeShares(Array.from({ length: 11 }, (_, i) => ({
      address: `1111111111111111111111111111111${i}`,
      shareBps: 1,
    }))).valid).toBe(false);
  });
  test("accepts the maximum of ten unique recipients when shares total 100%", () => {
    const addresses = "123456789a".split("").map((suffix) => ({
      address: `1111111111111111111111111111111${suffix}`,
      shareBps: 1_000,
    }));
    const result = validateFeeShares(addresses);
    expect(result.valid).toBe(true);
    expect(result.shares).toHaveLength(10);
    expect(result.totalBps).toBe(10_000);
  });

  test("rejects malformed recipient entries without throwing", () => {
    const result = validateFeeShares([null, "not-an-object", 42]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
    expect(result.totalBps).toBe(0);
    expect(result.shares).toEqual([]);
  });

  test("trims recipient addresses and bounds optional labels", () => {
    const label = "A".repeat(100);
    const result = validateFeeShares([
      { address: ` ${creator} `, shareBps: 10_000, label: ` ${label} ` },
    ]);
    expect(result.valid).toBe(true);
    expect(result.shares[0]?.address).toBe(creator);
    expect(result.shares[0]?.label).toHaveLength(80);
  });

});
