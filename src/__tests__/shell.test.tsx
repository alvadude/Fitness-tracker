import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { IndexedDbRepository } from '../services/storage';

describe('app shell & bottom navigation', () => {
  it('renders Today with seeded Nov 24 macros and switches across all 4 tabs', async () => {
    const user = userEvent.setup();
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_fittrack_shell',
    });

    render(<App repository={repo} initialDate="2026-11-24" />);

    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-24')).toBeInTheDocument();
    });
    expect(screen.getByText('2318')).toBeInTheDocument();
    expect(screen.getByText('170g')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Training' }));
    expect(
      screen.getByText('Tuesday — Active Recovery Walk'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Progress' }));
    expect(screen.getByText('Weight Trajectory')).toBeInTheDocument();
    expect(screen.getByText('65.0 kg')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByText('Profile & Targets')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
  });
});
