import { test, expect, type Page } from '@playwright/test';

// 실행마다 고유한 아이디 (영문·숫자·_ 3~20자)
const uniqueName = () => `e2e_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** 가입 화면에서 가입을 시도한다. 성공 시 뜨는 alert 는 수락한다. */
async function signup(page: Page, username: string, password: string) {
	await page.goto('/signup');
	page.once('dialog', (d) => d.accept());
	await page.getByLabel('아이디').fill(username);
	await page.getByLabel('비밀번호').fill(password);
	await page.getByRole('button', { name: '가입' }).click();
}

async function loginAs(page: Page, username: string, password: string) {
	await page.goto('/login');
	await page.getByLabel('아이디').fill(username);
	await page.getByLabel('비밀번호').fill(password);
	await page.getByRole('button', { name: '로그인' }).click();
}

test.describe('회원가입', () => {
	test('SIGNUP-01 가입 후 로그인하면 주문 목록으로 이동', async ({ page }) => {
		const username = uniqueName();
		await signup(page, username, 'pw1234');
		await expect(page).toHaveURL(/\/login$/);

		await loginAs(page, username, 'pw1234');
		await expect(page).toHaveURL(/\/orders$/);
		await expect(page.getByRole('heading', { name: '주문 목록' })).toBeVisible();
		await expect(page.locator('.topbar .user span')).toHaveText(username);
	});

	test('SIGNUP-02 이미 가입한 아이디는 거부', async ({ page }) => {
		const username = uniqueName();
		await signup(page, username, 'pw1234');
		await expect(page).toHaveURL(/\/login$/);

		await signup(page, username, 'pw1234');
		await expect(page.locator('#signupError')).toHaveText('이미 사용 중인 아이디입니다');
		await expect(page).toHaveURL(/\/signup$/);
	});

	test('SIGNUP-06 대소문자만 다른 아이디는 중복으로 거부', async ({ page }) => {
		const username = uniqueName();
		await signup(page, username, 'pw1234');
		await expect(page).toHaveURL(/\/login$/);

		await signup(page, username.toUpperCase(), 'pw1234');
		await expect(page.locator('#signupError')).toHaveText('이미 사용 중인 아이디입니다');
		await expect(page).toHaveURL(/\/signup$/);
	});

	test('SIGNUP-03 4자 미만 비밀번호는 거부', async ({ page }) => {
		await signup(page, uniqueName(), 'abc');
		await expect(page.locator('#signupError')).toHaveText('비밀번호는 4자 이상이어야 합니다');
		await expect(page).toHaveURL(/\/signup$/);
	});

	test('SIGNUP-04 예약어 admin 은 거부', async ({ page }) => {
		await signup(page, 'admin', 'pw1234');
		await expect(page.locator('#signupError')).toHaveText('이미 사용 중인 아이디입니다');
		await expect(page).toHaveURL(/\/signup$/);
	});

	test('SIGNUP-05 가입 계정도 마스터 데이터 화면에 접근 (admin 과 동일 권한)', async ({ page }) => {
		const username = uniqueName();
		await signup(page, username, 'pw1234');
		await expect(page).toHaveURL(/\/login$/);
		await loginAs(page, username, 'pw1234');
		await expect(page).toHaveURL(/\/orders$/);

		await page.goto('/master');
		await expect(page).toHaveURL(/\/master$/);
		await expect(page.getByRole('heading', { name: '마스터 데이터' })).toBeVisible();
	});
});
