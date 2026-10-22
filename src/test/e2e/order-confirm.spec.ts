import { test, expect, type Page } from '@playwright/test';
import {
  chipCount,
  createOrderViaApi,
  listRowCells,
  login,
  metaValue,
  historyOf,
  statusBadge,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

/** 주문 추가 화면에서 기본 입력으로 시뮬레이션하고 확정한다. 확정된 주문 번호를 돌려준다. */
async function confirmOnScreen(page: Page, memo: string): Promise<number> {
  await page.goto('/orders/new');
  await page.getByRole('button', { name: '시뮬레이션 실행' }).click();
  await expect(page.locator('#result')).toBeVisible();
  if (memo) {
    await page.locator('#memo').fill(memo);
  }
  await page.getByRole('button', { name: '주문 확정' }).click();
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  return Number(page.url().match(/\/orders\/(\d+)$/)![1]);
}

test('CFM-01 주문 확정 (정상)', async ({ page }) => {
  const id = await confirmOnScreen(page, 'E2E 테스트');

  await expect(page.locator('h1')).toContainText(`주문 #${id}`);
  await expect(statusBadge(page)).toHaveText('확정');
  await expect(metaValue(page, '작성자')).toHaveText('admin');
  await expect(metaValue(page, '경로')).toHaveText('운항비 최소');
  await expect(metaValue(page, '메모')).toHaveText('E2E 테스트');

  // 상태 이력 1행: 이전 '-', 새 '확정', 변경자 admin
  const history = await historyOf(page);
  expect(history).toHaveLength(1);
  expect(history[0].slice(1)).toEqual(['-', '확정', 'admin']);
});

test('CFM-05 확정 후 목록 반영', async ({ page }) => {
  await page.goto('/orders');
  const before = { confirmed: await chipCount(page, '확정'), all: await chipCount(page, '전체') };

  const id = await confirmOnScreen(page, 'CFM-05');
  await page.goto('/orders');

  // 새 주문이 맨 위에 있다
  await expect(page.locator('table.grid tbody tr').first().getByRole('link', { name: `#${id}`, exact: true }))
    .toBeVisible();
  const cells = await listRowCells(page, id);
  expect(cells[2]).toBe('12,000'); // 총 수량(K)
  expect(cells[3]).toBe('운항비 최소'); // 경로
  expect(cells[6]).toBe('확정'); // 상태
  expect(cells[8]).toBe('admin'); // 작성자

  // '확정' 칩과 '전체' 칩 건수가 1씩 늘었다
  expect(await chipCount(page, '확정')).toBe(before.confirmed + 1);
  expect(await chipCount(page, '전체')).toBe(before.all + 1);
});

test('CFM-08 확정 주문은 마스터 변경에 영향 없음', async ({ page }) => {
  const id = await createOrderViaApi(page, 'CFM-08');

  /** 주문 상세(경로·요약·상세 계획)와 목록 행을 한꺼번에 읽는다 */
  const snapshot = async () => {
    await page.goto(`/orders/${id}`);
    await expect(page.locator('#summary')).not.toBeEmpty();
    await expect(page.locator('#details')).not.toBeEmpty();
    const detail = {
      route: await metaValue(page, '경로').innerText(),
      summary: await page.locator('#summary').innerText(),
      details: await page.locator('#details').innerText(),
    };
    await page.goto('/orders');
    const row = await listRowCells(page, id);
    // 소요 일수·총 비용·경로 (확정 일시는 변하지 않지만 비교 대상에서 뺀다)
    return { detail, route: row[3], days: row[4], totalCost: row[5] };
  };
  const before = await snapshot();

  // 마스터 변경: 척당 일 운항비를 1 올린다(새 시뮬레이션이라면 비용이 달라지는 값)
  await page.goto('/master');
  const shipCost = page.locator('input[name="shipDailyCost"]');
  const original = await shipCost.inputValue();
  try {
    await shipCost.fill(String(Number(original) + 1));
    await page.getByRole('button', { name: '저장' }).click();
    await expect(page.locator('.alert.ok')).toHaveText('마스터 데이터를 저장했습니다');

    const after = await snapshot();
    expect(after).toEqual(before);
  } finally {
    // 다른 시나리오에 영향을 주지 않도록 원래 값으로 되돌린다
    await page.goto('/master');
    await page.locator('input[name="shipDailyCost"]').fill(original);
    await page.getByRole('button', { name: '저장' }).click();
    await expect(page.locator('.alert.ok')).toHaveText('마스터 데이터를 저장했습니다');
  }
});
