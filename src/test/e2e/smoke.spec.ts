import { test, expect } from '@playwright/test';

test('로그인 화면이 열린다', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});
