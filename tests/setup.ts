import dotenv from 'dotenv';

// Cargar variables de entorno de test (si existe .env.test)
dotenv.config({ path: '.env.test' });

// Defaults seguros para tests: garantizan que config/auth.ts no aborte.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'jest_test_jwt_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
}
if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
  process.env.JWT_REFRESH_SECRET = 'jest_test_jwt_refresh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
}

// Configuración global de tests
beforeAll(async () => {
  // Setup global de tests
  console.log('🧪 Configurando tests...');
});

afterAll(async () => {
  // Cleanup global de tests
  console.log('🧪 Limpiando tests...');
});

// Mock de dependencias externas
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/test'
        })
      }
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_123' } }
      })
    }
  }));
});

// Mock de base de datos para tests unitarios
jest.mock('../database', () => ({
  sequelize: {
    transaction: jest.fn().mockImplementation((fn) => fn({
      sequelize: {
        query: jest.fn()
      }
    }))
  }
}));