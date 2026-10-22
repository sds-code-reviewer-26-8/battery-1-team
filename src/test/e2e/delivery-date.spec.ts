import { test, expect, type Page } from '@playwright/test';
import { login } from './order-helpers';

/** 주문 추가 화면의 '가능한 빨리' 납기일(5~50일) 표시 E2E. 납기일은 저장하지 않는다. */

async function runSimulation(page: Page) {
  await page.getByRole('button', { name: '시뮬레이션 실행' }).click();
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#options .option')).toHaveCount(3);
}

async function days(page: Page): Promise<number[]> {
  const texts = await page.locator('#options .option').allInnerTexts();
  return texts.map((t) => Number(/소요\s*(\d+)일/.exec(t)![1]));
}

async function expectRedMatches(page: Page, due: number) {
  const ds = await days(page);
  const cards = page.locator('#options .option');
  for (let i = 0; i < ds.length; i++) {
    if (ds[i] > due) await expect(cards.nth(i)).toHaveClass(/over-due/);
    else await expect(cards.nth(i)).not.toHaveClass(/over-due/);
  }
}

test.describe('주문 추가 — 납기일', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/orders/new');
  });

  test('체크박스는 기본 해제이고 체크하면 5~50 제한의 납기일 칸이 나타난다', async ({ page }) => {
    const asap = page.getByLabel('가능한 빨리');
    await expect(asap).not.toBeChecked();
    await expect(page.locator('#dueDays')).toBeHidden();
    await asap.check();
    const due = page.locator('#dueDays');
    await expect(due).toBeVisible();
    await expect(due).toHaveAttribute('min', '5');
    await expect(due).toHaveAttribute('max', '50');
    await asap.uncheck();
    await expect(due).toBeHidden();
  });

  test('범위를 벗어난 납기일은 오류를 보이고 빨간 표시를 적용하지 않는다', async ({ page }) => {
    await runSimulation(page);
    await page.getByLabel('가능한 빨리').check();
    for (const bad of ['4', '51']) {
      await page.locator('#dueDays').fill(bad);
      await expect(page.locator('#dueError')).toBeVisible();
      await expect(page.locator('#options .over-due')).toHaveCount(0);
    }
    await page.locator('#dueDays').fill('5');
    await expect(page.locator('#dueError')).toBeHidden();
  });

  test('납기일을 넘는 경로만 빨갛게 표시되고 납기 변경·해제가 바로 반영된다', async ({ page }) => {
    await runSimulation(page);
    await expect(page.locator('#options .over-due')).toHaveCount(0);
    await page.getByLabel('가능한 빨리').check();
    await page.locator('#dueDays').fill('5');
    await expectRedMatches(page, 5);
    await expect(page.locator('#options .over-due').first()).toHaveCSS('color', 'rgb(209, 52, 47)');
    await page.locator('#dueDays').fill('50');
    await expectRedMatches(page, 50);
    await page.locator('#dueDays').fill('5');
    await page.getByLabel('가능한 빨리').uncheck();
    await expect(page.locator('.over-due')).toHaveCount(0);
  });

  test('납기일을 넘는 경로도 주문 확정이 된다', async ({ page }) => {
    await runSimulation(page);
    await page.getByLabel('가능한 빨리').check();
    await page.locator('#dueDays').fill('5');
    await expect(page.locator('#options .over-due').first()).toBeVisible();
    await page.getByRole('button', { name: '주문 확정' }).click();
    await expect(page).toHaveURL(/\/orders\/\d+$/);
  });
});
