import clsx from 'clsx';
import { Check } from 'lucide-react';

export default function UploadWizardSteps({ steps, currentIndex, onStepClick }) {
  return (
    <nav aria-label="Upload progress" className="relative">
      <div className="absolute left-0 right-0 top-5 hidden h-px bg-noc-border sm:block" aria-hidden />
      <ol className="grid gap-2 sm:flex sm:items-start sm:justify-between sm:gap-0">
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          const clickable = onStepClick && index < currentIndex;

          return (
            <li
              key={step.id}
              className={clsx(
                'relative flex items-center gap-3 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:px-2',
                index < steps.length - 1 && 'sm:pb-0'
              )}
            >
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick(index)}
                className={clsx(
                  'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all',
                  done && 'border-noc-accent bg-noc-accent text-white',
                  active && !done && 'border-noc-accent bg-noc-accent/15 text-noc-accent shadow-glow',
                  !done && !active && 'border-noc-border bg-noc-card text-noc-muted',
                  clickable && 'cursor-pointer hover:scale-105',
                  !clickable && 'cursor-default'
                )}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
              </button>
              <div className="min-w-0 sm:text-center">
                <p
                  className={clsx(
                    'text-xs font-semibold',
                    active ? 'text-noc-accent' : done ? 'text-noc-text' : 'text-noc-muted'
                  )}
                >
                  {step.label}
                </p>
                {step.hint && (
                  <p className="mt-0.5 hidden text-[10px] text-noc-muted sm:block">{step.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
