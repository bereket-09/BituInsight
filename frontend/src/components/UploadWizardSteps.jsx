import clsx from 'clsx';
import { Check } from 'lucide-react';

/**
 * Progress is shown twice on purpose: a filled rail gives the glanceable
 * "how far am I", the numbered markers give the "what is this step".
 */
export default function UploadWizardSteps({ steps, currentIndex, onStepClick }) {
  const lastIndex = Math.max(steps.length - 1, 1);
  const progressPct = Math.min(100, Math.max(0, (currentIndex / lastIndex) * 100));

  return (
    <nav aria-label="Upload progress" className="relative">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <p className="eyebrow">
          Step {Math.min(currentIndex + 1, steps.length)} of {steps.length}
        </p>
        <p className="tabular text-[11px] font-medium text-noc-muted">
          {Math.round(progressPct)}% complete
        </p>
      </div>

      <div className="relative">
        {/* Rail — sits on the marker centre line (markers are 36px tall) */}
        <div
          className="absolute left-6 right-6 top-[17px] hidden h-px bg-noc-border sm:block"
          aria-hidden
        >
          <div
            className="h-px bg-noc-accent transition-[width] duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <ol className="grid gap-3 sm:flex sm:items-start sm:justify-between sm:gap-0">
          {steps.map((step, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            const clickable = onStepClick && index < currentIndex;

            return (
              <li
                key={step.id}
                className="relative flex items-center gap-3 sm:flex-1 sm:flex-col sm:items-center sm:gap-2.5"
                aria-current={active ? 'step' : undefined}
              >
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onStepClick(index)}
                  aria-label={clickable ? `Go back to ${step.label}` : step.label}
                  className={clsx(
                    'tabular relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-200',
                    done && 'border-noc-accent bg-noc-accent text-white',
                    active && 'border-noc-accent bg-noc-card text-noc-accent shadow-glow',
                    !done && !active && 'border-noc-border bg-noc-card text-noc-muted',
                    clickable
                      ? 'cursor-pointer hover:bg-noc-accentHover active:translate-y-px'
                      : 'cursor-default'
                  )}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : index + 1}
                </button>
                <div className="min-w-0 sm:text-center">
                  <p
                    className={clsx(
                      'text-xs font-semibold tracking-tight transition-colors duration-200',
                      active ? 'text-noc-text' : done ? 'text-noc-textDim' : 'text-noc-muted'
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
      </div>
    </nav>
  );
}
