import { useTheme } from '../context/ThemeContext';

export function useChartTheme() {
  const { isDark } = useTheme();

  return {
    isDark,
    grid: isDark ? '#30363d' : '#e2e8f0',
    axis: isDark ? '#8b949e' : '#64748b',
    tooltipBg: isDark ? '#161b22' : '#ffffff',
    tooltipBorder: isDark ? '#30363d' : '#e2e8f0',
    brushFill: isDark ? '#161b22' : '#f1f5f9',
    brushStroke: isDark ? '#632CA6' : '#632CA6',
    series: {
      volume2g3g: '#FF6B35',
      volume4g: '#3B9EFF',
      mdc1: '#3B9EFF',
      mdc2: '#FF6B35',
      total: isDark ? '#B794F6' : '#7c3aed',
    },
  };
}
