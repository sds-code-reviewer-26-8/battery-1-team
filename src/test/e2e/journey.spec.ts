import { expect, Page, test } from '@playwright/test';
import { login } from './helpers/auth';
import { restore, runDefaultSimulation, saveMaster } from './helpers/master';

/** 기본 입력으로 시뮬레이션 후 확정하고, 생산 원가 표시와 주문 번호를 돌려준다. */
async function simulateAndConfirm(page: Page, expectedProduction: string) {
  await runDefaultSimulation(page);
  await expect(page.locator('#summary .stats div', { hasText: '생산 원가' })).toContainText(expectedProduction);
  await page.click('#confirmBtn');
  await page.waitForURL(/\/orders\/\d+$/);
  return page.url().match(/\/orders\/(\d+)$/)![1];
}

test.describe('여정 (JRN)', () => {
  test.afterEach(async ({ page }) => {
    await restore.chinaUnitCost(page);
  });

  test('JRN-02-TC01 기준 값을 바꿔도 이미 확정한 주문은 그대로', async ({ page }) => {
    await login(page);

    const orderA = await simulateAndConfirm(page, '78.00억원');

    await saveMaster(page, { unitCost_CHINA: '800' });
    const orderB = await simulateAndConfirm(page, '81.00억원'); // 중국 3,000K × 1,000 × 100원 = 3억 증가
    expect(orderB).not.toBe(orderA);

    await page.goto(`/orders/${orderA}`);
    await expect(page.locator('#summary .stats div', { hasText: '생산 원가' })).toContainText('78.00억원');

    await page.locator('#details details', { hasText: '배 3척' }).locator('summary').click();
    const factories = page.locator('#details table', { hasText: '셀당 원가(원)' });
    await expect(factories.locator('tr', { hasText: '중국' }).locator('td').nth(3)).toHaveText('700');
  });
});
