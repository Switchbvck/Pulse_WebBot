import { expect, test } from '@playwright/test'

test('booking wizard completes a full flow on demo data', async ({ page }) => {
  await page.goto('/')

  // Step 1: pick a service from the dashboard
  await page
    .locator('.glass-card')
    .filter({ hasText: 'Check-up' })
    .getByRole('button', { name: 'Book' })
    .click()

  // Step 2: choose the first available slot of the default day
  await expect(page.getByText('Step 2 of 3')).toBeVisible()
  const slot = page.locator('main button').filter({ hasText: /^\d{2}:\d{2}$/ }).first()
  await expect(slot).toBeVisible({ timeout: 10_000 })
  await slot.click()
  await page.getByRole('button', { name: /Continue/ }).click()

  // Step 3: confirm with the auto-filled Telegram identity
  await expect(page.getByText('Step 3 of 3')).toBeVisible()
  await expect(page.getByText(/Telegram ID:/)).toBeVisible()
  await page.getByRole('button', { name: /Confirm Booking/ }).click()

  // Success lands on the profile with the new booking
  await expect(page.getByRole('heading', { name: 'My Bookings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText('Check-up').first()).toBeVisible()
})

test('wizard validation: Continue stays disabled without a slot', async ({ page }) => {
  await page.goto('/?service=svc-checkup')
  await expect(page.getByText('Step 2 of 3')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /Continue/ })).toBeDisabled()
})
