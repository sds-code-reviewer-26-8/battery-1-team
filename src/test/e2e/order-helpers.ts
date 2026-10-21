import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ADMIN = { username: 'admin', password: 'admin' };

/** 화면에서 로그인한다. 로그인 후 주문 목록(/orders)으로 이동한 것까지 확인한다. */
export async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('아이디').fill(ADMIN.username);
	await page.getByLabel('비밀번호').fill(ADMIN.password);
	await page.getByRole('button', { name: '로그인' }).click();
	await expect(page).toHaveURL(/\/orders$/);
}

/** API 호출용 세션을 만든다 (request 컨텍스트에 세션 쿠키가 저장된다). */
export async function apiLogin(request: APIRequestContext) {
	const res = await request.post('/login', { form: ADMIN });
	expect(res.ok()).toBeTruthy();
}

export const EVEN_ORDERS = { CHINA: 3000, JAPAN: 3000, VIETNAM: 3000, INDONESIA: 3000 };

/** API 로 주문을 한 건 확정하고 주문번호를 돌려준다. (주문 1건이 생성된다) */
export async function createOrder(request: APIRequestContext, memo = 'E2E 테스트') {
	const master = await (await request.get('/api/master')).json();
	const res = await request.post('/api/orders', {
		data: { orders: EVEN_ORDERS, routeType: 'COST', masterVersion: master.version, memo },
	});
	expect(res.ok()).toBeTruthy();
	return (await res.json()).id as number;
}

/** 주문 상세에서 상태 변경 버튼을 누르고 확인창을 수락한다. 예: changeStatus(page, 1, '진행') */
export async function changeStatus(page: Page, orderId: number, label: '진행' | '완료' | '취소') {
	await page.goto(`/orders/${orderId}`);
	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: `${label}(으)로 변경` }).click();
}
