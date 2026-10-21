import { expect, test } from '@playwright/test';
import { login } from './helpers/auth';

const EQUAL = { CHINA: 3000, JAPAN: 3000, VIETNAM: 3000, INDONESIA: 3000 };
const eok = (won: number) => (won / 1e8).toFixed(2);

test.describe('API', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('API-02-TC01 중국 400K 단독 주문 계산', async ({ page }) => {
    const res = await page.request.post('/api/simulate', { data: { orders: { CHINA: 400 } } });
    expect(res.status()).toBe(200);
    const cost = (await res.json()).options.find((o: any) => o.type === 'COST');

    expect(cost.ships[0].trips[0].stops[0]).toMatchObject({ country: 'CHINA', arriveDay: 1 });
    expect(cost.totalDays).toBe(2);
    expect(cost.shippingCost).toBe(200_000_000);
  });

  test('API-02-TC02 중국 400K 단독 — 세 옵션 모두 동일 일정', async ({ page }) => {
    const res = await page.request.post('/api/simulate', { data: { orders: { CHINA: 400 } } });
    const { options } = await res.json();

    expect(options).toHaveLength(3);
    for (const o of options) {
      expect(o.totalDays).toBe(2);
      expect(o.shippingCost).toBe(200_000_000);
    }
  });

  test('API-10-TC01 조작한 비용·경로 값을 보내도 서버 재계산 값이 저장됨', async ({ page }) => {
    const sim = await (await page.request.post('/api/simulate', { data: { orders: EQUAL } })).json();
    const cost = sim.options.find((o: any) => o.type === 'COST');

    const res = await page.request.post('/api/orders', {
      data: {
        orders: EQUAL, routeType: 'COST', masterVersion: sim.master.version, memo: '변조 테스트',
        totalCost: 1, totalDays: 1, shippingCost: 1, productionCost: 1, plan: { totalCost: 1 },
      },
    });
    expect(res.status()).toBe(200);
    const { id } = await res.json();

    await page.goto(`/orders/${id}`);
    const stats = page.locator('#summary .stats');
    await expect(stats.locator('div', { hasText: '총 비용' })).toContainText(`${eok(cost.totalCost)}억원`);
    await expect(stats.locator('div', { hasText: '소요 일수' })).toContainText(`${cost.totalDays}일`);
    await expect(stats.locator('div', { hasText: '운항비' })).toContainText(`${eok(cost.shippingCost)}억원`);
  });

  test('API-10-TC02 서버가 받은 수량으로 계산한 값이 저장됨', async ({ page }) => {
    const sim = await (await page.request.post('/api/simulate', { data: { orders: { CHINA: 400 } } })).json();

    const res = await page.request.post('/api/orders', {
      data: { orders: { CHINA: 400 }, routeType: 'COST', masterVersion: sim.master.version, memo: '', totalCost: 1 },
    });
    expect(res.status()).toBe(200);
    const { id } = await res.json();

    await page.goto(`/orders/${id}`);
    const stats = page.locator('#summary .stats');
    await expect(stats.locator('div', { hasText: '총 수량' })).toContainText('400K');
    await expect(stats.locator('div', { hasText: '총 비용' })).toContainText('4.80억원'); // 운항비 2억 + 생산비 2.8억
  });
});
