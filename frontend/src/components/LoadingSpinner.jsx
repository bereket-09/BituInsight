import clsx from 'clsx';

export default function LoadingSpinner({ size = 'md', fullScreen = false, label }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };

  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div
        className={clsx(
          'animate-spin rounded-full border-2 border-noc-border border-t-noc-accent',
          sizes[size]
        )}
      />
      {label && <p className="text-sm text-noc-muted">{label}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-noc-bg">
        {spinner}
      </div>
    );
  }

  return <div className="flex justify-center py-12">{spinner}</div>;
}
