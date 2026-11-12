import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',timeout:30000,workers:2,retries:0,reporter:'list',use:{baseURL:process.env.BROWSER_BASE_URL||'http://127.0.0.1:8080',...devices['Desktop Chrome'],trace:'retain-on-failure'}});
