import { expect, test } from '@playwright/test'

test('?service=<id> deep link opens the wizard on that service', async ({ page }) => {
  await page.goto('/?service=2')
  await expect(page.getByText('Step 2 of 3')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Diagnostics')).toBeVisible() // service 2 in the demo catalog
})

test('unknown service id still opens the wizard at step 1', async ({ page }) => {
  await page.goto('/?service=does-not-exist')
  await expect(page.getByText('Step 1 of 3')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /General Consultation/ })).toBeVisible()
})
