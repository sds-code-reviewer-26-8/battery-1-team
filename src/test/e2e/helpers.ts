import { expect, type Locator, type Page } from '@playwright/test';

/** 기본 주문: 총 12,000K 를 4개 공장에 3,000K 씩 (주문 추가 화면의 초기값과 같다) */
export const DEFAULT_ORDERS = { CHINA: 3000, JAPAN: 3000, VIETNAM: 3000, INDONESIA: 3000 };

export async function login(page: Page, username = 'admin', password = 'admin') {
  await page.goto('/login');
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/orders$/);
}

/**
 * 사전 조건용: API 로 시뮬레이션 후 확정해 주문을 만든다. (로그인된 page 의 세션을 쓴다)
 * 화면 흐름 자체를 검증하는 시나리오는 이 함수 대신 화면에서 직접 확정한다.
 */
export async function createOrderViaApi(page: Page, memo = ''): Promise<number> {
  const sim = await page.request.post('/api/simulate', { data: { orders: DEFAULT_ORDERS } });
  expect(sim.ok()).toBeTruthy();
  const { master } = await sim.json();
  const res = await page.request.post('/api/orders', {
    data: { orders: DEFAULT_ORDERS, routeType: 'COST', masterVersion: master.version, memo },
  });
  expect(res.ok()).toBeTruthy();
  const { id } = await res.json();
  return id as number;
}

/** 확정 상태 → 진행 등 상태를 바꾼다. 확인창은 수락하고, 확인창에 뜬 문구를 돌려준다. */
export async function changeStatus(page: Page, buttonName: string): Promise<string> {
  let message = '';
  page.once('dialog', async (dialog) => {
    message = dialog.message();
    await dialog.accept();
  });
  const posted = page.waitForResponse(
    (r) => /\/orders\/\d+\/status$/.test(r.url()) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: buttonName }).click();
  await posted;
  return message;
}

// ---- 주문 상세 화면

export function statusBadge(page: Page): Locator {
  return page.locator('h1 .badge');
}

/** 상세의 항목(확정 일시·작성자·경로·메모)의 값 */
export function metaValue(page: Page, label: string): Locator {
  return page
    .locator('dl.meta > div')
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
    .locator('dd');
}

export function statusButtons(page: Page): Locator {
  return page.locator('form.status-form button');
}

/** 상태 이력 표의 행. 각 행은 [일시, 이전 상태, 새 상태, 변경한 사람] */
export function historyRows(page: Page): Locator {
  return page
    .locator('section.card')
    .filter({ has: page.getByRole('heading', { name: '상태 이력' }) })
    .locator('tbody tr');
}

export async function historyOf(page: Page): Promise<string[][]> {
  const rows = historyRows(page);
  const n = await rows.count();
  const out: string[][] = [];
  for (let i = 0; i < n; i++) {
    out.push((await rows.nth(i).locator('td').allInnerTexts()).map((t) => t.trim()));
  }
  return out;
}

// ---- 주문 목록 화면

export function listRow(page: Page, id: number): Locator {
  return page
    .locator('table.grid tbody tr')
    .filter({ has: page.getByRole('link', { name: `#${id}`, exact: true }) });
}

/** 목록 행의 셀: [주문번호, 확정 일시, 총 수량(K), 경로, 소요 일수, 총 비용(억원), 상태, 작성자] */
export async function listRowCells(page: Page, id: number): Promise<string[]> {
  return (await listRow(page, id).locator('td').allInnerTexts()).map((t) => t.trim());
}

/** 필터 칩('전체'·'확정'·'진행'·'완료'·'취소')에 표시된 건수 */
export async function chipCount(page: Page, label: string): Promise<number> {
  const text = await page.locator('.filters .chip', { hasText: label }).locator('.count').innerText();
  return Number(text.trim());
}
