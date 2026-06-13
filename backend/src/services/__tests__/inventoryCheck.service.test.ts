import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InventoryCheckService } from '../inventoryCheck.service';
import { InventoryCheck } from '../../models/inventoryCheck.entity';
import { InventoryCheckItem } from '../../models/inventoryCheckItem.entity';
import { AuditService } from '../audit.service';
import { InventoryCheckStatus, ItemType, Role } from '../../types/enums';
import { AuthUser } from '../../types/interfaces';

const mockCheckRepo = () => ({
  create: jest.fn().mockImplementation((d) => ({ id: 'check-uuid', items: [], status: InventoryCheckStatus.InProgress, ...d })),
  save: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'check-uuid', items: [], status: InventoryCheckStatus.InProgress, ...d })),
  find: jest.fn().mockResolvedValue([]),
});

const mockItemRepo = () => ({
  create: jest.fn().mockImplementation((d) => ({ id: 'item-uuid', ...d })),
  save: jest.fn().mockImplementation((arr: any[]) => Promise.resolve(arr.map((d) => ({ id: 'item-uuid', ...d })))),
});

const mockAuditSvc = () => ({
  record: jest.fn().mockResolvedValue(undefined),
});

const checker: AuthUser = { id: 'checker-1', role: Role.LabManager, name: 'Checker' };

const buildItems = (diffs: number[]) =>
  diffs.map((d, i) => ({
    itemId: `item-${i + 1}`,
    itemType: ItemType.Reagent,
    systemStock: 100,
    actualStock: 100 + d,
    difference: d,
    reason: d !== 0 ? '差异原因' : undefined,
  }));

describe('InventoryCheckService - 盘点差异判定', () => {
  let service: InventoryCheckService;
  let checkRepo: ReturnType<typeof mockCheckRepo>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        InventoryCheckService,
        { provide: getRepositoryToken(InventoryCheck), useFactory: mockCheckRepo },
        { provide: getRepositoryToken(InventoryCheckItem), useFactory: mockItemRepo },
        { provide: AuditService, useFactory: mockAuditSvc },
      ],
    }).compile();

    service = module.get(InventoryCheckService);
    checkRepo = module.get(getRepositoryToken(InventoryCheck)) as ReturnType<typeof mockCheckRepo>;

    jest.clearAllMocks();
  });

  const createCheck = (payload: Record<string, unknown>) =>
    (service.create as any)(payload, checker);

  describe('差异判定 - hasDiscrepancy 用 some 而非 every（回归测试）', () => {
    it('所有物品差异为 0 → 状态应为 Completed', async () => {
      const items = buildItems([0, 0, 0]);

      await createCheck({ scopeDescription: '常规盘点', items });

      const saved = checkRepo.save.mock.calls[checkRepo.save.mock.calls.length - 1][0];
      expect(saved.status).toBe(InventoryCheckStatus.Completed);
    });

    it('部分物品有差异（1个非0）→ 应标记 Discrepancy（关键修复场景：some vs every）', async () => {
      const items = buildItems([0, -5, 0]);

      await createCheck({ scopeDescription: '常规盘点', items });

      const saved = checkRepo.save.mock.calls[checkRepo.save.mock.calls.length - 1][0];
      expect(saved.status).toBe(InventoryCheckStatus.Discrepancy);
    });

    it('多个物品有差异（混合正负）→ 应标记 Discrepancy', async () => {
      const items = buildItems([10, 0, -3, 0]);

      await createCheck({ scopeDescription: '常规盘点', items });

      const saved = checkRepo.save.mock.calls[checkRepo.save.mock.calls.length - 1][0];
      expect(saved.status).toBe(InventoryCheckStatus.Discrepancy);
    });

    it('全部物品都有差异 → 应标记 Discrepancy', async () => {
      const items = buildItems([-10, 5, -2]);

      await createCheck({ scopeDescription: '常规盘点', items });

      const saved = checkRepo.save.mock.calls[checkRepo.save.mock.calls.length - 1][0];
      expect(saved.status).toBe(InventoryCheckStatus.Discrepancy);
    });

    it('空明细 → 无差异，标记 Completed', async () => {
      await createCheck({ scopeDescription: '空盘点', items: [] });

      const saved = checkRepo.save.mock.calls[checkRepo.save.mock.calls.length - 1][0];
      expect(saved.status).toBe(InventoryCheckStatus.Completed);
    });

    it('单个物品差异为 0 → Completed', async () => {
      const items = buildItems([0]);

      await createCheck({ scopeDescription: '单条盘点', items });

      const saved = checkRepo.save.mock.calls[checkRepo.save.mock.calls.length - 1][0];
      expect(saved.status).toBe(InventoryCheckStatus.Completed);
    });

    it('单个物品差异非 0 → Discrepancy', async () => {
      const items = buildItems([1]);

      await createCheck({ scopeDescription: '单条盘点差异', items });

      const saved = checkRepo.save.mock.calls[checkRepo.save.mock.calls.length - 1][0];
      expect(saved.status).toBe(InventoryCheckStatus.Discrepancy);
    });
  });
});
