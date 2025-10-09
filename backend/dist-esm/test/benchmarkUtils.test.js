"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const benchmarkUtils_js_1 = require("../utils/benchmarkUtils.js");
describe('comparePerformance', () => {
    it('handles zero baseline metrics without producing infinite values', () => {
        const baseline = {
            avgResponseTime: 120,
            requestsPerSecond: 0,
            errorRate: 0,
        };
        const current = {
            avgResponseTime: 150,
            requestsPerSecond: 200,
            errorRate: 1,
        };
        const result = (0, benchmarkUtils_js_1.comparePerformance)(baseline, current);
        expect(Number.isFinite(result.throughput.change)).toBe(true);
        expect(result.throughput.improvement).toBe(true);
        expect(Number.isFinite(result.errorRate.change)).toBe(true);
        expect(result.errorRate.improvement).toBe(false);
        expect(result.errorRate.change).toBe(1);
        expect(Number.isFinite(result.responseTime.change)).toBe(true);
        expect(result.responseTime.improvement).toBe(false);
    });
    it('returns neutral change when both snapshots are zeroed', () => {
        const baseline = {
            avgResponseTime: 0,
            requestsPerSecond: 0,
            errorRate: 0,
        };
        const current = {
            avgResponseTime: 0,
            requestsPerSecond: 0,
            errorRate: 0,
        };
        const result = (0, benchmarkUtils_js_1.comparePerformance)(baseline, current);
        expect(result.responseTime).toEqual({ change: 0, improvement: false });
        expect(result.throughput).toEqual({ change: 0, improvement: false });
        expect(result.errorRate).toEqual({ change: 0, improvement: false });
    });
});
//# sourceMappingURL=benchmarkUtils.test.js.map