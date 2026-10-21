import { test, expect } from '@playwright/test';
import { login } from './helpers';

// AUTH-02 정상 로그인
test.describe('AUTH-02 정상 로그인', () => {
	test('AUTH-02-TC01 admin 계정으로 로그인', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('아이디').fill('admin');
		await page.getByLabel('비밀번호').fill('admin');
		await page.getByRole('button', { name: '로그인' }).click();

		await expect(page).toHaveURL(/\/orders$/);
		await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
		await expect(page.locator('.topbar .user span')).toHaveText('admin');
		await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
	});

	test('AUTH-02-TC02 로그인 후 상단 메뉴 표시', async ({ page }) => {
		await login(page);

		await expect(page.locator('.topbar .brand')).toHaveText('배터리 주문 관리');
		const nav = page.locator('.topbar nav');
		await expect(nav.getByRole('link')).toHaveText(['주문 목록', '주문 추가', '마스터 데이터']);
		await expect(nav.getByRole('link', { name: '주문 목록' })).toHaveClass(/active/);
	});
});

// AUTH-08 로그아웃
test.describe('AUTH-08 로그아웃', () => {
	test('AUTH-08-TC01 로그아웃하면 로그인 화면으로 이동', async ({ page }) => {
		await login(page);
		await page.getByRole('button', { name: '로그아웃' }).click();

		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByRole('heading', { name: '배터리 주문 관리' })).toBeVisible();
		await expect(page.getByLabel('아이디')).toBeVisible();
		await expect(page.getByLabel('비밀번호')).toBeVisible();
	});

	test('AUTH-08-TC02 로그아웃 후 보호 화면 직접 접근', async ({ page }) => {
		await login(page);
		await page.getByRole('button', { name: '로그아웃' }).click();
		await expect(page).toHaveURL(/\/login$/);

		await page.goto('/orders');
		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByRole('heading', { name: '주문 목록' })).toHaveCount(0);
	});
});
