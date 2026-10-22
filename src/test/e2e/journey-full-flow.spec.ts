import { test, expect } from '@playwright/test';

// JRN-01 로그인부터 완료까지 주문 한 건 처리 (주문 1건이 생성된다)
test('JRN-01-TC01 로그인부터 완료까지 주문 한 건 처리', async ({ page }) => {
	page.on('dialog', (d) => d.accept());

	// 1. 로그인
	await page.goto('/login');
	await page.getByLabel('아이디').fill('admin');
	await page.getByLabel('비밀번호').fill('admin');
	await page.getByRole('button', { name: '로그인' }).click();
	await expect(page).toHaveURL(/\/orders$/);

	// 2. 주문 추가
	await page.locator('.topbar nav').getByRole('link', { name: '주문 추가' }).click();
	await expect(page).toHaveURL(/\/orders\/new$/);

	// 3. 기본값(12,000K, 각 3,000K) 그대로 시뮬레이션
	await expect(page.locator('#total')).toHaveValue('12000');
	await expect(page.locator('.gauge .gnum')).toHaveCount(4);
	await page.locator('#runBtn').click();
	await expect(page.locator('#result')).toBeVisible();
	await expect(page.locator('#options .option')).toHaveCount(3);
	await expect(page.locator('#options .option.selected')).toContainText('총비용 최소');

	// 4. 메모 입력 후 확정
	await page.locator('#memo').fill('E2E 전체 여정');
	await page.locator('#confirmBtn').click();

	// 5. 주문 상세: '주문 #번호' + '확정' 배지
	await expect(page).toHaveURL(/\/orders\/\d+$/);
	const orderId = Number(page.url().split('/').pop());
	await expect(page.getByRole('heading', { level: 1 })).toContainText(`주문 #${orderId}`);
	const badge = page.locator('h1 .badge');
	await expect(badge).toHaveText('확정');
	await expect(page.locator('dl.meta')).toContainText('E2E 전체 여정');

	// 6. 진행으로 변경
	await page.getByRole('button', { name: '진행(으)로 변경' }).click();
	await expect(badge).toHaveText('진행');

	// 7. 완료로 변경
	await page.getByRole('button', { name: '완료(으)로 변경' }).click();
	await expect(badge).toHaveText('완료');
	await expect(page.getByText('최종 상태라 더 바꿀 수 없습니다.')).toBeVisible();

	// 8. 상태 이력 3건 (- → 확정, 확정 → 진행, 진행 → 완료), 변경한 사람 admin
	const history = page.locator('section', { has: page.getByRole('heading', { name: '상태 이력' }) }).locator('tbody tr');
	await expect(history).toHaveCount(3);
	const rows = await history.evaluateAll((trs) =>
		trs.map((tr) => Array.from(tr.querySelectorAll('td')).slice(1).map((td) => td.textContent?.trim())),
	);
	expect(rows).toEqual([
		['-', '확정', 'admin'],
		['확정', '진행', 'admin'],
		['진행', '완료', 'admin'],
	]);

	// 9. 주문 목록에서 상태 확인
	await page.locator('.topbar nav').getByRole('link', { name: '주문 목록' }).click();
	const row = page.locator('table.grid tbody tr', { has: page.getByRole('link', { name: `#${orderId}`, exact: true }) });
	await expect(row.locator('td:nth-child(7)')).toHaveText('완료');
});
