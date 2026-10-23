import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { runDefaultSimulation, saveMaster, MASTER_SAVED } from './helpers/master';
import { createOrderViaApi, listRowCells } from './helpers';

const COUNTRIES = ['CHINA', 'JAPAN', 'VIETNAM', 'INDONESIA'];

const eokNumber = (text: string) => Number(/([\d.]+)억원/.exec(text)![1]);

async function summaryValue(page: Page, label: string): Promise<string> {
  const stat = page.locator('#summary .stats > div', { has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) });
  return (await stat.locator('b').innerText()).trim();
}

test.describe('공장 운영비', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('OPC-01 마스터 하루 운영비 기본값은 모든 공장 10(억 원)', async ({ page }) => {
    await page.goto('/master');
    for (const c of COUNTRIES) {
      await expect(page.locator(`input[name=operatingDailyCost_${c}]`)).toHaveValue('10');
    }
  });

  test('OPC-02 하루 운영비 저장 후 유지, 잘못된 값은 저장하지 않음', async ({ page }) => {
    try {
      await saveMaster(page, { operatingDailyCost_CHINA: '12.5' });
      await page.goto('/master');
      await expect(page.locator('input[name=operatingDailyCost_CHINA]')).toHaveValue('12.5');
      expect((await (await page.request.get('/api/master')).json()).factories
        .find((f: any) => f.country === 'CHINA').operatingDailyCostWon).toBe(1_250_000_000);

      await page.fill('input[name=operatingDailyCost_CHINA]', '0');
      await page.getByRole('button', { name: '저장' }).click();
      await expect(page.locator('.alert.error')).toContainText('하루 운영비');
      await page.goto('/master');
      await expect(page.locator('input[name=operatingDailyCost_CHINA]')).toHaveValue('12.5');
    } finally {
      await saveMaster(page, { operatingDailyCost_CHINA: '10' });
    }
  });

  test('OPC-03 주문 추가 카드와 요약에 운영비가 표시되고 총 비용 = 생산 + 운항 + 운영', async ({ page }) => {
    await runDefaultSimulation(page);
    const cards = page.locator('#options .option');
    await expect(cards.nth(0).locator('strong')).toHaveText('총비용 최소');
    for (let i = 0; i < 3; i++) {
      await expect(cards.nth(i)).toContainText(/운영비 [\d.]+억원/);
    }
    for (const label of ['총비용 최소', '가장 빠르게', '가까운 곳부터']) {
      await page.locator('#options .option', { hasText: label }).click();
      const production = eokNumber(await summaryValue(page, '생산 원가'));
      const shipping = eokNumber(await summaryValue(page, '운항비'));
      const operating = eokNumber(await summaryValue(page, '운영비'));
      const total = eokNumber(await summaryValue(page, '총 비용'));
      expect(operating, `${label} 운영비`).toBeGreaterThan(0);
      expect(Math.abs(total - (production + shipping + operating))).toBeLessThanOrEqual(0.011);
    }
  });

  test('OPC-04 확정 후 상세·목록의 총 비용에 운영비 반영', async ({ page }) => {
    await page.goto('/orders/new');
    await page.getByRole('button', { name: '시뮬레이션 실행' }).click();
    await expect(page.locator('#result')).toBeVisible();
    await page.getByRole('button', { name: '주문 확정' }).click();
    await expect(page).toHaveURL(/\/orders\/\d+$/);
    const id = Number(page.url().match(/\/orders\/(\d+)$/)![1]);

    await expect(page.locator('#summary')).not.toBeEmpty();
    const production = eokNumber(await summaryValue(page, '생산 원가'));
    const shipping = eokNumber(await summaryValue(page, '운항비'));
    const operatingText = await summaryValue(page, '운영비');
    expect(operatingText).not.toBe('-');
    const total = eokNumber(await summaryValue(page, '총 비용'));
    expect(Math.abs(total - (production + shipping + eokNumber(operatingText)))).toBeLessThanOrEqual(0.011);

    await page.goto('/orders');
    await expect(page.getByRole('link', { name: `#${id}`, exact: true })).toBeVisible();
    const cells = await listRowCells(page, id);
    expect(cells[6]).toBe(total.toFixed(2)); // 총 비용(억원)
  });

  test('OPC-05 운영비가 없던 때 확정된 주문은 상세 운영비가 -, 총 비용은 저장값 그대로', async ({ page }) => {
    const id = await createOrderViaApi(page, 'OPC-05');
    await page.route(`**/api/orders/${id}`, async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      delete body.plan.plan.operatingCost;
      delete body.plan.plan.operatingDays;
      await route.fulfill({ response: res, json: body });
    });
    await page.goto(`/orders/${id}`);
    await expect(page.locator('#summary')).not.toBeEmpty();
    expect(await summaryValue(page, '운영비')).toBe('-');
    expect(await summaryValue(page, '총 비용')).toMatch(/^[\d.]+억원$/);
  });
});
