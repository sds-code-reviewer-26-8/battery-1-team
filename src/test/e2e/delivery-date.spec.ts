import { test, expect, type Page } from '@playwright/test';
import { login } from './order-helpers';

/** 주문 추가 화면의 '가능한 빨리' 납기일(5~50일) 표시 E2E. 확정하면 납기일이 주문에 저장된다. */

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

  test('납기일을 넘는 경로도 확인창을 수락하면 주문 확정이 된다', async ({ page }) => {
    await runSimulation(page);
    await page.getByLabel('가능한 빨리').check();
    await page.locator('#dueDays').fill('5');
    await expect(page.locator('#options .over-due').first()).toBeVisible();
    const total = Number((await page.locator('#summary .stats b').nth(1).innerText()).replace(/\D/g, ''));
    let message = '';
    page.once('dialog', async (d) => {
      message = d.message();
      await d.accept();
    });
    await page.getByRole('button', { name: '주문 확정' }).click();
    await expect(page).toHaveURL(/\/orders\/\d+$/);
    expect(message).toBe(`납기를 ${total - 5}일 초과합니다. 확정할까요?`);
    await expect(page.locator('#meta')).toContainText('납기');
    await expect(page.locator('#meta')).toContainText('5일');
  });

  test('납기 초과 확인창을 취소하면 확정하지 않고 주문 추가 화면에 머문다', async ({ page }) => {
    await runSimulation(page);
    await page.getByLabel('가능한 빨리').check();
    await page.locator('#dueDays').fill('5');
    let asked = 0;
    page.on('dialog', async (d) => {
      asked++;
      await d.dismiss();
    });
    await page.getByRole('button', { name: '주문 확정' }).click();
    await expect.poll(() => asked).toBe(1);
    await expect(page).toHaveURL(/\/orders\/new$/);
    await expect(page.getByRole('button', { name: '주문 확정' })).toBeEnabled();
  });

  test('납기 이하이거나 납기가 없으면 확인창 없이 확정된다', async ({ page }) => {
    let asked = 0;
    page.on('dialog', async (d) => {
      asked++;
      await d.accept();
    });
    await runSimulation(page);
    await page.getByLabel('가능한 빨리').check();
    await page.locator('#dueDays').fill('50');
    await page.getByRole('button', { name: '주문 확정' }).click();
    await expect(page).toHaveURL(/\/orders\/\d+$/);
    await page.goto('/orders/new');
    await runSimulation(page);
    await page.getByRole('button', { name: '주문 확정' }).click();
    await expect(page).toHaveURL(/\/orders\/\d+$/);
    expect(asked).toBe(0);
  });

  test('납기를 선택하지 않고 확정하면 상세와 목록의 납기는 -이다', async ({ page }) => {
    await runSimulation(page);
    await page.getByRole('button', { name: '주문 확정' }).click();
    await expect(page).toHaveURL(/\/orders\/\d+$/);
    await expect(page.locator('#meta div', { hasText: '납기' })).toContainText('-');
    await page.goto('/orders');
    await expect(page.locator('th', { hasText: '납기' })).toBeVisible();
    await expect(page.locator('#rows tr').first().locator('td').nth(5)).toHaveText('-');
  });

  test('납기를 체크하고 범위 밖 값이면 확정하지 않는다', async ({ page }) => {
    await runSimulation(page);
    await page.getByLabel('가능한 빨리').check();
    await page.locator('#dueDays').fill('4');
    await page.getByRole('button', { name: '주문 확정' }).click();
    await expect(page.locator('#confirmError')).toBeVisible();
    await expect(page).toHaveURL(/\/orders\/new$/);
  });
});

async function confirmWithDue(page: Page, due: number | null): Promise<string> {
  await page.goto('/orders/new');
  await runSimulation(page);
  if (due !== null) {
    await page.getByLabel('가능한 빨리').check();
    await page.locator('#dueDays').fill(String(due));
  }
  await page.getByRole('button', { name: '주문 확정' }).click();
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  return page.url().split('/').pop()!;
}

const RED = 'rgb(209, 52, 47)';

test.describe('납기 초과 주문 빨간 표시', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept()); // 납기 초과 확정 확인창은 수락한다
    await login(page);
  });

  test('초과 주문은 목록과 상세에서 빨갛고, 이하·NULL은 빨갛지 않다', async ({ page }) => {
    const over = await confirmWithDue(page, 5);
    await expect(page.locator('#meta dd.over-due')).toHaveCSS('color', RED);
    await expect(page.locator('#summary .stats b.over-due')).toHaveCount(1);
    const ok = await confirmWithDue(page, 50);
    await expect(page.locator('#meta dd.over-due')).toHaveCount(0);
    await expect(page.locator('#summary .over-due')).toHaveCount(0);
    const nul = await confirmWithDue(page, null);
    await expect(page.locator('.over-due')).toHaveCount(0);

    await page.goto('/orders');
    const cells = (id: string) => page.locator('#rows tr', { has: page.locator(`a[href="/orders/${id}"]`) }).locator('td');
    await expect(cells(over).nth(4)).toHaveClass(/over-due/);
    await expect(cells(over).nth(5)).toHaveCSS('color', RED);
    await expect(cells(ok).nth(4)).not.toHaveClass(/over-due/);
    await expect(cells(nul).nth(5)).toHaveText('-');
    await expect(cells(nul).nth(5)).not.toHaveClass(/over-due/);
  });

  test('선택한 경로 카드도 초과면 빨간 테두리·글자·연한 빨강 배경이다', async ({ page }) => {
    await page.goto('/orders/new');
    await runSimulation(page);
    await page.getByLabel('가능한 빨리').check();
    await page.locator('#dueDays').fill('5');
    await page.locator('#options .option.over-due').first().click();
    const card = page.locator('#options .option.selected');
    await expect(card).toHaveCount(1);
    await expect(card).toHaveClass(/over-due/);
    await expect(card).toHaveClass(/selected/);
    await expect(card).toHaveCSS('color', RED);
    await expect(card).toHaveCSS('border-top-color', RED);
    await expect(card).toHaveCSS('background-color', 'rgb(255, 241, 240)');
  });

  test('경계값: 소요 일수와 납기가 같으면 빨갛지 않고, 하루 짧으면 빨갛다', async ({ page }) => {
    await page.goto('/orders/new');
    await runSimulation(page);
    const days = Number((await page.locator('#summary .stats b').nth(1).innerText()).replace(/\D/g, ''));
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(50);
    const same = await confirmWithDue(page, days);
    await expect(page.locator('#meta dd.over-due')).toHaveCount(0);
    await expect(page.locator('#summary .over-due')).toHaveCount(0);
    const short = await confirmWithDue(page, days - 1);
    await expect(page.locator('#meta dd.over-due')).toHaveCount(1);
    await page.goto('/orders');
    const cells = (id: string) => page.locator('#rows tr', { has: page.locator(`a[href="/orders/${id}"]`) }).locator('td');
    await expect(cells(same).nth(5)).not.toHaveClass(/over-due/);
    await expect(cells(short).nth(5)).toHaveClass(/over-due/);
  });
});
