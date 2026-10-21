import { test, expect } from '@playwright/test';
import { apiLogin, EVEN_ORDERS } from './helpers';

// API-01 시뮬레이션 응답 구조 (마스터 초기값 기준)
test.describe('API-01 시뮬레이션 응답 구조', () => {
	test.beforeEach(async ({ request }) => {
		await apiLogin(request);
	});

	const simulate = (request: import('@playwright/test').APIRequestContext) =>
		request.post('/api/simulate', { data: { orders: EVEN_ORDERS } });

	test('API-01-TC01 시뮬레이션 API 응답 상태와 경로 3종', async ({ request }) => {
		const res = await simulate(request);
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.options).toHaveLength(3);
		expect(body.options.map((o: { type: string }) => o.type)).toEqual(['COST', 'FAST', 'NEAR']);
	});

	test('API-01-TC02 나라별 필요 방문 횟수', async ({ request }) => {
		const body = await (await simulate(request)).json();
		// 일본 재고 상한 2,000K < 주문 3,000K → 올림 2회
		expect(body.visits).toEqual({ CHINA: 1, JAPAN: 2, VIETNAM: 1, INDONESIA: 1 });
	});

	test('API-01-TC03 응답의 마스터와 일별 재고 구조', async ({ request }) => {
		const body = await (await simulate(request)).json();
		expect(body.master.factories).toHaveLength(4);
		expect(Array.isArray(body.options[0].stock.CHINA)).toBe(true);
	});
});
