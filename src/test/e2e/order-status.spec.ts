import { test, expect } from '@playwright/test';
import {
  changeStatus,
  chipCount,
  createOrderViaApi,
  historyOf,
  historyRows,
  listRow,
  login,
  metaValue,
  statusBadge,
  statusButtons,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('STS-01 상세 화면 구성 (확정 상태)', async ({ page }) => {
  const id = await createOrderViaApi(page, 'STS-01');
  await page.goto(`/orders/${id}`);

  await expect(statusBadge(page)).toHaveText('확정');
  await expect(metaValue(page, '확정 일시')).not.toBeEmpty();
  await expect(metaValue(page, '작성자')).toHaveText('admin');
  await expect(metaValue(page, '경로')).toHaveText('총비용 최소');
  await expect(metaValue(page, '메모')).toHaveText('STS-01');

  // 확정 상태에서는 고객사 이름을 수정할 수 있다
  await expect(page.locator('#customerName')).toBeEnabled();
  await expect(page.locator('#customerForm button')).toBeEnabled();

  // 버튼은 '진행(으)로 변경', '취소(으)로 변경' 두 개뿐이다
  await expect(statusButtons(page)).toHaveCount(2);
  expect(await statusButtons(page).allInnerTexts()).toEqual(['진행(으)로 변경', '취소(으)로 변경']);

  // 상태 이력 표
  await expect(page.getByRole('heading', { name: '상태 이력' })).toBeVisible();
  await expect(historyRows(page)).toHaveCount(1);
});

test('STS-02 확정 → 진행', async ({ page }) => {
  const id = await createOrderViaApi(page, 'STS-02');
  await page.goto(`/orders/${id}`);

  const dialogMessage = await changeStatus(page, '진행(으)로 변경');
  expect(dialogMessage).toBe('진행(으)로 바꿉니다. 계속할까요?');

  await expect(page.locator('.alert.ok')).toHaveText("상태를 '진행'(으)로 바꿨습니다");
  await expect(statusBadge(page)).toHaveText('진행');
  await expect(statusButtons(page)).toHaveCount(2);
  expect(await statusButtons(page).allInnerTexts()).toEqual(['완료(으)로 변경', '취소(으)로 변경']);

  // 이력 2행: 확정 → 진행, 변경자 admin
  const history = await historyOf(page);
  expect(history.map((h) => h.slice(1))).toEqual([
    ['-', '확정', 'admin'],
    ['확정', '진행', 'admin'],
  ]);
});

test('STS-03 진행 → 완료 (최종 상태)', async ({ page }) => {
  const id = await createOrderViaApi(page, 'STS-03');
  await page.goto(`/orders/${id}`);
  // 사전 조건: 진행 상태의 주문
  await changeStatus(page, '진행(으)로 변경');
  await expect(statusBadge(page)).toHaveText('진행');

  await changeStatus(page, '완료(으)로 변경');

  await expect(statusBadge(page)).toHaveText('완료');
  await expect(statusButtons(page)).toHaveCount(0);
  // 완료 상태에서는 고객사 이름 입력칸과 수정 버튼이 비활성화된다
  await expect(page.locator('#customerName')).toBeDisabled();
  await expect(page.locator('#customerForm button')).toBeDisabled();

  // 이력 3행(확정 → 진행 → 완료)이 시간순
  const history = await historyOf(page);
  expect(history.map((h) => h.slice(1))).toEqual([
    ['-', '확정', 'admin'],
    ['확정', '진행', 'admin'],
    ['진행', '완료', 'admin'],
  ]);
  const times = history.map((h) => h[0]); // yyyy-MM-dd HH:mm:ss 형식이라 문자열 비교가 시간순
  expect(times).toEqual([...times].sort());
});

test('STS-05 주문 취소', async ({ page }) => {
  const id = await createOrderViaApi(page, 'STS-05');
  await page.goto('/orders');
  const before = { canceled: await chipCount(page, '취소'), all: await chipCount(page, '전체') };

  await page.goto(`/orders/${id}`);
  await changeStatus(page, '취소(으)로 변경');
  // 취소해도 상세 화면에 머물며 '취소' 상태와 완료 메시지를 보여 준다.
  await expect(page).toHaveURL(new RegExp(`/orders/${id}$`));
  await expect(page.locator('#orderBadge')).toHaveText('취소');
  await expect(page.locator('#flash')).toContainText('취소');

  // 요구사항 기준: 주문이 '취소' 상태로 목록에 남고, '취소' 칩 건수가 1 늘어난다.
  await page.goto('/orders');
  await expect(listRow(page, id)).toHaveCount(1);
  await expect(listRow(page, id).locator('.badge')).toHaveText('취소');
  expect(await chipCount(page, '취소')).toBe(before.canceled + 1);
  expect(await chipCount(page, '전체')).toBe(before.all);
});
