import { describe, it, expect, beforeEach } from "vitest";
import { TelegramCoverageService } from "./telegram-coverage-service";

describe("TelegramCoverageService", () => {
  let coverage: TelegramCoverageService;

  beforeEach(() => {
    coverage = new TelegramCoverageService();
  });

  describe("addCovered / covered", () => {
    it("stores a single interval", () => {
      coverage.addCovered(10, 20);
      expect(coverage.covered).toEqual([[10, 20]]);
    });

    it("ignores inverted intervals", () => {
      coverage.addCovered(20, 10);
      expect(coverage.covered).toEqual([]);
    });

    it("keeps disjoint intervals separate and sorted", () => {
      coverage.addCovered(100, 200);
      coverage.addCovered(10, 20);
      expect(coverage.covered).toEqual([
        [10, 20],
        [100, 200],
      ]);
    });

    it("merges overlapping intervals", () => {
      coverage.addCovered(10, 50);
      coverage.addCovered(40, 80);
      expect(coverage.covered).toEqual([[10, 80]]);
    });

    it("merges adjacent (touching) intervals", () => {
      coverage.addCovered(10, 20);
      coverage.addCovered(20, 30);
      expect(coverage.covered).toEqual([[10, 30]]);
    });

    it("absorbs an interval fully contained in another", () => {
      coverage.addCovered(10, 100);
      coverage.addCovered(40, 50);
      expect(coverage.covered).toEqual([[10, 100]]);
    });

    it("chains multiple merges", () => {
      coverage.addCovered(10, 20);
      coverage.addCovered(100, 110);
      coverage.addCovered(15, 105);
      expect(coverage.covered).toEqual([[10, 110]]);
    });
  });

  describe("gaps", () => {
    it("returns the whole range when nothing is covered", () => {
      expect(coverage.gaps(10, 20)).toEqual([[10, 20]]);
    });

    it("returns empty when fully covered", () => {
      coverage.addCovered(0, 100);
      expect(coverage.gaps(10, 20)).toEqual([]);
    });

    it("returns a leading gap", () => {
      coverage.addCovered(50, 100);
      expect(coverage.gaps(10, 100)).toEqual([[10, 49]]);
    });

    it("returns a trailing gap", () => {
      coverage.addCovered(10, 50);
      expect(coverage.gaps(10, 100)).toEqual([[51, 100]]);
    });

    it("returns a middle gap between two covered intervals", () => {
      coverage.addCovered(10, 30);
      coverage.addCovered(60, 100);
      expect(coverage.gaps(10, 100)).toEqual([[31, 59]]);
    });

    it("returns multiple gaps", () => {
      coverage.addCovered(20, 30);
      coverage.addCovered(50, 60);
      expect(coverage.gaps(0, 100)).toEqual([
        [0, 19],
        [31, 49],
        [61, 100],
      ]);
    });

    it("ignores covered intervals outside the requested range", () => {
      coverage.addCovered(0, 5);
      coverage.addCovered(200, 300);
      expect(coverage.gaps(10, 100)).toEqual([[10, 100]]);
    });

    it("returns empty for an inverted range", () => {
      expect(coverage.gaps(100, 10)).toEqual([]);
    });
  });

  describe("isCovered", () => {
    it("is true when the range is fully covered", () => {
      coverage.addCovered(0, 100);
      expect(coverage.isCovered(10, 90)).toBe(true);
    });

    it("is false when a part is missing", () => {
      coverage.addCovered(0, 50);
      expect(coverage.isCovered(10, 90)).toBe(false);
    });
  });

  describe("trim", () => {
    it("drops intervals entirely before the minimum", () => {
      coverage.addCovered(0, 50);
      coverage.addCovered(100, 200);
      coverage.trim(60);
      expect(coverage.covered).toEqual([[100, 200]]);
    });

    it("clips an interval that straddles the minimum", () => {
      coverage.addCovered(0, 200);
      coverage.trim(50);
      expect(coverage.covered).toEqual([[50, 200]]);
    });
  });

  describe("live tracking", () => {
    it("grows a single interval while extending", () => {
      coverage.extendLive(100);
      coverage.extendLive(150);
      coverage.extendLive(200);
      expect(coverage.covered).toEqual([[100, 200]]);
    });

    it("creates a gap after closeLive and reopening later", () => {
      coverage.extendLive(100);
      coverage.extendLive(150);
      coverage.closeLive();
      coverage.extendLive(300);
      coverage.extendLive(350);
      expect(coverage.covered).toEqual([
        [100, 150],
        [300, 350],
      ]);
      expect(coverage.gaps(100, 350)).toEqual([[151, 299]]);
    });
  });

  describe("clear", () => {
    it("removes all coverage and resets live tracking", () => {
      coverage.addCovered(0, 100);
      coverage.extendLive(200);
      coverage.clear();
      expect(coverage.covered).toEqual([]);
      coverage.extendLive(300);
      expect(coverage.covered).toEqual([[300, 300]]);
    });
  });
});
