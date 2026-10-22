const fs = require('fs');
const path = require('path');
const logger = require('../../../utils/logger');

/**
 * Pluggable event source for CMG throughput peak annotation.
 *
 * EMPTY BY DEFAULT, DELIBERATELY.
 *
 * There is no football fixture data in this product and nothing here calls an
 * external service. Kickoff times are the kind of fact a language model
 * invents, so the narrative layer is never asked for them either (it only ever
 * sees `analysis.brief`, which carries no event data). Until an operator
 * supplies a list, every detected peak is annotated "no event matched —
 * flagged for further investigation", which is the honest answer.
 *
 * ── The interface ────────────────────────────────────────────────────────────
 *
 * An event source is anything that returns an array of plain objects:
 *
 *   {
 *     start:       required. Kickoff. ISO 8601 string or Date. Give it an
 *                  explicit offset ("2026-05-08T20:00:00+03:00") or a 'Z'
 *                  instant; a bare "2026-05-08T20:00" is read in the server's
 *                  own zone, which is rarely what the operator means.
 *     end:         optional. Final whistle, same formats. Defaults to
 *                  start + DEFAULT_EVENT_MINUTES (see ../eventAnnotations.js).
 *     competition: required. "Premier League", "UEFA Champions League", …
 *     homeTeam:    optional string.
 *     awayTeam:    optional string.
 *     kickoff:     optional display label. Falls back to a label formatted
 *                  from `start`.
 *   }
 *
 * Unknown extra keys are ignored, so a richer feed can be dropped in unchanged.
 *
 * ── Supplying a list ─────────────────────────────────────────────────────────
 *
 *   1. Put a JSON file named `fixtures.json` next to this file, or
 *   2. point the CMG_FIXTURES_FILE environment variable at a JSON file
 *      anywhere on disk, or
 *   3. call setFixtureSource(fn) at boot with your own loader — an API client,
 *      a database read, whatever — as long as it returns the array above.
 *
 * The JSON may be either a bare array or `{ "events": [ … ] }`.
 * `fixtures.example.json` in this directory shows the shape. It is an example
 * and is never loaded: the teams in it are not real.
 */

/** Where an operator-supplied list is looked for, in order. */
const LOCAL_FIXTURE_FILE = path.join(__dirname, 'fixtures.json');

let customSource = null;

/** Replace the built-in file loader with your own. Pass null to restore it. */
function setFixtureSource(fn) {
  customSource = typeof fn === 'function' ? fn : null;
}

function resetFixtureSource() {
  customSource = null;
}

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function text(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * Keep only entries that can actually be matched against a peak: a readable
 * start and something to call the event by. A malformed row is dropped rather
 * than guessed at, and it is logged so the operator can see which one.
 */
function normalizeEvent(raw, index) {
  if (!raw || typeof raw !== 'object') return null;

  const start = toDate(raw.start);
  if (!start) {
    logger.warn('Fixture dropped: unreadable start time', { index, start: raw.start });
    return null;
  }

  const end = toDate(raw.end);
  if (end && end <= start) {
    logger.warn('Fixture dropped: end is not after start', { index, start: raw.start, end: raw.end });
    return null;
  }

  const competition = text(raw.competition);
  const homeTeam = text(raw.homeTeam);
  const awayTeam = text(raw.awayTeam);
  if (!competition && !homeTeam && !awayTeam) {
    logger.warn('Fixture dropped: no competition or team names', { index });
    return null;
  }

  return {
    start,
    end: end || null,
    competition,
    homeTeam,
    awayTeam,
    kickoff: text(raw.kickoff),
  };
}

function readJsonFile(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.events)) return parsed.events;
  throw new Error('expected an array of events, or { "events": [ … ] }');
}

/**
 * The events available to the annotation layer, normalized and sorted.
 * Never throws: a missing or broken list leaves peaks unmatched, which is a
 * reportable state, not a failed report.
 *
 * @returns {Array<{start: Date, end: ?Date, competition: ?string,
 *                  homeTeam: ?string, awayTeam: ?string, kickoff: ?string}>}
 */
function loadFixtures() {
  let raw = [];
  let origin = 'none';

  try {
    if (customSource) {
      raw = customSource() || [];
      origin = 'custom source';
    } else {
      const envPath = text(process.env.CMG_FIXTURES_FILE);
      const filePath = envPath || LOCAL_FIXTURE_FILE;
      if (!fs.existsSync(filePath)) return [];
      raw = readJsonFile(filePath);
      origin = filePath;
    }
  } catch (err) {
    logger.warn('Fixture list could not be read — peaks will be reported unmatched', {
      error: err.message,
    });
    return [];
  }

  if (!Array.isArray(raw)) {
    logger.warn('Fixture source did not return an array — peaks will be reported unmatched', {
      origin,
    });
    return [];
  }

  const events = raw.map(normalizeEvent).filter(Boolean).sort((a, b) => a.start - b.start);
  if (events.length) {
    logger.info('Fixture list loaded for peak annotation', { origin, events: events.length });
  }
  return events;
}

module.exports = {
  loadFixtures,
  setFixtureSource,
  resetFixtureSource,
  normalizeEvent,
  LOCAL_FIXTURE_FILE,
};
