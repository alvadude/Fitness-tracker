import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { parseIsoDateLocal } from '../../domain/training';
import type { IsoDate, WeighInEntry } from '../../domain/types';

export interface WeighInModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate: IsoDate;
  initialWeightKg: number;
  existingEntry?: WeighInEntry | null;
  onSave: (
    entry: Omit<WeighInEntry, 'id' | 'createdAt'> & { id?: string },
  ) => Promise<unknown>;
}

export function WeighInModal({
  isOpen,
  onClose,
  defaultDate,
  initialWeightKg,
  existingEntry,
  onSave,
}: WeighInModalProps) {
  const [date, setDate] = useState<IsoDate>(defaultDate);
  const [weightInput, setWeightInput] = useState<string>('');
  const [isFasted, setIsFasted] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const isSavingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      isSavingRef.current = false;
      return;
    }
    isSavingRef.current = false;
    setDate(existingEntry?.date ?? defaultDate);
    setWeightInput(
      existingEntry ? String(existingEntry.weightKg) : '',
    );
    setIsFasted(existingEntry?.isFasted ?? true);
    setNotes(existingEntry?.notes ?? '');
    setError(null);
    setIsSaving(false);
  }, [defaultDate, existingEntry, isOpen]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSavingRef.current || isSaving) {
      return;
    }
    setError(null);

    const trimmedDate = date.trim();
    try {
      parseIsoDateLocal(trimmedDate);
    } catch {
      setError('Please enter a valid calendar date (YYYY-MM-DD).');
      return;
    }

    const trimmedWeight = weightInput.trim();
    const parsedWeight = Number(trimmedWeight);
    if (
      trimmedWeight.length === 0 ||
      !Number.isFinite(parsedWeight) ||
      parsedWeight < 30 ||
      parsedWeight > 300
    ) {
      setError('Please enter a valid weight between 30 and 300 kg.');
      return;
    }

    const roundedWeight = Math.round(parsedWeight * 100) / 100;
    const trimmedNotes = notes.trim();

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await onSave({
        id: existingEntry?.id,
        date: trimmedDate,
        weightKg: roundedWeight,
        isFasted,
        notes: trimmedNotes.length > 0 ? trimmedNotes : undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to save weigh-in.',
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existingEntry ? 'Edit Weigh-In' : 'Morning Weigh-In'}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <p className="text-xs text-slate-400">
          Log your Saturday 7:00 AM fasted morning weight (or any check-in) to
          track progress against your 65.0 kg June 2027 trajectory.
        </p>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2.5 text-xs text-rose-200"
          >
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="weighin-weight"
            className="block text-xs font-medium text-slate-300"
          >
            Weight (kg)
          </label>
          <input
            id="weighin-weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={30}
            max={300}
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder={`e.g. ${initialWeightKg.toFixed(1)}`}
            className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="weighin-date"
            className="block text-xs font-medium text-slate-300"
          >
            Date
          </label>
          <input
            id="weighin-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/50 px-3 py-2">
          <input
            type="checkbox"
            checked={isFasted}
            onChange={(e) => setIsFasted(e.target.checked)}
            className="h-5 w-5 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
          />
          <span className="text-sm text-slate-200">
            Fasted morning weigh-in (7:00 AM)
          </span>
        </label>

        <div className="space-y-1.5">
          <label
            htmlFor="weighin-notes"
            className="block text-xs font-medium text-slate-300"
          >
            Notes (optional)
          </label>
          <input
            id="weighin-notes"
            type="text"
            maxLength={200}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Post-restroom, after good sleep"
            className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="min-h-[44px] flex-1 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
          >
            {isSaving
              ? 'Saving...'
              : existingEntry
                ? 'Update Weigh-In'
                : 'Save Weigh-In'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
