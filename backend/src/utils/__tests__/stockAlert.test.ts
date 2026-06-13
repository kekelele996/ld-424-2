import { isLowStock } from '../stockAlert';

describe('stockAlert - isLowStock 低库存预警判定', () => {
  describe('库存 > 阈值', () => {
    it('100 > 10 应返回 false', () => {
      expect(isLowStock(100, 10)).toBe(false);
    });

    it('50.5 > 50 应返回 false', () => {
      expect(isLowStock(50.5, 50)).toBe(false);
    });

    it('1 > 0 应返回 false', () => {
      expect(isLowStock(1, 0)).toBe(false);
    });
  });

  describe('库存 == 阈值 - 回归：阈值相等时必须预警', () => {
    it('10 == 10 应返回 true（关键修复场景）', () => {
      expect(isLowStock(10, 10)).toBe(true);
    });

    it('0 == 0 应返回 true', () => {
      expect(isLowStock(0, 0)).toBe(true);
    });

    it('100.0 == 100 应返回 true（浮点精度）', () => {
      expect(isLowStock(100.0, 100)).toBe(true);
    });

    it('字符串形式 50 == 50 应返回 true', () => {
      expect(isLowStock(Number('50'), Number('50'))).toBe(true);
    });
  });

  describe('库存 < 阈值', () => {
    it('5 < 10 应返回 true', () => {
      expect(isLowStock(5, 10)).toBe(true);
    });

    it('0 < 1 应返回 true', () => {
      expect(isLowStock(0, 1)).toBe(true);
    });

    it('49.9 < 50 应返回 true', () => {
      expect(isLowStock(49.9, 50)).toBe(true);
    });
  });
});
