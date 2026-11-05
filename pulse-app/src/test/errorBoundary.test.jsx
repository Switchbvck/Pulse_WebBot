import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from '../components/ErrorBoundary'

function Boom({ crash }) {
  if (crash) throw new Error('kaboom')
  return <p>all good</p>
}

describe('ErrorBoundary', () => {
  it('renders children normally', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('all good')).toBeInTheDocument()
  })

  it('shows the branded fallback and the error message on crash', () => {
    // Silence the expected console.error noise from React and the boundary.
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom crash />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('kaboom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload pulse/i })).toBeInTheDocument()
    silence.mockRestore()
  })

  it('reloads when the button is clicked', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom crash />
      </ErrorBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: /reload pulse/i }))
    expect(reload).toHaveBeenCalledOnce()
    silence.mockRestore()
    vi.unstubAllGlobals()
  })
})
