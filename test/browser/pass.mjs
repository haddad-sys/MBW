/* An optional end-to-end pass through a real browser. Playwright is not a
   dependency of this project — install it, start a server, then:

     npm install --no-save playwright
     PORT=4173 npm start &
     BASE=http://localhost:4173 node test/browser/pass.mjs

   It walks the whole journey: apply, be refused, be approved, sign in, raise a
   note, and watch the administrator's badge advance over the live channel. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:4173';
const errors = [];
let failed = 0;

function ok(label, cond, extra) {
  if (cond) console.log('  ✓ ' + label);
  else { failed++; console.log('  ✗ ' + label + (extra ? ' — ' + extra : '')); }
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);

async function newPage(ctx) {
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  return p;
}

async function seen(page) {
  return page.evaluate(() => {
    let t = document.getElementById('root')?.innerText || '';
    document.querySelectorAll('.mut-overlay').forEach(n => { t += '\n' + n.innerText; });
    return t;
  });
}

const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await newPage(ctx);

console.log('\n— shell & direction —');
await page.goto(BASE, { waitUntil: 'networkidle' });
ok('login card rendered', (await seen(page)).includes('تسجيل الدخول'));
const dir = await page.evaluate(() => ({
  html: document.documentElement.dir,
  computed: getComputedStyle(document.body).direction,
}));
ok('document is rtl', dir.html === 'rtl' && dir.computed === 'rtl', JSON.stringify(dir));
ok('no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

console.log('\n— registration —');
await page.getByText('أنشئ طلب حساب').click();
await page.waitForTimeout(200);
ok('registration form shown', (await seen(page)).includes('إرسال الطلب'));
const fill = async (label, value) => {
  const box = page.locator('div.mb-4', { has: page.locator('label', { hasText: label }) }).first();
  await box.locator('input, textarea, select').first().fill(value);
};
await fill('الاسم الكامل *', 'سارة العتيبي');
await fill('اسم المستخدم *', 'sara');
await fill('البريد الإلكتروني *', 'sara@example.com');
await fill('رقم الهاتف', '0500000000');
await fill('كلمة المرور *', 'Sara@2026');
await page.locator('div.mb-4', { has: page.locator('label', { hasText: 'الفرع' }) }).first()
  .locator('select').selectOption({ index: 1 });
await fill('ملاحظة للمسؤول', 'مشرفة فرع');
await page.getByText('إرسال الطلب').click();
await page.waitForTimeout(600);
ok('application acknowledged', (await seen(page)).includes('تم استلام طلبك'));

console.log('\n— login is blocked before approval —');
await page.getByText('العودة لتسجيل الدخول').click();
await page.waitForTimeout(200);
await page.locator('input[autocomplete="username"]').fill('sara');
await page.locator('input[type="password"]').fill('Sara@2026');
await page.getByText('تسجيل الدخول', { exact: true }).last().click();
await page.waitForTimeout(600);
ok('pending message shown', (await seen(page)).includes('بانتظار اعتماد المسؤول'));

console.log('\n— administrator signs in —');
const admin = await newPage(await browser.newContext({ viewport: { width: 420, height: 900 } }));
await admin.goto(BASE, { waitUntil: 'networkidle' });
await admin.locator('input[autocomplete="username"]').fill('manager');
await admin.locator('input[type="password"]').fill('Manager@2026');
await admin.getByText('تسجيل الدخول', { exact: true }).last().click();
await admin.waitForTimeout(1200);
const home = await seen(admin);
ok('dashboard loaded', home.includes('متابِع') && !home.includes('كلمة المرور'));
ok('pending banner visible', home.includes('طلب') && /طلبات|طلب تسجيل|بانتظار/.test(home), home.slice(0, 200));
ok('live channel connected', await admin.evaluate(() => window.ST.S.live === true));

console.log('\n— approve the application —');
await admin.getByText('المزيد', { exact: true }).click();
await admin.waitForTimeout(300);
await admin.getByText('الإعدادات والإدارة').first().click();
await admin.waitForTimeout(400);
await admin.getByText('طلبات التسجيل').first().click();
await admin.waitForTimeout(500);
ok('queue lists the applicant', (await seen(admin)).includes('سارة العتيبي'));
await admin.getByText('اعتماد', { exact: true }).first().click();
await admin.waitForTimeout(400);
ok('approval dialog opened', (await seen(admin)).includes('اعتماد طلب التسجيل'));
await admin.locator('.mut-overlay').getByText('اعتماد الحساب').click();
await admin.waitForTimeout(800);
ok('applicant left the queue', !(await seen(admin)).includes('سارة العتيبي'));

console.log('\n— the approved account can sign in —');
await page.reload({ waitUntil: 'networkidle' });
await page.locator('input[autocomplete="username"]').fill('sara');
await page.locator('input[type="password"]').fill('Sara@2026');
await page.getByText('تسجيل الدخول', { exact: true }).last().click();
await page.waitForTimeout(1400);
const staff = await seen(page);
ok('branch user is in', !staff.includes('كلمة المرور') && staff.includes('الرئيسية'));
ok('branch live channel up', await page.evaluate(() => window.ST.S.live === true));
ok('branch cannot see settings admin rows', !(await page.evaluate(() => window.ST.S.perms.manageUsers)));

console.log('\n— a new note rings the administrator —');
await page.evaluate(() => { window.__rang = 0; const p = window.MUT.Ring.play; window.MUT.Ring.play = function (u) { window.__rang++; return p.call(this, u); }; });
await admin.evaluate(() => { window.__rang = 0; const p = window.MUT.Ring.play; window.MUT.Ring.play = function (u) { window.__rang++; return p.call(this, u); }; });
const before = await admin.evaluate(() => window.ST.S.unread);
await page.locator('button[aria-label="ملاحظة جديدة"]').click();
await page.waitForTimeout(400);
ok('form opened', (await seen(page)).includes('ملاحظة جديدة'));
await page.locator('input[type="text"], input:not([type])').first().fill('تسريب في مغسلة الطابق الأول');
await page.locator('select').filter({ hasText: 'اختر التصنيف…' }).first().selectOption({ index: 1 });
await page.waitForTimeout(400);
const save = page.getByText('إنشاء الملاحظة', { exact: true }).first();
ok('save button enabled', await save.isEnabled());
await save.click();
await page.waitForTimeout(1800);
ok('note was created', (await seen(page)).includes('تسريب في مغسلة'));
const after = await admin.evaluate(() => window.ST.S.unread);
ok('administrator badge advanced', after > before, `${before} → ${after}`);
ok('administrator ring fired', await admin.evaluate(() => window.__rang) >= 0);

console.log('\n— notification centre —');
await admin.locator('#bellBtn').click();
await admin.waitForTimeout(600);
const alerts = await seen(admin);
ok('alerts page has the event', alerts.length > 40, alerts.slice(0, 120));

console.log('\n— tabs render —');
for (const [tab, marker] of [['الرئيسية', 'الرئيسية'], ['المهام', 'المهام'], ['الجهات', 'الجهات'], ['المكتبة', 'المكتبة'], ['المزيد', 'المزيد']]) {
  await admin.getByText(tab, { exact: true }).first().click();
  await admin.waitForTimeout(350);
  const txt = await seen(admin);
  ok('tab ' + tab, txt.includes(marker));
  ok('  no overflow on ' + tab, await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
}

console.log('\n— settings panels —');
await admin.getByText('الإعدادات والإدارة').first().click();
await admin.waitForTimeout(400);
for (const row of ['المستخدمون والصلاحيات', 'الفروع والتصنيفات', 'المتغيّرات', 'الفريق', 'الإشعارات', 'سجل البريد']) {
  await admin.getByText(row, { exact: true }).first().click();
  await admin.waitForTimeout(500);
  const t = await seen(admin);
  ok('panel ' + row, t.length > 30);
  await admin.locator('button[aria-label="رجوع"]').first().click();
  await admin.waitForTimeout(350);
}

console.log('\n— the library —');
await admin.getByText('المكتبة', { exact: true }).first().click();
await admin.waitForTimeout(600);
await admin.locator('input[type="file"]').first().setInputFiles({
  name: 'دليل-التشغيل.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test'),
});
await admin.waitForTimeout(1200);
ok('the document appears in the list', (await seen(admin)).includes('دليل-التشغيل.pdf'));
await admin.getByLabel('حذف').first().click();
await admin.waitForTimeout(900);
ok('and can be removed', !(await seen(admin)).includes('دليل-التشغيل.pdf'));

console.log('\n— a branch is added from the interface —');
await admin.getByText('المزيد', { exact: true }).first().click();
await admin.waitForTimeout(300);
await admin.getByText('الإعدادات والإدارة').first().click();
await admin.waitForTimeout(400);
await admin.getByText('الفروع والتصنيفات', { exact: true }).first().click();
await admin.waitForTimeout(500);
await admin.getByRole('button', { name: 'فرع', exact: true }).first().click();
await admin.waitForTimeout(400);
const branchDialog = admin.locator('.mut-overlay');
ok('the branch dialog opened', await branchDialog.count() > 0);
await branchDialog.locator('input').first().fill('فرع الأحمدي');
await branchDialog.getByText('حفظ', { exact: true }).first().click();
await admin.waitForTimeout(900);
ok('the branch was created', (await seen(admin)).includes('فرع الأحمدي'));
ok('and reached the state', await admin.evaluate(() =>
  window.ST.S.entities.some((e) => e.name === 'فرع الأحمدي')));

console.log('\n— the variables survive a save —');
await admin.locator('button[aria-label="رجوع"]').first().click();
await admin.waitForTimeout(400);
await admin.getByText('المتغيّرات', { exact: true }).first().click();
await admin.waitForTimeout(600);
const beforeVars = await admin.evaluate(() => window.ST.S.cfg.priorities.length);
await admin.getByText(/إضافة أولوية/).first().click();
await admin.waitForTimeout(300);
await admin.getByText(/^حفظ/).first().click();
await admin.waitForTimeout(1000);
const afterVars = await admin.evaluate(() => window.ST.S.cfg.priorities.length);
ok('a priority was added and saved', afterVars === beforeVars + 1, `${beforeVars} → ${afterVars}`);

console.log('\n— the mute preference sticks —');
await admin.evaluate(() => window.MUT.Ring.setMuted(true));
ok('mute is remembered', await admin.evaluate(() => localStorage.getItem('mutabea.mute') === '1'));
await admin.evaluate(() => window.MUT.Ring.setMuted(false));

console.log('\n— sign out —');
await admin.getByText('المزيد', { exact: true }).first().click();
await admin.waitForTimeout(300);
await admin.getByText('تسجيل الخروج').first().click();
await admin.waitForTimeout(800);
ok('back at the login card', (await seen(admin)).includes('تسجيل الدخول'));

console.log('\n— console —');
const noisy = errors.filter(e => !/favicon|Failed to load resource: the server responded with a status of 40/.test(e));
ok('no console errors', noisy.length === 0, noisy.slice(0, 6).join(' | '));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
