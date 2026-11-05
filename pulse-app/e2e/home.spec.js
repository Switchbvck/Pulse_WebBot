import { expect, test } from '@playwright/test'

test('home dashboard renders the service catalog', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pulse', level: 1 })).toBeVisible()
  await expect(page.getByText('Book your session in two clicks')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'General Consultation' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Check-up' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ask AI Assistant' })).toBeVisible()
})

test('bottom navigation switches screens', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('button', { name: 'Profile' }).click()
  await expect(page.getByRole('heading', { name: 'My Bookings', level: 1 })).toBeVisible()
  await page.getByRole('navigation').getByRole('button', { name: 'Home' }).click()
  await expect(page.getByRole('heading', { name: 'Services', level: 2 })).toBeVisible()
})
