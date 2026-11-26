import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { calculateRecommendedTargets } from '../domain/nutrition';

afterEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('Multi-profile household support & target auto-calculator', () => {
  it('calculates safe Mifflin-St Jeor recommended targets for female and male profiles', () => {
    const wifeTargets = calculateRecommendedTargets({
      name: 'Maria',
      age: 28,
      sex: 'female',
      heightCm: 160,
      activityLevel: 'light',
      startWeightKg: 60,
      startDate: '2026-11-26',
      targetWeightKg: 54,
      targetDate: '2027-05-25',
      caffeineCutoffHour: 18,
    });

    expect(wifeTargets.calories).toBeGreaterThanOrEqual(1200);
    expect(wifeTargets.calories).toBeLessThanOrEqual(1900);
    expect(wifeTargets.proteinG).toBeGreaterThanOrEqual(80);
    expect(wifeTargets.fatG).toBeGreaterThanOrEqual(35);
    expect(wifeTargets.carbsG).toBeGreaterThanOrEqual(50);

    // Extreme deficit clamps safely at 1200 kcal floor for female
    const flooredFemale = calculateRecommendedTargets({
      name: 'Floor Test',
      age: 30,
      sex: 'female',
      heightCm: 155,
      activityLevel: 'desk',
      startWeightKg: 55,
      startDate: '2026-11-26',
      targetWeightKg: 45,
      targetDate: '2026-12-26',
      caffeineCutoffHour: 18,
    });
    expect(flooredFemale.calories).toBe(1200);
  });

  it('creates an isolated second profile with clean logs, switches back and forth with AJ, and deletes secondary profile cleanly', async () => {
    const user = userEvent.setup();
    render(<App initialDate="2026-11-24" />);

    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-24')).toBeInTheDocument();
    });
    expect(screen.getByText('Meals (6)')).toBeInTheDocument();
    expect(screen.getByText('Goal 65 kg')).toBeInTheDocument();

    // Open profile switcher from header
    await user.click(
      screen.getByRole('button', { name: 'Switch or add profile' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Profiles & Setup' });
    await user.click(
      within(dialog).getByRole('button', { name: /Add New Person/i }),
    );

    // Fill wife's details
    await user.type(within(dialog).getByLabelText('Name'), 'Maria');
    const weightInput = within(dialog).getByLabelText('Current Weight (kg)');
    await user.clear(weightInput);
    await user.type(weightInput, '60');
    const goalInput = within(dialog).getByLabelText('Goal Weight (kg)');
    await user.clear(goalInput);
    await user.type(goalInput, '54');

    // Auto-calculated calories field should be populated
    const calInput = within(dialog).getByLabelText(
      'Daily Calories (kcal)',
    ) as HTMLInputElement;
    expect(Number(calInput.value)).toBeGreaterThanOrEqual(1200);

    await user.click(
      within(dialog).getByRole('button', {
        name: /Create Profile & Start Tracking/i,
      }),
    );

    // App switches immediately to Maria's completely blank profile (no AJ Nov 24 meals!)
    await waitFor(() => {
      expect(screen.getByText('Goal 54 kg')).toBeInTheDocument();
      expect(screen.getByText('Meals (0)')).toBeInTheDocument();
    });
    expect(screen.getByText(/60\.0 kg/)).toBeInTheDocument();

    // Log a meal under Maria's profile
    await user.click(screen.getByRole('button', { name: /Manual/i }));
    const mealDialog = screen.getByRole('dialog', { name: 'Quick Add Meal' });
    await user.type(
      within(mealDialog).getByLabelText('Meal Name'),
      'Greek Yogurt & Berries',
    );
    await user.type(
      within(mealDialog).getByLabelText('Calories (kcal)'),
      '220',
    );
    await user.type(within(mealDialog).getByLabelText('Protein (g)'), '18');
    await user.type(within(mealDialog).getByLabelText('Carbs (g)'), '24');
    await user.type(within(mealDialog).getByLabelText('Fat (g)'), '5');
    await user.click(
      within(mealDialog).getByRole('button', { name: 'Save Meal' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Meals (1)')).toBeInTheDocument();
    });
    expect(screen.getByText('Greek Yogurt & Berries')).toBeInTheDocument();

    // Switch back to AJ -> AJ still has his 6 Nov 24 meals and does NOT see Maria's meal
    await user.click(
      screen.getByRole('button', { name: 'Switch or add profile' }),
    );
    const switcher = screen.getByRole('dialog', { name: 'Profiles & Setup' });
    await user.click(within(switcher).getByRole('button', { name: /AJ/i }));

    await waitFor(() => {
      expect(screen.getByText('Goal 65 kg')).toBeInTheDocument();
      expect(screen.getByText('Meals (6)')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Greek Yogurt & Berries'),
    ).not.toBeInTheDocument();

    // Delete Maria's profile -> stays cleanly on AJ
    await user.click(
      screen.getByRole('button', { name: 'Switch or add profile' }),
    );
    const switcher2 = screen.getByRole('dialog', { name: 'Profiles & Setup' });
    await user.click(
      within(switcher2).getByRole('button', { name: 'Delete profile Maria' }),
    );
    await user.click(
      within(switcher2).getByRole('button', { name: 'Confirm Delete' }),
    );
    expect(
      within(switcher2).queryByRole('button', { name: 'Delete profile Maria' }),
    ).not.toBeInTheDocument();
  });

  it('opens directly to Set Up New Profile when visited with ?setup=1', async () => {
    window.history.replaceState({}, '', '/?setup=1');
    render(<App initialDate="2026-11-26" />);

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: 'Profiles & Setup' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Set Up New Profile')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
});
