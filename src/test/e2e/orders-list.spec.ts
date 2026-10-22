import { test, expect, type Page } from '@playwright/test';
import { login, apiLogin, createOrder, changeStatus } from './order-helpers';

const STATUS_LABELS = ['확정', '진행', '완료', '취소'];

/** 필터 칩 한 개 (칩 글자는 '진행 3' 처럼 이름 뒤에 건수가 붙는다) */
const chip = (page: Page, label: string) => page.locator('.filters .chip', { hasText: label }).first();
const chipCount = async (page: Page, label: string) =>
	Number((await chip(page, label).locator('.count').innerText()).trim());
const dataRows = (page: Page) => page.locator('table.grid tbody tr.clickable');
const statusCells = (page: Page) => page.locator('table.grid tbody tr.clickable td:nth-child(8)');

// LIST-01 목록 화면 구성
test.describe('LIST-01 목록 화면 구성', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await page.goto('/orders');
	});

	test('LIST-01-TC01 목록 화면 제목과 [주문 추가] 버튼', async ({ page }) => {
		await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
		await expect(page.locator('.page-head').getByRole('link', { name: '주문 추가' })).toBeVisible();
	});

	test('LIST-01-TC02 상태 필터 칩 5개와 건수', async ({ page }) => {
		const chips = page.locator('.filters .chip');
		await expect(chips).toHaveCount(5);
		const labels = ['전체', ...STATUS_LABELS];
		for (let i = 0; i < labels.length; i++) {
			await expect(chips.nth(i)).toContainText(labels[i]);
			await expect(chips.nth(i).locator('.count')).toHaveText(/^\d+$/);
		}
		await expect(chips.first()).toHaveClass(/active/);
	});

	test('LIST-01-TC03 주문 표의 열 구성', async ({ page }) => {
		await expect(page.locator('table.grid thead th')).toHaveText([
			'주문번호', '확정 일시', '총 수량(K)', '경로', '소요 일수', '납기(일)', '총 비용(억원)', '상태', '작성자',
		]);
	});
});

// LIST-03 상태 필터, LIST-04 칩 건수와 목록 행 수 일치
// 사전 데이터: 확정 주문 1건, 진행 주문 1건 (주문 2건이 생성된다)
test.describe('LIST-03 · LIST-04 상태 필터와 건수', () => {
	test.beforeAll(async ({ browser, baseURL }) => {
		const ctx = await browser.newContext({ baseURL });
		const page = await ctx.newPage();
		await login(page);
		await apiLogin(ctx.request);
		await createOrder(ctx.request, 'E2E 목록 확정');
		const inProgress = await createOrder(ctx.request, 'E2E 목록 진행');
		await changeStatus(page, inProgress, '진행');
		await ctx.close();
	});

	test.beforeEach(async ({ page }) => {
		await login(page);
		await page.goto('/orders');
	});

	test("LIST-03-TC01 '진행' 칩으로 진행 주문만 보기", async ({ page }) => {
		await chip(page, '진행').click();

		await expect(page).toHaveURL(/\/orders\?status=IN_PROGRESS$/);
		await expect(chip(page, '진행')).toHaveClass(/active/);
		const texts = (await statusCells(page).allTextContents()).map((t) => t.trim());
		expect(texts.length).toBeGreaterThan(0);
		expect(texts.every((t) => t === '진행')).toBe(true);
	});

	test("LIST-03-TC02 '확정' 칩으로 확정 주문만 보기", async ({ page }) => {
		await chip(page, '확정').click();

		await expect(page).toHaveURL(/\/orders\?status=CONFIRMED$/);
		await expect(chip(page, '확정')).toHaveClass(/active/);
		const texts = (await statusCells(page).allTextContents()).map((t) => t.trim());
		expect(texts.length).toBeGreaterThan(0);
		expect(texts.every((t) => t === '확정')).toBe(true);
	});

	test("LIST-03-TC03 '전체' 칩으로 필터 해제", async ({ page }) => {
		await chip(page, '진행').click();
		await expect(page).toHaveURL(/status=IN_PROGRESS/);

		await chip(page, '전체').click();

		await expect(page).toHaveURL(/\/orders$/);
		await expect(chip(page, '전체')).toHaveClass(/active/);
		const texts = (await statusCells(page).allTextContents()).map((t) => t.trim());
		expect(texts).toContain('확정');
		expect(texts).toContain('진행');
	});

	test("LIST-04-TC01 '전체' 건수와 표 행 수 일치", async ({ page }) => {
		const total = await chipCount(page, '전체');
		expect(total).toBeGreaterThanOrEqual(2);
		await expect(dataRows(page)).toHaveCount(total);
	});

	test('LIST-04-TC02 상태별 건수의 합 = 전체 건수', async ({ page }) => {
		const total = await chipCount(page, '전체');
		let sum = 0;
		for (const label of STATUS_LABELS) sum += await chipCount(page, label);
		expect(sum).toBe(total);
	});

	test('LIST-04-TC03 상태 칩 건수와 필터 결과 행 수 일치', async ({ page }) => {
		for (const label of STATUS_LABELS) {
			await page.goto('/orders');
			const count = await chipCount(page, label);
			await chip(page, label).click();
			await expect(chip(page, label)).toHaveClass(/active/);
			if (count === 0) {
				await expect(page.locator('table.grid tbody td.empty')).toHaveText('주문이 없습니다.');
			} else {
				await expect(dataRows(page)).toHaveCount(count);
			}
		}
	});
});
