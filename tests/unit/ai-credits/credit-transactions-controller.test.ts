import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { list, analytics, exportCSV } from '../../../controllers/AICreditTransactionController';
import AICreditTransaction from '../../../models/AICreditTransaction';
import AICreditType from '../../../models/AICreditType';
import User from '../../../models/User';

// Mock de modelos
jest.mock('../../../models/AICreditTransaction');
jest.mock('../../../models/AICreditType');
jest.mock('../../../models/User');
jest.mock('../../../models/Company');

describe('AICreditTransactionController — Auditoria de creditos IA', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    jest.resetAllMocks();

    mockReq = {
      user: { companyId: 1, id: 10 },
      query: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      send: jest.fn()
    };
  });

  // =====================================================
  // list() — GET /ai/credits/transactions
  // =====================================================
  describe('list() — Historial paginado', () => {
    test('should list transactions with pagination', async () => {
      // Arrange
      const mockTransactions = [
        {
          id: 1,
          companyId: 1,
          creditTypeId: 1,
          amount: 10,
          direction: 'debit',
          balanceBefore: 100,
          balanceAfter: 90,
          source: 'chat',
          sourceId: 'msg-001',
          description: 'Consumo chat IA',
          createdAt: new Date('2026-03-01'),
          creditType: { id: 1, key: 'message', name: 'Mensajes', category: 'text' },
          user: { id: 10, name: 'Test User', email: 'test@chateam.com' }
        },
        {
          id: 2,
          companyId: 1,
          creditTypeId: 2,
          amount: 5,
          direction: 'debit',
          balanceBefore: 50,
          balanceAfter: 45,
          source: 'image_gen',
          sourceId: 'img-001',
          description: 'Generacion de imagen',
          createdAt: new Date('2026-03-01'),
          creditType: { id: 2, key: 'image', name: 'Imagenes', category: 'media' },
          user: { id: 10, name: 'Test User', email: 'test@chateam.com' }
        }
      ];

      const mockFindAndCountAll = AICreditTransaction.findAndCountAll as jest.MockedFunction<typeof AICreditTransaction.findAndCountAll>;
      mockFindAndCountAll.mockResolvedValue({
        rows: mockTransactions as any,
        count: 2
      });

      mockReq.query = { page: '1', limit: '20' };

      // Act
      await list(mockReq, mockRes);

      // Assert
      expect(mockFindAndCountAll).toHaveBeenCalledTimes(1);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockTransactions,
          pagination: {
            page: 1,
            limit: 20,
            total: 2,
            totalPages: 1
          }
        })
      );
    });

    test('should filter by source', async () => {
      // Arrange
      const mockFindAndCountAll = AICreditTransaction.findAndCountAll as jest.MockedFunction<typeof AICreditTransaction.findAndCountAll>;
      mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      mockReq.query = { source: 'chat' };

      // Act
      await list(mockReq, mockRes);

      // Assert
      expect(mockFindAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
            source: 'chat'
          })
        })
      );
    });

    test('should filter by direction', async () => {
      // Arrange
      const mockFindAndCountAll = AICreditTransaction.findAndCountAll as jest.MockedFunction<typeof AICreditTransaction.findAndCountAll>;
      mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      mockReq.query = { direction: 'debit' };

      // Act
      await list(mockReq, mockRes);

      // Assert
      expect(mockFindAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
            direction: 'debit'
          })
        })
      );
    });

    test('should filter by dateRange (dateFrom and dateTo)', async () => {
      // Arrange
      const mockFindAndCountAll = AICreditTransaction.findAndCountAll as jest.MockedFunction<typeof AICreditTransaction.findAndCountAll>;
      mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      mockReq.query = {
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28'
      };

      // Act
      await list(mockReq, mockRes);

      // Assert
      expect(mockFindAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
            createdAt: expect.any(Object)
          })
        })
      );
    });

    test('should ignore invalid direction values', async () => {
      // Arrange
      const mockFindAndCountAll = AICreditTransaction.findAndCountAll as jest.MockedFunction<typeof AICreditTransaction.findAndCountAll>;
      mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      mockReq.query = { direction: 'invalid_value' };

      // Act
      await list(mockReq, mockRes);

      // Assert — direction invalido no se incluye en el where
      const callArgs = mockFindAndCountAll.mock.calls[0][0] as any;
      expect(callArgs.where.direction).toBeUndefined();
    });

    test('should cap limit to 100 max', async () => {
      // Arrange
      const mockFindAndCountAll = AICreditTransaction.findAndCountAll as jest.MockedFunction<typeof AICreditTransaction.findAndCountAll>;
      mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      mockReq.query = { limit: '500' };

      // Act
      await list(mockReq, mockRes);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            limit: 100
          })
        })
      );
    });

    test('should default page to 1 and limit to 20', async () => {
      // Arrange
      const mockFindAndCountAll = AICreditTransaction.findAndCountAll as jest.MockedFunction<typeof AICreditTransaction.findAndCountAll>;
      mockFindAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      mockReq.query = {};

      // Act
      await list(mockReq, mockRes);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            page: 1,
            limit: 20
          })
        })
      );
    });
  });

  // =====================================================
  // analytics() — GET /ai/credits/analytics
  // =====================================================
  describe('analytics() — KPIs de consumo', () => {
    test('should return analytics with totals, byType, bySource, daily', async () => {
      // Arrange
      const mockByType = [
        {
          creditTypeId: 1,
          totalAmount: 150,
          transactionCount: 30,
          creditType: { key: 'message', name: 'Mensajes', category: 'text' }
        }
      ];

      const mockBySource = [
        { source: 'chat', totalAmount: '120', transactionCount: '25' },
        { source: 'agent', totalAmount: '30', transactionCount: '5' }
      ];

      const mockDaily = [
        { date: '2026-03-01', totalAmount: '50', transactionCount: '10' },
        { date: '2026-03-02', totalAmount: '100', transactionCount: '20' }
      ];

      const mockTotals = {
        totalDebited: '150',
        totalTransactions: '30'
      };

      const mockTotalCredited = {
        totalCredited: '500'
      };

      const mockFindAll = AICreditTransaction.findAll as jest.MockedFunction<typeof AICreditTransaction.findAll>;
      // Llamada 1: byType, Llamada 2: bySource, Llamada 3: daily
      mockFindAll
        .mockResolvedValueOnce(mockByType as any)
        .mockResolvedValueOnce(mockBySource as any)
        .mockResolvedValueOnce(mockDaily as any);

      const mockFindOne = AICreditTransaction.findOne as jest.MockedFunction<typeof AICreditTransaction.findOne>;
      // Llamada 1: totals debitos, Llamada 2: total creditado
      mockFindOne
        .mockResolvedValueOnce(mockTotals as any)
        .mockResolvedValueOnce(mockTotalCredited as any);

      mockReq.query = { days: '30' };

      // Act
      await analytics(mockReq, mockRes);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            period: expect.objectContaining({
              days: 30
            }),
            totals: expect.objectContaining({
              debited: 150,
              credited: 500,
              transactions: 30
            }),
            byType: mockByType,
            bySource: mockBySource,
            daily: mockDaily
          })
        })
      );
    });

    test('should default to 30 days when days param not specified', async () => {
      // Arrange
      const mockFindAll = AICreditTransaction.findAll as jest.MockedFunction<typeof AICreditTransaction.findAll>;
      mockFindAll.mockResolvedValue([]);

      const mockFindOne = AICreditTransaction.findOne as jest.MockedFunction<typeof AICreditTransaction.findOne>;
      mockFindOne.mockResolvedValue({ totalDebited: '0', totalTransactions: '0', totalCredited: '0' } as any);

      mockReq.query = {};

      // Act
      await analytics(mockReq, mockRes);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            period: expect.objectContaining({
              days: 30
            })
          })
        })
      );
    });

    test('should cap days to 90 max', async () => {
      // Arrange
      const mockFindAll = AICreditTransaction.findAll as jest.MockedFunction<typeof AICreditTransaction.findAll>;
      mockFindAll.mockResolvedValue([]);

      const mockFindOne = AICreditTransaction.findOne as jest.MockedFunction<typeof AICreditTransaction.findOne>;
      mockFindOne.mockResolvedValue({ totalDebited: '0', totalTransactions: '0', totalCredited: '0' } as any);

      mockReq.query = { days: '365' };

      // Act
      await analytics(mockReq, mockRes);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            period: expect.objectContaining({
              days: 90
            })
          })
        })
      );
    });

    test('should handle zero totals gracefully', async () => {
      // Arrange
      const mockFindAll = AICreditTransaction.findAll as jest.MockedFunction<typeof AICreditTransaction.findAll>;
      mockFindAll.mockResolvedValue([]);

      const mockFindOne = AICreditTransaction.findOne as jest.MockedFunction<typeof AICreditTransaction.findOne>;
      mockFindOne
        .mockResolvedValueOnce({ totalDebited: null, totalTransactions: null } as any)
        .mockResolvedValueOnce({ totalCredited: null } as any);

      mockReq.query = { days: '7' };

      // Act
      await analytics(mockReq, mockRes);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totals: {
              debited: 0,
              credited: 0,
              transactions: 0
            }
          })
        })
      );
    });
  });

  // =====================================================
  // exportCSV() — GET /ai/credits/transactions/export
  // =====================================================
  describe('exportCSV() — Exportar CSV', () => {
    test('should export CSV with correct headers and Content-Type', async () => {
      // Arrange
      const mockTransactions = [
        {
          id: 1,
          createdAt: new Date('2026-03-01T10:00:00Z'),
          creditType: { name: 'Mensajes' },
          direction: 'debit',
          amount: 10,
          balanceBefore: 100,
          balanceAfter: 90,
          source: 'chat',
          sourceId: 'msg-001',
          description: 'Consumo chat IA',
          user: { name: 'Test User', email: 'test@chateam.com' },
          creditTypeId: 1
        },
        {
          id: 2,
          createdAt: new Date('2026-03-01T11:00:00Z'),
          creditType: { name: 'Imagenes' },
          direction: 'credit',
          amount: 500,
          balanceBefore: 0,
          balanceAfter: 500,
          source: 'provision',
          sourceId: null,
          description: 'Provision mensual',
          user: null,
          creditTypeId: 2
        }
      ];

      const mockFindAll = AICreditTransaction.findAll as jest.MockedFunction<typeof AICreditTransaction.findAll>;
      mockFindAll.mockResolvedValue(mockTransactions as any);

      mockReq.query = {};

      // Act
      await exportCSV(mockReq, mockRes);

      // Assert — headers HTTP correctos
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('creditos-ia-1-')
      );

      // Assert — contenido CSV
      const csvContent = mockRes.send.mock.calls[0][0] as string;
      expect(csvContent).toContain('Fecha,Tipo,Direccion,Cantidad,Balance Antes,Balance Despues,Fuente,ID Fuente,Descripcion,Usuario');
      expect(csvContent).toContain('"Mensajes"');
      expect(csvContent).toContain('"debit"');
      expect(csvContent).toContain('"Imagenes"');
      expect(csvContent).toContain('"credit"');
    });

    test('should use "Sistema" as user name when user is null', async () => {
      // Arrange
      const mockTransactions = [
        {
          id: 1,
          createdAt: new Date('2026-03-01T10:00:00Z'),
          creditType: { name: 'Mensajes' },
          direction: 'credit',
          amount: 500,
          balanceBefore: 0,
          balanceAfter: 500,
          source: 'provision',
          sourceId: null,
          description: 'Provision automatica',
          user: null,
          creditTypeId: 1
        }
      ];

      const mockFindAll = AICreditTransaction.findAll as jest.MockedFunction<typeof AICreditTransaction.findAll>;
      mockFindAll.mockResolvedValue(mockTransactions as any);

      mockReq.query = {};

      // Act
      await exportCSV(mockReq, mockRes);

      // Assert
      const csvContent = mockRes.send.mock.calls[0][0] as string;
      expect(csvContent).toContain('"Sistema"');
    });

    test('should filter by date range in CSV export', async () => {
      // Arrange
      const mockFindAll = AICreditTransaction.findAll as jest.MockedFunction<typeof AICreditTransaction.findAll>;
      mockFindAll.mockResolvedValue([]);

      mockReq.query = {
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28'
      };

      // Act
      await exportCSV(mockReq, mockRes);

      // Assert
      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
            createdAt: expect.any(Object)
          })
        })
      );
    });

    test('should limit export to 10000 rows', async () => {
      // Arrange
      const mockFindAll = AICreditTransaction.findAll as jest.MockedFunction<typeof AICreditTransaction.findAll>;
      mockFindAll.mockResolvedValue([]);

      mockReq.query = {};

      // Act
      await exportCSV(mockReq, mockRes);

      // Assert
      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10000
        })
      );
    });

    test('should escape double quotes in description for CSV', async () => {
      // Arrange
      const mockTransactions = [
        {
          id: 1,
          createdAt: new Date('2026-03-01T10:00:00Z'),
          creditType: { name: 'Mensajes' },
          direction: 'debit',
          amount: 10,
          balanceBefore: 100,
          balanceAfter: 90,
          source: 'chat',
          sourceId: 'msg-001',
          description: 'Respuesta con "comillas" internas',
          user: { name: 'Test User', email: 'test@chateam.com' },
          creditTypeId: 1
        }
      ];

      const mockFindAll = AICreditTransaction.findAll as jest.MockedFunction<typeof AICreditTransaction.findAll>;
      mockFindAll.mockResolvedValue(mockTransactions as any);

      mockReq.query = {};

      // Act
      await exportCSV(mockReq, mockRes);

      // Assert — double quotes escapadas como ""
      const csvContent = mockRes.send.mock.calls[0][0] as string;
      expect(csvContent).toContain('""comillas""');
    });

    test('should handle creditType being null in CSV row', async () => {
      // Arrange
      const mockTransactions = [
        {
          id: 1,
          createdAt: new Date('2026-03-01T10:00:00Z'),
          creditType: null,
          direction: 'debit',
          amount: 10,
          balanceBefore: 100,
          balanceAfter: 90,
          source: 'chat',
          sourceId: null,
          description: 'Sin tipo',
          user: null,
          creditTypeId: 99
        }
      ];

      const mockFindAll = AICreditTransaction.findAll as jest.MockedFunction<typeof AICreditTransaction.findAll>;
      mockFindAll.mockResolvedValue(mockTransactions as any);

      mockReq.query = {};

      // Act
      await exportCSV(mockReq, mockRes);

      // Assert — usa creditTypeId como fallback
      const csvContent = mockRes.send.mock.calls[0][0] as string;
      expect(csvContent).toContain('"99"');
    });
  });
});
