import {test,expect} from '@playwright/test';

// Read-only browser checks of the actual existing Platform's private shell.
// Authentication is intentionally NOT supplied and no contacts are loaded.
const platform='https://platform.noetfield.com/api/opportunities/desk/app';

test('production private founder shell renders Persian RTL without exposing source cases',async({page})=>{
 const response=await page.goto(platform+'?lang=fa',{waitUntil:'domcontentloaded'});
 expect(response?.status()).toBe(200);
 await expect(page.locator('html')).toHaveAttribute('lang','fa');
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await expect(page.locator('#desk-language')).toHaveText('English');
 await expect(page.locator('.headline h1')).toContainText('از ارتباط');
 await expect(page.locator('#unlock h2')).toContainText('به میز مدیریت');
 await expect(page.locator('#workspace')).toBeHidden();
 await expect(page.locator('#unlock-form #key')).toBeVisible();
 expect(await page.evaluate(()=>Boolean(localStorage.getItem('admin_secret')))).toBe(false);
});

test('production private English shell and public corporate Connect remain independent',async({page})=>{
 let response=await page.goto(platform+'?lang=en',{waitUntil:'domcontentloaded'});
 expect(response?.status()).toBe(200);
 await expect(page.locator('html')).not.toHaveAttribute('dir','rtl');
 await expect(page.locator('#desk-language')).toHaveText('فارسی');
 response=await page.goto('https://www.noetfield.com/connect/',{waitUntil:'domcontentloaded'});
 expect(response?.status()).toBe(200);
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 expect((await page.locator('body').innerText()).includes('فارسی')).toBe(false);
});

test('production private RTL remains navigable in a small mobile viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const response=await page.goto(platform+'?lang=fa',{waitUntil:'domcontentloaded'});
 expect(response?.status()).toBe(200);
 await expect(page.locator('#desk-language')).toBeVisible();
 await expect(page.locator('#unlock-form button[type=submit]')).toBeVisible();
 const geometry=await page.evaluate(()=>({
  page:document.documentElement.scrollWidth,viewport:window.innerWidth,
 }));
 expect(geometry.page).toBeLessThanOrEqual(geometry.viewport+2);
});
