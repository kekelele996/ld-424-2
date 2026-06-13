import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StockInService } from '../stockIn.service';
import { StockInRecord } from '../../models/stockInRecord.entity';
import { ReagentService } from '../reagent.service';
import { ConsumableService } from '../consumable.service';
import { AuditService } from '../audit.service';
import { ItemType, QCResult, Role } from '../../types/enums';
import { AuthUser } from '../../types/interfaces';

const mockStockInRepo = () => ({
  create: jest.fn().mockImplementation((d) => ({ id: 'si-uuid', operatorId: 'op', ...d })),
  save: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'si-uuid', operatorId: 'op', ...d })),
  find: jest.fn().mockResolvedValue([]),
});

const mockReagentSvc = () => ({
  adjustStock: jest.fn(),
});

const mockConsumableSvc = () => ({
  adjustStock: jest.fn(),
});

const mockAuditSvc = () => ({
  record: jest.fn().mockResolvedValue(undefined),
});

const user: AuthUser = { id: 'op-1', role: Role.LabManager, name: 'Op' };

describe('StockInService - 入库质检与库存增长逻辑', () => {
  let service: StockInService;
  let reagentSvc: jest.Mocked<ReagentService>;
  let consumableSvc: jest.Mocked<ConsumableService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StockInService,
        { provide: getRepositoryToken(StockInRecord), useFactory: mockStockInRepo },
        { provide: ReagentService, useFactory: mockReagentSvc },
        { provide: ConsumableService, useFactory: mockConsumableSvc },
        { provide: AuditService, useFactory: mockAuditSvc },
      ],
    }).compile();

    service = module.get(StockInService);
    reagentSvc = module.get(ReagentService) as jest.Mocked<ReagentService>;
    consumableSvc = module.get(ConsumableService) as jest.Mocked<ConsumableService>;

    jest.clearAllMocks();
  });

  describe('试剂入库 - QCResult 与库存增长（回归测试）', () => {
    it('QCResult.Skip（跳过/未填质检）→ 库存正常增长（关键修复场景）', async () => {
      const payload = {
        itemId: 'reagent-1', itemType: ItemType.Reagent, quantity: 100,
        batchNumber: 'B001', purchaseOrderNo: 'PO001', operatorId: 'op-1',
        qcResult: QCResult.Skip,
      };

      await service.create(payload, user);

      expect(reagentSvc.adjustStock).toHaveBeenCalledWith('reagent-1', 100, user, 'STOCK_IN_REAGENT');
    });

    it('未显式设置 qcResult（未填质检）→ 库存增长', async () => {
      const payload = {
        itemId: 'reagent-2', itemType: ItemType.Reagent, quantity: 50,
        batchNumber: 'B002', purchaseOrderNo: 'PO002', operatorId: 'op-1',
      } as any;

      await service.create(payload, user);

      expect(reagentSvc.adjustStock).toHaveBeenCalledWith('reagent-2', 50, user, 'STOCK_IN_REAGENT');
    });

    it('QCResult.Pass → 库存增长', async () => {
      const payload = {
        itemId: 'reagent-3', itemType: ItemType.Reagent, quantity: 200,
        batchNumber: 'B003', purchaseOrderNo: 'PO003', operatorId: 'op-1',
        qcResult: QCResult.Pass,
      };

      await service.create(payload, user);

      expect(reagentSvc.adjustStock).toHaveBeenCalledWith('reagent-3', 200, user, 'STOCK_IN_REAGENT');
    });

    it('QCResult.Fail（质检失败）→ 库存不增长', async () => {
      const payload = {
        itemId: 'reagent-4', itemType: ItemType.Reagent, quantity: 300,
        batchNumber: 'B004', purchaseOrderNo: 'PO004', operatorId: 'op-1',
        qcResult: QCResult.Fail,
      };

      await service.create(payload, user);

      expect(reagentSvc.adjustStock).not.toHaveBeenCalled();
    });
  });

  describe('耗材入库 - QCResult 与库存增长', () => {
    it('QCResult.Skip → 库存正常增长', async () => {
      const payload = {
        itemId: 'cons-1', itemType: ItemType.Consumable, quantity: 50,
        batchNumber: 'CB001', purchaseOrderNo: 'CPO001', operatorId: 'op-1',
        qcResult: QCResult.Skip,
      };

      await service.create(payload, user);

      expect(consumableSvc.adjustStock).toHaveBeenCalledWith('cons-1', 50, user, 'STOCK_IN_CONSUMABLE');
    });

    it('QCResult.Pass → 库存增长', async () => {
      const payload = {
        itemId: 'cons-2', itemType: ItemType.Consumable, quantity: 80,
        batchNumber: 'CB002', purchaseOrderNo: 'CPO002', operatorId: 'op-1',
        qcResult: QCResult.Pass,
      };

      await service.create(payload, user);

      expect(consumableSvc.adjustStock).toHaveBeenCalledWith('cons-2', 80, user, 'STOCK_IN_CONSUMABLE');
    });

    it('QCResult.Fail → 库存不增长', async () => {
      const payload = {
        itemId: 'cons-3', itemType: ItemType.Consumable, quantity: 90,
        batchNumber: 'CB003', purchaseOrderNo: 'CPO003', operatorId: 'op-1',
        qcResult: QCResult.Fail,
      };

      await service.create(payload, user);

      expect(consumableSvc.adjustStock).not.toHaveBeenCalled();
    });
  });
});
