"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../config/database', () => ({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));
const featureFlagService_js_1 = require("./featureFlagService.js");
describe('FeatureFlagService premium targeting', () => {
    const service = featureFlagService_js_1.FeatureFlagService.getInstance();
    const evaluateFlag = service.evaluateFlag.bind(service);
    const baseFlag = {
        id: 'flag-1',
        flag_name: 'test_flag',
        description: 'Test',
        is_enabled: true,
        access_level: 'public',
        category: 'ui',
        rollout_percentage: 100,
        target_criteria: {},
        dependencies: [],
    };
    afterEach(() => {
        ;
        service.flagCache?.clear?.();
    });
    it('requires any premium when require_premium is true', async () => {
        const flag = { ...baseFlag, target_criteria: { require_premium: true } };
        await expect(evaluateFlag(flag, { id: 'user-free', premiumTier: 'free', hasPremium: false })).resolves.toBe(false);
        await expect(evaluateFlag(flag, { id: 'user-pro', premiumTier: 'pro', hasPremium: true })).resolves.toBe(true);
    });
    it('enforces minimum premium tier hierarchy', async () => {
        const flag = { ...baseFlag, target_criteria: { minimum_premium_tier: 'pro' } };
        await expect(evaluateFlag(flag, { id: 'user-premium', premiumTier: 'premium', hasPremium: true })).resolves.toBe(false);
        await expect(evaluateFlag(flag, { id: 'user-pro', premiumTier: 'pro', hasPremium: true })).resolves.toBe(true);
        await expect(evaluateFlag(flag, { id: 'user-enterprise', premiumTier: 'enterprise', hasPremium: true })).resolves.toBe(true);
    });
    it('accepts shorthand min_premium_tier and defaults user tier when missing', async () => {
        const flag = { ...baseFlag, target_criteria: { min_premium_tier: 'premium' } };
        await expect(evaluateFlag(flag, { id: 'user-no-tier' })).resolves.toBe(false);
        await expect(evaluateFlag(flag, { id: 'user-premium', premiumTier: 'premium' })).resolves.toBe(true);
    });
});
//# sourceMappingURL=featureFlagService.test.js.map