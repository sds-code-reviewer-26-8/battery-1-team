import { expect, Page } from '@playwright/test';

export const MASTER_SAVED = '마스터 데이터를 저장했습니다';

/** /master 에서 입력칸(name)의 값을 바꿔 저장한다. */
export async function saveMaster(page: Page, values: Record<string, string>) {
  await page.goto('/master');
  for (const [name, value] of Object.entries(values)) {
    await page.fill(`input[name=${name}]`, value);
  }
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.locator('.alert.ok')).toHaveText(MASTER_SAVED);
}

/** 마스터가 바뀌는 시나리오가 끝난 뒤 원래 값으로 되돌린다. (version 은 되돌릴 수 없다) */
export const restore = {
  shipCount: (page: Page) => saveMaster(page, { shipCount: '3' }),
  chinaUnitCost: (page: Page) => saveMaster(page, { unitCost_CHINA: '700' }),
};

/** 기본 입력(각 3000K)으로 시뮬레이션을 실행하고 결과가 나올 때까지 기다린다. */
export async function runDefaultSimulation(page: Page) {
  await page.goto('/orders/new');
  await page.click('#runBtn');
  await expect(page.locator('#options .option')).toHaveCount(3);
}
