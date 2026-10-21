import { expect, test } from '@playwright/test';
import { login } from './helpers/auth';
import { restore, runDefaultSimulation, saveMaster, MASTER_SAVED } from './helpers/master';

test.describe('마스터 데이터 (MST)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // 마스터를 바꾸는 테스트는 실패해도 원래 값(배 3척)으로 되돌린다.
  test.describe('마스터를 바꾸는 시나리오', () => {
    test.afterEach(async ({ page }) => {
      await restore.shipCount(page);
    });

    test('MST-02-TC01 배 척수 저장 후 새로고침해도 유지', async ({ page }) => {
      await page.goto('/master');
      await page.fill('input[name=shipCount]', '2');
      await page.getByRole('button', { name: '저장' }).click();
      await expect(page.locator('.alert.ok')).toHaveText(MASTER_SAVED);

      await page.goto('/master');
      await expect(page.locator('input[name=shipCount]')).toHaveValue('2');
    });

    test('MST-03-TC01 배 1척으로 저장하면 시뮬레이션이 1척으로 계산', async ({ page }) => {
      await saveMaster(page, { shipCount: '1' });
      await runDefaultSimulation(page);

      const options = page.locator('#options .option');
      for (let i = 0; i < 3; i++) {
        await expect(options.nth(i)).toContainText('배 1척');
      }
    });

    test('MST-09-TC01 마스터 저장 시 version 1 증가', async ({ page }) => {
      const readVersion = async () => (await (await page.request.get('/api/master')).json()).version as number;

      const before = await readVersion();
      await saveMaster(page, { shipCount: '2' });
      expect(await readVersion()).toBe(before + 1);
    });
  });

  test('MST-01-TC01 공장 기본값', async ({ page }) => {
    await page.goto('/master');
    const expected = {
      CHINA: [400, 4000, 700],
      JAPAN: [800, 2000, 900],
      VIETNAM: [200, 10000, 550],
      INDONESIA: [300, 7000, 450],
    };
    for (const [country, [maxDaily, stockLimit, unitCost]] of Object.entries(expected)) {
      await expect(page.locator(`input[name=maxDaily_${country}]`)).toHaveValue(String(maxDaily));
      await expect(page.locator(`input[name=stockLimit_${country}]`)).toHaveValue(String(stockLimit));
      await expect(page.locator(`input[name=unitCost_${country}]`)).toHaveValue(String(unitCost));
    }
  });

  test('MST-01-TC02 선박 기본값', async ({ page }) => {
    await page.goto('/master');
    await expect(page.locator('input[name=shipCount]')).toHaveValue('3');
    await expect(page.locator('input[name=shipDailyCost]')).toHaveValue('1');
  });

  test('MST-01-TC03 항로 10칸 기본값', async ({ page }) => {
    await page.goto('/master');
    const expected: Record<string, number> = {
      KOREA_CHINA: 1, KOREA_JAPAN: 2, KOREA_VIETNAM: 5, KOREA_INDONESIA: 7,
      CHINA_JAPAN: 2, CHINA_VIETNAM: 4, CHINA_INDONESIA: 6,
      JAPAN_VIETNAM: 5, JAPAN_INDONESIA: 7,
      VIETNAM_INDONESIA: 2,
    };
    await expect(page.locator('input[name^=days_]')).toHaveCount(10);
    for (const [route, days] of Object.entries(expected)) {
      await expect(page.locator(`input[name=days_${route}]`)).toHaveValue(String(days));
    }
  });

  test('MST-03-TC02 기본값(배 3척)에서는 운항비 최소만 1척, 나머지는 3척 — 대조군', async ({ page }) => {
    await runDefaultSimulation(page);
    const options = page.locator('#options .option');
    await expect(options.nth(0)).toContainText('배 1척'); // 운항비 최소
    await expect(options.nth(1)).toContainText('배 3척'); // 가장 빠르게
    await expect(options.nth(2)).toContainText('배 3척'); // 가까운 곳부터
  });
});
