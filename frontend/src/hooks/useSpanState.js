import { useEffect, useMemo, useState } from 'react';
import { getSpanViews } from '../utils/seriesSpans';

/**
 * Shared granularity selection for a report's chart and its data table.
 *
 * Uncontrolled by default (a component gets its own state and starts on the span
 * the backend recommends). Pass `spanId` + `onSpanChange` and the caller owns it
 * instead, which is how a page keeps an explorer and a table on the same view.
 */
export function useSpanState(timeSeries, { spanId, onSpanChange } = {}) {
  const views = useMemo(() => getSpanViews(timeSeries), [timeSeries]);
  const [internalSpanId, setInternalSpanId] = useState(views.auto);

  // A different report (or a reprocessed one) comes with its own recommendation.
  useEffect(() => {
    setInternalSpanId(views.auto);
  }, [views.auto]);

  const controlled = typeof onSpanChange === 'function';
  const requested = controlled ? spanId : internalSpanId;
  const activeId = views.options.some((opt) => opt.id === requested) ? requested : views.auto;

  return {
    options: views.options,
    spanId: activeId,
    setSpanId: controlled ? onSpanChange : setInternalSpanId,
    series: views.series[activeId] || [],
    activeOption: views.options.find((opt) => opt.id === activeId) || null,
  };
}

export default useSpanState;
