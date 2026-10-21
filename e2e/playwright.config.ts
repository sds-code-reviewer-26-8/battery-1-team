import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
	testDir: './tests',
	fullyParallel: false,
	workers: 1,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	// BASE_URL을 지정하지 않으면 테스트 전에 앱을 직접 띄운다.
	webServer: process.env.BASE_URL
		? undefined
		: {
				command: 'gradlew.bat bootRun',
				cwd: '..',
				url: `${baseURL}/login`,
				reuseExistingServer: true,
				timeout: 180_000,
			},
});
