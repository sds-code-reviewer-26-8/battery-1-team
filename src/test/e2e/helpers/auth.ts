import { APIRequestContext, Page } from '@playwright/test';

/** 화면에서 admin 으로 로그인한다. */
export async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=username]', 'admin');
  await page.fill('input[name=password]', 'admin');
  await page.click('button[type=submit]');
  await page.waitForURL('**/orders');
}

/** API 요청용 세션을 만든다. (page.request 처럼 쿠키를 공유하는 컨텍스트에 쓴다) */
export async function loginApi(request: APIRequestContext) {
  await request.post('/login', { form: { username: 'admin', password: 'admin' } });
}
