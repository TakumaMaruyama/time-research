import { normalizeCompareAges } from "@/lib/compare-age";
import { COURSES, GENDERS, type Course, type Gender } from "@/lib/domain";

export const SEARCH_LAST_INPUT_STORAGE_KEY = "search_last_input_v1";
export const SEARCH_HISTORY_STORAGE_KEY = "search_history_v1";
export const SEARCH_HISTORY_LIMIT = 10;

export type StoredSearchInput = {
  playerName: string;
  gender: Gender;
  course: Course;
  season: string;
  targetAges: number[];
};

export type SearchHistoryItem = StoredSearchInput & {
  searchedAt: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGender(value: unknown): value is Gender {
  return typeof value === "string" && GENDERS.includes(value as Gender);
}

function isCourse(value: unknown): value is Course {
  return typeof value === "string" && COURSES.includes(value as Course);
}

function isValidSeasonString(value: unknown): value is string {
  if (value === undefined) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return true;
  }

  const seasonNumber = Number.parseInt(trimmed, 10);
  return /^\d{4}$/.test(trimmed) && seasonNumber >= 1900 && seasonNumber <= 3000;
}

function normalizePlayerName(value: unknown): string | null {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string") {
    return null;
  }
  return value.trim().slice(0, 50);
}

function normalizeTargetAgesField(value: unknown): number[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }

  return normalizeCompareAges(value.map((item) => Number.parseInt(String(item), 10)));
}

function normalizeStoredSearchInput(input: unknown): StoredSearchInput | null {
  if (!isObject(input)) {
    return null;
  }

  const playerName = normalizePlayerName(input.playerName);
  if (playerName === null) {
    return null;
  }

  if (!isGender(input.gender)) {
    return null;
  }
  if (!isCourse(input.course)) {
    return null;
  }
  if (!isValidSeasonString(input.season)) {
    return null;
  }

  const hasTargetAges = Object.prototype.hasOwnProperty.call(input, "targetAges");
  const targetAges = hasTargetAges
    ? normalizeTargetAgesField(input.targetAges)
    : normalizeTargetAgesField(input.compareAges);
  if (targetAges === null || targetAges.length === 0) {
    return null;
  }

  return {
    playerName,
    gender: input.gender,
    course: input.course,
    season: typeof input.season === "string" ? input.season.trim() : "",
    targetAges,
  };
}

function toTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return timestamp;
}

function normalizeHistoryItem(input: unknown): SearchHistoryItem | null {
  if (!isObject(input)) {
    return null;
  }

  const base = normalizeStoredSearchInput(input);
  if (!base || typeof input.searchedAt !== "string") {
    return null;
  }

  const timestamp = toTimestamp(input.searchedAt);
  if (timestamp === null) {
    return null;
  }

  return {
    ...base,
    searchedAt: new Date(timestamp).toISOString(),
  };
}

function makeHistoryKey(input: StoredSearchInput): string {
  return `${input.gender}|${input.course}|${input.season}|${input.playerName}|${input.targetAges.join(",")}`;
}

function readStorageValue(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // noop
  }
}

export function readLastSearchInput(): StoredSearchInput | null {
  const raw = readStorageValue(SEARCH_LAST_INPUT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeStoredSearchInput(parsed);
  } catch {
    return null;
  }
}

export function writeLastSearchInput(input: StoredSearchInput): void {
  const normalized = normalizeStoredSearchInput(input);
  if (!normalized) {
    return;
  }
  writeStorageValue(SEARCH_LAST_INPUT_STORAGE_KEY, JSON.stringify(normalized));
}

export function readSearchHistory(): SearchHistoryItem[] {
  const raw = readStorageValue(SEARCH_HISTORY_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed
      .map((item) => normalizeHistoryItem(item))
      .filter((item): item is SearchHistoryItem => item !== null)
      .sort((a, b) => {
        const tsA = toTimestamp(a.searchedAt) ?? 0;
        const tsB = toTimestamp(b.searchedAt) ?? 0;
        return tsB - tsA;
      });

    const deduplicated: SearchHistoryItem[] = [];
    const seen = new Set<string>();

    for (const item of normalized) {
      const key = makeHistoryKey(item);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduplicated.push(item);
      if (deduplicated.length >= SEARCH_HISTORY_LIMIT) {
        break;
      }
    }

    return deduplicated;
  } catch {
    return [];
  }
}

function writeSearchHistory(items: SearchHistoryItem[]): void {
  writeStorageValue(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(items));
}

export function upsertSearchHistory(input: StoredSearchInput): SearchHistoryItem[] {
  const normalized = normalizeStoredSearchInput(input);
  if (!normalized) {
    return readSearchHistory();
  }

  const nextItem: SearchHistoryItem = {
    ...normalized,
    searchedAt: new Date().toISOString(),
  };

  const key = makeHistoryKey(normalized);
  const nextHistory = [nextItem, ...readSearchHistory().filter((item) => makeHistoryKey(item) !== key)].slice(
    0,
    SEARCH_HISTORY_LIMIT,
  );

  writeSearchHistory(nextHistory);
  return nextHistory;
}
