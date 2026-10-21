import { defineConfig, devices } from '@playwright/test';

// E2E 전용 서버: 인메모리 DB + 별도 포트로 앱을 띄운다.
// 개발 DB(./data/battery)와 분리되어 있어서 실행할 때마다 초기 상태(마스터 초기값, 주문 0건)로 시작한다.
const PORT = process.env.E2E_PORT ?? '8091';
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
	// 이 폴더(src/test/e2e)의 *.spec.ts 를 모두 실행한다.
	testDir: '.',
	fullyParallel: false,
	// 마스터 데이터는 전역 상태라서 테스트를 한 개씩 순서대로 실행한다.
	workers: 1,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	// BASE_URL 을 지정하면 그 서버를 그대로 쓴다 (이 경우 DB 는 그 서버의 DB 이다).
	webServer: process.env.BASE_URL
		? undefined
		: {
				command: `.\\gradlew.bat bootRun --args="--server.port=${PORT} --spring.datasource.url=jdbc:h2:mem:e2e"`,
				cwd: '../../..',
				url: `${baseURL}/login`,
				// 같은 포트에 이미 서버가 있으면 오류로 멈춘다 (다른 DB 에 테스트하는 것을 막는다).
				reuseExistingServer: false,
				timeout: 180_000,
			},
});
