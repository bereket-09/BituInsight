import { Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '../context/ThemeContext';

const ICON_STROKE = 1.75;

/**
 * The two icons are stacked and crossfaded rather than swapped, so the control
 * never shifts width and the change reads as one object turning over.
 * Both icons use the single accent — an amber sun would be a second hue.
 */
export default function ThemeToggle({ className, showLabel = false, iconOnly = false }) {
  const { toggleTheme, isDark } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={clsx(
        'group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-noc-border bg-noc-surface text-sm font-medium text-noc-text',
        'transition-all duration-200 hover:border-noc-accent/40 hover:bg-noc-card active:translate-y-px',
        iconOnly ? 'h-9 w-9 p-0' : 'px-3 py-2',
        className
      )}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-pressed={isDark}
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <Sun
          strokeWidth={ICON_STROKE}
          className={clsx(
            'absolute h-4 w-4 text-noc-textDim transition-all duration-300 group-hover:text-noc-accent',
            isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'
          )}
        />
        <Moon
          strokeWidth={ICON_STROKE}
          className={clsx(
            'absolute h-4 w-4 text-noc-textDim transition-all duration-300 group-hover:text-noc-accent',
            isDark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'
          )}
        />
      </span>
      {showLabel && !iconOnly && (
        <span className="text-xs">{isDark ? 'Light' : 'Dark'}</span>
      )}
    </button>
  );
}
