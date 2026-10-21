import { test, expect, type Page } from '@playwright/test';

/**
 * 주문 추가(/orders/new) 시뮬레이션 E2E 테스트.
 *
 * 전제
 * - 앱이 baseURL(기본 http://localhost:8080)에서 실행 중이어야 한다.
 * - 로그인 계정은 admin / admin.
 * - "초기 마스터 필요" 시나리오는 마스터 데이터가 초기값이 아니면 건너뛴다.
 * - 이 파일의 시나리오는 주문을 확정하지 않으므로 데이터를 남기지 않는다.
 */

const COUNTRIES = [
  { key: 'CHINA', label: '중국', stockLimit: 4000, visits: 1 },
  { key: 'JAPAN', label: '일본', stockLimit: 2000, visits: 2 },
  { key: 'VIETNAM', label: '베트남', stockLimit: 10000, visits: 1 },
  { key: 'INDONESIA', label: '인도네시아', stockLimit: 7000, visits: 1 },
] as const;

const OPTION_LABELS = ['운항비 최소', '가장 빠르게', '가까운 곳부터'];

type Option = {
  type: string;
  label: string;
  days: number;
  totalCost: number; // 억원
  shippingCost: number; // 억원
  ships: number;
};

/** 로그인 요청을 직접 보내 세션을 만든다 (화면 로그인은 별도 시나리오 영역에서 다룬다). */
async function login(page: Page) {
  const res = await page.request.post('/login', {
    form: { username: 'admin', password: 'admin' },
    maxRedirects: 0,
  });
  expect(res.status(), '로그인 성공 시 주문 목록으로 이동(302)').toBe(302);
}

/** 마스터 데이터가 초기값(코드의 초기 데이터)인지 확인한다. */
async function hasDefaultMaster(page: Page): Promise<boolean> {
  const res = await page.request.get('/api/master');
  if (!res.ok()) return false;
  const m = await res.json();
  const expected: Record<string, [number, number, number]> = {
    CHINA: [400, 4000, 700],
    JAPAN: [800, 2000, 900],
    VIETNAM: [200, 10000, 550],
    INDONESIA: [300, 7000, 450],
  };
  const factoriesOk = (m.factories as any[]).every((f) => {
    const e = expected[f.country];
    return e && f.maxDaily === e[0] && f.stockLimit === e[1] && f.unitCost === e[2];
  });
  return factoriesOk && m.factories.length === 4 && m.shipCount === 3 && m.shipDailyCostWon === 100_000_000;
}

function gauge(page: Page, key: string) {
  return page.locator(`.gauge[data-c="${key}"]`);
}

async function gaugeValues(page: Page): Promise<number[]> {
  const values: number[] = [];
  for (const c of COUNTRIES) {
    values.push(Number(await gauge(page, c.key).locator('.gnum').inputValue()));
  }
  return values;
}

async function setTotal(page: Page, value: number) {
  const total = page.locator('#total');
  await total.fill(String(value));
  await total.blur(); // change 이벤트는 포커스를 옮길 때 발생한다
}

async function runSimulation(page: Page) {
  await page.getByRole('button', { name: '시뮬레이션 실행' }).click();
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#options .option')).toHaveCount(3);
}

/** 경로 옵션 카드 3개의 값을 읽는다. 금액은 억원 단위 숫자. */
async function readOptions(page: Page): Promise<Option[]> {
  const cards = page.locator('#options .option');
  const options: Option[] = [];
  for (let i = 0; i < (await cards.count()); i++) {
    const card = cards.nth(i);
    const text = await card.innerText();
    const grab = (re: RegExp) => {
      const m = re.exec(text);
      if (!m) throw new Error(`옵션 카드에서 값을 찾지 못했습니다: ${re} / ${text}`);
      return Number(m[1]);
    };
    options.push({
      type: (await card.getAttribute('data-type')) ?? '',
      label: (await card.locator('strong').innerText()).trim(),
      days: grab(/소요\s*(\d+)일/),
      totalCost: grab(/총 비용\s*([\d.]+)억원/),
      shippingCost: grab(/운항비\s*([\d.]+)억원/),
      ships: grab(/배\s*(\d+)척/),
    });
  }
  return options;
}

/** 요약 영역의 항목 값(예: 소요 일수 → "26일")을 읽는다. */
async function summaryValue(page: Page, label: string): Promise<string> {
  const stat = page.locator('#summary .stats > div', { has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) });
  return (await stat.locator('b').innerText()).trim();
}

/** 주문 목록 상단 칩(전체·확정·진행·완료·취소)의 건수. */
async function orderCounts(page: Page): Promise<string[]> {
  await page.goto('/orders');
  return (await page.locator('.filters .chip .count').allTextContents()).map((t) => t.trim());
}

test.describe('주문 추가 — 시뮬레이션', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/orders/new');
  });

  test('01. [P1] 초기 화면', async ({ page }) => {
    test.skip(!(await hasDefaultMaster(page)), '초기 마스터 데이터가 필요합니다 (마스터 데이터가 변경되어 있음)');

    await expect(page.locator('#total')).toHaveValue('12000');

    await expect(page.locator('.gauge')).toHaveCount(4);
    for (const c of COUNTRIES) {
      const g = gauge(page, c.key);
      await expect(g.locator('.gname')).toHaveText(c.label);
      await expect(g.locator('.gnum')).toHaveValue('3000');
      // 방문 횟수는 마스터 데이터를 불러온 뒤에 표시된다
      await expect(g.locator('.gvisits')).toHaveText(`방문 ${c.visits}회`);
    }

    await expect(page.locator('#result')).toBeHidden();
  });

  test('02. [P1] 게이지 조정 시 이웃 나라가 반대로 조정', async ({ page }) => {
    await gauge(page, 'CHINA').locator('.gnum').fill('2000');
    await gauge(page, 'CHINA').locator('.gnum').blur();

    // 중국 2000, 일본 4000, 베트남·인도네시아는 그대로, 합계 12000 유지
    await expect(gauge(page, 'CHINA').locator('.gnum')).toHaveValue('2000');
    await expect(gauge(page, 'JAPAN').locator('.gnum')).toHaveValue('4000');
    await expect(gauge(page, 'VIETNAM').locator('.gnum')).toHaveValue('3000');
    await expect(gauge(page, 'INDONESIA').locator('.gnum')).toHaveValue('3000');

    const sum = (await gaugeValues(page)).reduce((a, b) => a + b, 0);
    expect(sum).toBe(12000);
  });

  test('03. [P1] 시뮬레이션 실행', async ({ page }) => {
    await runSimulation(page);

    // 옵션 3개: 소요 일수, 총 비용(억원), 운항비(억원), 배 N척
    const cards = page.locator('#options .option');
    for (let i = 0; i < 3; i++) {
      await expect(cards.nth(i).locator('strong')).toHaveText(OPTION_LABELS[i]);
      await expect(cards.nth(i)).toContainText(/소요 \d+일/);
      await expect(cards.nth(i)).toContainText(/총 비용 [\d.]+억원/);
      await expect(cards.nth(i)).toContainText(/운항비 [\d.]+억원/);
      await expect(cards.nth(i)).toContainText(/배 \d+척/);
    }

    // '운항비 최소'가 선택되어 있다
    await expect(page.locator('#options .option.selected')).toHaveCount(1);
    await expect(page.locator('#options .option[data-type="COST"]')).toHaveClass(/selected/);

    // 요약, 상세, 지도 애니메이션 영역이 채워진다
    await expect(page.locator('#summary')).toContainText('요약');
    await expect(page.locator('#summary')).toContainText('운항비 최소');
    await expect(page.locator('#details')).not.toBeEmpty();
    await expect(page.locator('#details')).toContainText('나라별 주문 수량');
    await expect(page.locator('#anim')).not.toBeEmpty();
  });

  test('04. [P1] 경로 옵션 전환', async ({ page }) => {
    await runSimulation(page);
    const options = await readOptions(page);

    for (const label of ['가장 빠르게', '가까운 곳부터']) {
      const expected = options.find((o) => o.label === label)!;
      await page.locator('#options .option', { hasText: label }).click();

      // 누른 옵션이 선택 강조된다
      const selected = page.locator('#options .option.selected');
      await expect(selected).toHaveCount(1);
      await expect(selected.locator('strong')).toHaveText(label);

      // 요약·상세가 그 옵션의 값으로 바뀐다
      await expect(page.locator('#summary')).toContainText(label);
      expect(await summaryValue(page, '소요 일수')).toBe(`${expected.days}일`);
      expect(await summaryValue(page, '운항비')).toBe(`${expected.shippingCost.toFixed(2)}억원`);
      expect(await summaryValue(page, '총 비용')).toBe(`${expected.totalCost.toFixed(2)}억원`);
      await expect(page.locator('#details')).not.toBeEmpty();
    }
  });

  test('05. [P1] 경로 옵션 비교 규칙', async ({ page }) => {
    await runSimulation(page);
    const options = await readOptions(page);
    const cost = options.find((o) => o.label === '운항비 최소')!;
    const fast = options.find((o) => o.label === '가장 빠르게')!;
    const near = options.find((o) => o.label === '가까운 곳부터')!;

    // 운항비: 운항비 최소 ≤ 가장 빠르게 ≤ 가까운 곳부터
    expect(cost.shippingCost, '운항비 최소 ≤ 가장 빠르게').toBeLessThanOrEqual(fast.shippingCost);
    expect(fast.shippingCost, '가장 빠르게 ≤ 가까운 곳부터').toBeLessThanOrEqual(near.shippingCost);

    // 소요 일수: 가장 빠르게 ≤ 운항비 최소, 가장 빠르게 ≤ 가까운 곳부터
    // (운항비 최소와 가까운 곳부터 사이의 일수 순서는 정하지 않는다)
    expect(fast.days, '가장 빠르게 ≤ 운항비 최소').toBeLessThanOrEqual(cost.days);
    expect(fast.days, '가장 빠르게 ≤ 가까운 곳부터').toBeLessThanOrEqual(near.days);
  });

  test('06. [P2] 생산비 계산 일치', async ({ page }) => {
    test.skip(!(await hasDefaultMaster(page)), '초기 마스터 데이터가 필요합니다 (마스터 데이터가 변경되어 있음)');

    await runSimulation(page);
    const options = await readOptions(page);
    expect(options).toHaveLength(3);

    // 3000K × 1000 × (700 + 900 + 550 + 450)원 = 78.00억원
    const expected = (3000 * 1000 * (700 + 900 + 550 + 450)) / 1e8;
    expect(expected).toBe(78);
    for (const o of options) {
      const production = o.totalCost - o.shippingCost; // 총 비용 − 운항비
      expect(Math.abs(production - expected), `${o.label}의 생산비 ${production.toFixed(2)}억원`).toBeLessThanOrEqual(0.01);
    }
  });

  test('07. [P1] 시뮬레이션만으로는 주문이 생기지 않음', async ({ page }) => {
    const before = await orderCounts(page);

    await page.goto('/orders/new');
    await runSimulation(page);

    const after = await orderCounts(page);
    expect(after, '전체 건수와 상태별 건수가 그대로').toEqual(before);
  });

  test('08. [P1] 총 수량 최소값 1K', async ({ page }) => {
    await setTotal(page, 1);
    await expect(page.locator('#total')).toHaveValue('1');

    await runSimulation(page);

    // 오류 없이 3가지 경로가 계산된다
    await expect(page.locator('#inputError')).toBeHidden();
    const options = await readOptions(page);
    expect(options.map((o) => o.label)).toEqual(OPTION_LABELS);
    for (const o of options) {
      expect(o.days, `${o.label} 소요 일수`).toBeGreaterThan(0);
      expect(o.ships, `${o.label} 배 척수`).toBeGreaterThanOrEqual(1);
    }

    // 소량이어도 왕복 일정이 나온다
    const ships = page.locator('#details tr', { hasText: '한국' });
    await expect(ships.first()).toContainText('→');
  });
});
