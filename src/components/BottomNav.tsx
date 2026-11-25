import { BarChart3, Dumbbell, Flame, Settings } from 'lucide-react';
import type { TabId } from '../domain/types';

export interface BottomNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

const NAV_ITEMS: { id: TabId; label: string; Icon: typeof Flame }[] = [
  { id: 'today', label: 'Today', Icon: Flame },
  { id: 'training', label: 'Training', Icon: Dumbbell },
  { id: 'progress', label: 'Progress', Icon: BarChart3 },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export function BottomNav({ activeTab, onSelectTab }: BottomNavProps) {
  return (
    <nav
      aria-label="Primary Navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800/80 bg-[#0b1120]/95 backdrop-blur-md pb-safe"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1 px-2 py-1.5">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
