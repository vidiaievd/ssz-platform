import { WeightedRandomSelectorService } from './weighted-random-selector.service.js';

describe('WeightedRandomSelectorService', () => {
  describe('selectWeightedRandom', () => {
    it('returns null for an empty pool', () => {
      const result = WeightedRandomSelectorService.selectWeightedRandom([], []);
      expect(result).toBeNull();
    });

    it('returns null when all entries are excluded', () => {
      const entries = [
        { exerciseId: 'ex-1', weight: 1 },
        { exerciseId: 'ex-2', weight: 2 },
      ];
      const result = WeightedRandomSelectorService.selectWeightedRandom(entries, ['ex-1', 'ex-2']);
      expect(result).toBeNull();
    });

    it('always returns the only eligible entry', () => {
      const entries = [{ exerciseId: 'ex-1', weight: 5 }];
      for (let i = 0; i < 20; i++) {
        expect(WeightedRandomSelectorService.selectWeightedRandom(entries, [])).toBe('ex-1');
      }
    });

    it('excludes specified exercise ids and selects from the remainder', () => {
      const entries = [
        { exerciseId: 'ex-1', weight: 1 },
        { exerciseId: 'ex-2', weight: 1 },
        { exerciseId: 'ex-3', weight: 1 },
      ];
      // Run many times; ex-1 must never appear.
      for (let i = 0; i < 50; i++) {
        const result = WeightedRandomSelectorService.selectWeightedRandom(entries, ['ex-1']);
        expect(result).not.toBe('ex-1');
        expect(['ex-2', 'ex-3']).toContain(result);
      }
    });

    it('respects weighted distribution within ±15% tolerance over 1000 trials', () => {
      // ex-1 weight=1, ex-2 weight=3 → expected ratio 25% / 75%
      const entries = [
        { exerciseId: 'ex-1', weight: 1 },
        { exerciseId: 'ex-2', weight: 3 },
      ];

      const counts: Record<string, number> = { 'ex-1': 0, 'ex-2': 0 };
      const trials = 1000;

      for (let i = 0; i < trials; i++) {
        const id = WeightedRandomSelectorService.selectWeightedRandom(entries, []);
        if (id !== null) counts[id]++;
      }

      const ratio1 = counts['ex-1'] / trials;
      const ratio2 = counts['ex-2'] / trials;

      expect(ratio1).toBeGreaterThan(0.25 - 0.15);
      expect(ratio1).toBeLessThan(0.25 + 0.15);
      expect(ratio2).toBeGreaterThan(0.75 - 0.15);
      expect(ratio2).toBeLessThan(0.75 + 0.15);
    });

    it('handles a single eligible entry after exclusions with correct weight selection', () => {
      const entries = [
        { exerciseId: 'ex-1', weight: 10 },
        { exerciseId: 'ex-2', weight: 0.5 },
      ];
      // Exclude ex-2; only ex-1 eligible regardless of its weight.
      const result = WeightedRandomSelectorService.selectWeightedRandom(entries, ['ex-2']);
      expect(result).toBe('ex-1');
    });
  });
});
