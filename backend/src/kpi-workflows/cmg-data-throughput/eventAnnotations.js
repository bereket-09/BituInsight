/**
 * Attach scheduled events to detected throughput peaks.
 *
 * What this layer does and does not claim
 * ---------------------------------------
 * It reports a coincidence in time and nothing more. A peak that overlaps a
 * match window is annotated "coincides with … may have contributed"; the word
 * "caused" never appears, because a time overlap is not evidence of causation
 * and a reader skimming a KPI report will take whatever verb we give them at
 * face value. A peak with no overlapping event is flagged for investigation in
 * those terms rather than left silent, so an unexplained peak stays visible.
 *
 * The event list comes from ./fixtures, which is empty unless an operator
 * supplies one. With no list, every peak is correctly reported as unmatched.
 *
 * Margins
 * -------
 * A match's effect on traffic does not start and stop with the whistle:
 *
 *   PRE_MATCH_MARGIN_MINUTES  (30) — viewers open streams, join the broadcast
 *                                    and start chatting before kickoff.
 *   POST_MATCH_MARGIN_MINUTES (30) — highlights, replays and reaction traffic
 *                                    tail off after the final whistle.
 *   DEFAULT_EVENT_MINUTES    (120) — 90 minutes of play plus half-time and
 *                                    stoppage, used when an event gives no
 *                                    explicit `end`.
 *
 * So a kickoff at 20:00 with no stated end matches any peak between 19:30 and
 * 22:30. The margins are deliberately modest: widening them further would make
 * an evening match "coincide" with most of the evening busy hour, which would
 * be true and useless.
 */

const MINUTE = 60 * 1000;

const PRE_MATCH_MARGIN_MINUTES = 30;
const POST_MATCH_MARGIN_MINUTES = 30;
const DEFAULT_EVENT_MINUTES = 120;

/** The wording the customer asked for, kept in one place so it cannot drift. */
const UNMATCHED_NOTE = 'No event matched — flagged for further investigation.';

function formatEventTime(date) {
  return new Date(date).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The interval a match can plausibly influence, margins included. */
function eventWindow(event) {
  const start = new Date(event.start).getTime();
  const end = event.end
    ? new Date(event.end).getTime()
    : start + DEFAULT_EVENT_MINUTES * MINUTE;
  return {
    from: start - PRE_MATCH_MARGIN_MINUTES * MINUTE,
    to: end + POST_MATCH_MARGIN_MINUTES * MINUTE,
  };
}

function overlaps(peakWindow, window) {
  return peakWindow.startMs <= window.to && peakWindow.endMs >= window.from;
}

/** "Arsenal v Chelsea", or whichever parts the operator supplied. */
function describeFixture(event) {
  const teams = [event.homeTeam, event.awayTeam].filter(Boolean);
  const match = teams.length === 2 ? `${teams[0]} v ${teams[1]}` : teams[0] || null;
  if (event.competition && match) return `${event.competition}: ${match}`;
  return event.competition || match || 'scheduled event';
}

function describeOffset(minutes) {
  if (minutes === 0) return 'at kickoff';
  const abs = Math.abs(minutes);
  const when = minutes > 0 ? 'after' : 'before';
  if (abs < 60) return `${abs} min ${when} kickoff`;
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `${hours}h${rest ? ` ${rest}m` : ''} ${when} kickoff`;
}

/**
 * One event attached to one peak. `note` is the sentence a reader sees; it
 * states a coincidence and an "may have contributed", never a cause.
 */
function buildMatch(peakWindow, event) {
  const kickoffMs = new Date(event.start).getTime();
  const offsetMinutes = Math.round((peakWindow.startMs - kickoffMs) / MINUTE);
  const kickoffLabel = event.kickoff || formatEventTime(event.start);

  return {
    competition: event.competition,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    fixture: describeFixture(event),
    kickoff: kickoffLabel,
    kickoffTimestamp: new Date(event.start).toISOString(),
    endTimestamp: event.end ? new Date(event.end).toISOString() : null,
    offsetMinutes,
    offsetLabel: describeOffset(offsetMinutes),
  };
}

function matchedNote(matches) {
  const phrases = matches.map(
    (m) => `${m.fixture}, kickoff ${m.kickoff} (peak ${m.offsetLabel})`
  );
  const joined =
    phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join('; ')}; and ${phrases.at(-1)}`;
  return (
    `Coincides with ${joined}. ` +
    `The ${matches.length === 1 ? 'match' : 'matches'} may have contributed to the increased ` +
    'traffic. This is a coincidence in time, not a confirmed cause.'
  );
}

/** Why nothing matched, so the reader knows whether a list was even present. */
function unmatchedDetail(eventCount) {
  return eventCount === 0
    ? 'No fixture list is configured for this deployment, so no event could be checked against this peak.'
    : `None of the ${eventCount} supplied fixtures fall within this peak's window ` +
        `(${PRE_MATCH_MARGIN_MINUTES} min before kickoff to ${POST_MATCH_MARGIN_MINUTES} min after the final whistle).`;
}

/**
 * Annotate each peak with any events overlapping its window.
 *
 * @param {Array}  peaks   from ./peaks.js — each needs { timestamp, windowEnd }.
 * @param {Array}  events  from ./fixtures — may be empty, and usually is.
 * @returns {Array} the same peaks, each with { events, matched, note, detail }.
 */
function annotatePeaks(peaks, events = []) {
  const windows = (events || []).map((event) => ({ event, window: eventWindow(event) }));

  return (peaks || []).map((peak) => {
    const peakWindow = {
      startMs: new Date(peak.timestamp).getTime(),
      endMs: new Date(peak.windowEnd || peak.timestamp).getTime(),
    };

    const matches = windows
      .filter(({ window }) => overlaps(peakWindow, window))
      .map(({ event }) => buildMatch(peakWindow, event))
      .sort((a, b) => Math.abs(a.offsetMinutes) - Math.abs(b.offsetMinutes));

    return {
      ...peak,
      events: matches,
      matched: matches.length > 0,
      note: matches.length ? matchedNote(matches) : UNMATCHED_NOTE,
      detail: matches.length ? null : unmatchedDetail(windows.length),
    };
  });
}

module.exports = {
  annotatePeaks,
  eventWindow,
  describeFixture,
  PRE_MATCH_MARGIN_MINUTES,
  POST_MATCH_MARGIN_MINUTES,
  DEFAULT_EVENT_MINUTES,
  UNMATCHED_NOTE,
};
