import { Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ className, showLabel = false, iconOnly = false }) {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg border border-noc-border bg-noc-surface text-sm font-medium text-noc-text transition-all hover:border-noc-accent/40 hover:bg-noc-card',
        iconOnly ? 'p-2' : 'px-3 py-2',
        className
      )}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400" />
      ) : (
        <Moon className="h-4 w-4 text-noc-accent" />
      )}
      {showLabel && <span className="text-xs">{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  );
}
