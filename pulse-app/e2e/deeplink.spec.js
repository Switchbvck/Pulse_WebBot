import { expect, test } from '@playwright/test'

// The demo catalog uses string ids (svc-*); a svc id skips wizard step 1.
test('?service=<id> deep link opens the wizard past step 1', async ({ page }) => {
  await page.goto('/?service=svc-diagnostics')
  await expect(page.getByText('Step 2 of 3')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Pick date & time')).toBeVisible()
})

test('unknown service id still opens the wizard at step 1', async ({ page }) => {
  await page.goto('/?service=does-not-exist')
  await expect(page.getByText('Step 1 of 3')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /General Consultation/ })).toBeVisible()
})
