import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsageService } from '../usage.service';
import { UsageRecord } from '../../models/usageRecord.entity';
import { ReagentService } from '../reagent.service';
import { ConsumableService } from '../consumable.service';
import { AuditService } from '../audit.service';
import { HazardLevel, ItemType, Role, UsageStatus } from '../../types/enums';
import { AuthUser } from '../../types/interfaces';

const mockUsageRepo = () => ({
  create: jest.fn().mockImplementation((d) => ({ id: 'usage-uuid', ...d })),
  save: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'usage-uuid', ...d })),
  find: jest.fn().mockResolvedValue([]),
  findOneBy: jest.fn().mockResolvedValue(null),
});

const mockReagentSvc = () => ({
  findOne: jest.fn(),
  adjustStock: jest.fn(),
});

const mockConsumableSvc = () => ({
  findOne: jest.fn(),
  adjustStock: jest.fn(),
});

const mockAuditSvc = () => ({
  record: jest.fn().mockResolvedValue(undefined),
});

const studentUser: AuthUser = { id: 'stu-1', role: Role.Student, name: 'Student A' };
const researcherUser: AuthUser = { id: 'res-1', role: Role.Researcher, name: 'Researcher B' };
const labManagerUser: AuthUser = { id: 'mgr-1', role: Role.LabManager, name: 'Manager C' };

const safeReagent = { id: 'reagent-safe', hazardLevel: HazardLevel.Safe, name: 'NaCl', currentStock: 100 } as any;
const toxicReagent = { id: 'reagent-toxic', hazardLevel: HazardLevel.Toxic, name: 'Cyanide', currentStock: 50 } as any;
const explosiveReagent = { id: 'reagent-exp', hazardLevel: HazardLevel.Explosive, name: 'TNT', currentStock: 20 } as any;

describe('UsageService - 领用审批逻辑', () => {
  let service: UsageService;
  let reagentSvc: jest.Mocked<ReagentService>;
  let consumableSvc: jest.Mocked<ConsumableService>;
  let usageRepo: ReturnType<typeof mockUsageRepo>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsageService,
        { provide: getRepositoryToken(UsageRecord), useFactory: mockUsageRepo },
        { provide: ReagentService, useFactory: mockReagentSvc },
        { provide: ConsumableService, useFactory: mockConsumableSvc },
        { provide: AuditService, useFactory: mockAuditSvc },
      ],
    }).compile();

    service = module.get(UsageService);
    reagentSvc = module.get(ReagentService) as jest.Mocked<ReagentService>;
    consumableSvc = module.get(ConsumableService) as jest.Mocked<ConsumableService>;
    usageRepo = module.get(getRepositoryToken(UsageRecord)) as ReturnType<typeof mockUsageRepo>;

    jest.clearAllMocks();
  });

  describe('高危试剂 (Toxic/Explosive) 审批状态 - 回归测试', () => {
    it('学生领用 Toxic 试剂 → 应标记为 Pending 等待审批（关键修复场景）', async () => {
      reagentSvc.findOne.mockResolvedValueOnce(toxicReagent);

      const result = await service.create(
        { itemId: 'reagent-toxic', itemType: ItemType.Reagent, quantity: 5, purpose: 'test' },
        studentUser,
      );

      expect(result.approvalStatus).toBe(UsageStatus.Pending);
    });

    it('学生领用 Explosive 试剂 → 应标记为 Pending 等待审批', async () => {
      reagentSvc.findOne.mockResolvedValueOnce(explosiveReagent);

      const result = await service.create(
        { itemId: 'reagent-exp', itemType: ItemType.Reagent, quantity: 1, purpose: 'test' },
        studentUser,
      );

      expect(result.approvalStatus).toBe(UsageStatus.Pending);
    });

    it('研究员领用 Toxic 试剂 → 应直接 Approved（不再误判为 Pending）', async () => {
      reagentSvc.findOne.mockResolvedValueOnce(toxicReagent);

      const result = await service.create(
        { itemId: 'reagent-toxic', itemType: ItemType.Reagent, quantity: 2, purpose: 'test' },
        researcherUser,
      );

      expect(result.approvalStatus).toBe(UsageStatus.Approved);
    });

    it('研究员领用 Explosive 试剂 → 应直接 Approved', async () => {
      reagentSvc.findOne.mockResolvedValueOnce(explosiveReagent);

      const result = await service.create(
        { itemId: 'reagent-exp', itemType: ItemType.Reagent, quantity: 1, purpose: 'test' },
        researcherUser,
      );

      expect(result.approvalStatus).toBe(UsageStatus.Approved);
    });

    it('LabManager 领用 Toxic 试剂 → 应直接 Approved', async () => {
      reagentSvc.findOne.mockResolvedValueOnce(toxicReagent);

      const result = await service.create(
        { itemId: 'reagent-toxic', itemType: ItemType.Reagent, quantity: 3, purpose: 'test' },
        labManagerUser,
      );

      expect(result.approvalStatus).toBe(UsageStatus.Approved);
    });
  });

  describe('普通试剂 审批状态', () => {
    it('学生领用 Safe 试剂 → 应直接 Approved', async () => {
      reagentSvc.findOne.mockResolvedValueOnce(safeReagent);

      const result = await service.create(
        { itemId: 'reagent-safe', itemType: ItemType.Reagent, quantity: 10, purpose: 'test' },
        studentUser,
      );

      expect(result.approvalStatus).toBe(UsageStatus.Approved);
    });

    it('研究员领用 Safe 试剂 → 应直接 Approved', async () => {
      reagentSvc.findOne.mockResolvedValueOnce(safeReagent);

      const result = await service.create(
        { itemId: 'reagent-safe', itemType: ItemType.Reagent, quantity: 10, purpose: 'test' },
        researcherUser,
      );

      expect(result.approvalStatus).toBe(UsageStatus.Approved);
    });
  });

  describe('扣库存时机', () => {
    it('Approved 状态 → 立即扣库存', async () => {
      reagentSvc.findOne.mockResolvedValueOnce(safeReagent);

      await service.create(
        { itemId: 'reagent-safe', itemType: ItemType.Reagent, quantity: 10, purpose: 'test' },
        researcherUser,
      );

      expect(reagentSvc.adjustStock).toHaveBeenCalledWith('reagent-safe', -10, researcherUser, 'USE_REAGENT');
    });

    it('学生高危 Pending → 暂不扣库存，等待审批后扣', async () => {
      reagentSvc.findOne.mockResolvedValueOnce(toxicReagent);

      await service.create(
        { itemId: 'reagent-toxic', itemType: ItemType.Reagent, quantity: 5, purpose: 'test' },
        studentUser,
      );

      expect(reagentSvc.adjustStock).not.toHaveBeenCalled();
    });
  });

  describe('耗材领用', () => {
    it('学生领用耗材 → 直接 Approved 并扣库存', async () => {
      const result = await service.create(
        { itemId: 'cons-1', itemType: ItemType.Consumable, quantity: 5, purpose: 'test' },
        studentUser,
      );

      expect(result.approvalStatus).toBe(UsageStatus.Approved);
      expect(consumableSvc.adjustStock).toHaveBeenCalledWith('cons-1', -5, studentUser, 'USE_CONSUMABLE');
    });
  });
});
