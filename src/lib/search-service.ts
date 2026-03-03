import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import {
  normalizeCompareAges,
} from "@/lib/compare-age";
import { db } from "@/db/client";
import { meets, standards } from "@/db/schema";
import {
  getCurrentDatePartsInTimeZone,
} from "@/lib/date";
import {
  courseSchema,
  genderSchema,
  STANDARD_LEVELS,
  type Course,
  type Gender,
  type StandardLevel,
} from "@/lib/domain";
import { BadRequestError } from "@/lib/errors";
import { compareEventCode } from "@/lib/event";
import { resolveSeason } from "@/lib/season";
import { formatTimeMs } from "@/lib/time";

export const searchRequestSchema = z.object({
  gender: genderSchema,
  course: courseSchema,
  season: z.number().int().min(1900).max(3000).nullable().optional().default(null),
  targetAges: z.array(z.number().int().min(9).max(17)).optional().default([]),
  compareAges: z.array(z.number().int().min(9).max(17)).optional().default([]),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

export type SearchRow = {
  event_code: string;
  age: number;
  time: string;
};

export type SearchMeetResult = {
  meet_id: string;
  meet_name: string;
  meet_season: number;
  meet_course: Course;
  meet_date: string | null;
  meet_date_end: string | null;
  meet_metadata: Record<string, unknown> | null;
  items: SearchRow[];
};

export type SearchResponse = {
  targetAges: number[];
  season: number | null;
  course: Course;
  gender: Gender;
  results: Record<StandardLevel, SearchMeetResult[]>;
};

export function validateSearchRequest(input: unknown): SearchRequest {
  const parsed = searchRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(
      parsed.error.issues.map((issue) => issue.message).join(", "),
    );
  }
  return parsed.data;
}

function resolveSearchCourses(course: Course): Course[] {
  if (course === "ANY") {
    return ["SCM", "LCM", "ANY"];
  }
  return [course, "ANY"];
}

async function resolveSearchSeason(params: {
  fallbackDate: ReturnType<typeof getCurrentDatePartsInTimeZone>;
  courses: Course[];
  gender: Gender;
  minAge: number;
  maxAge: number;
}): Promise<number> {
  const latestRows = await db
    .select({
      latestSeason: sql<number | null>`max(${meets.season})`,
    })
    .from(standards)
    .innerJoin(meets, eq(standards.meetId, meets.id))
    .where(
      and(
        inArray(meets.course, params.courses),
        eq(standards.gender, params.gender),
        lte(standards.ageMin, params.maxAge),
        gte(standards.ageMax, params.minAge),
        inArray(meets.level, [...STANDARD_LEVELS]),
      ),
    );

  const latestSeasonRaw = latestRows[0]?.latestSeason ?? null;
  const latestSeason =
    latestSeasonRaw === null ? null : Number.parseInt(String(latestSeasonRaw), 10);

  if (latestSeason !== null && Number.isFinite(latestSeason)) {
    return latestSeason;
  }

  return resolveSeason(null, params.fallbackDate);
}

export async function searchStandards(input: SearchRequest): Promise<SearchResponse> {
  const currentDate = getCurrentDatePartsInTimeZone("Asia/Tokyo");
  const targetAges = normalizeCompareAges([...input.targetAges, ...input.compareAges]);
  if (targetAges.length === 0) {
    throw new BadRequestError("targetAges must include at least one value.");
  }
  const courses = resolveSearchCourses(input.course);
  const searchAllSeasons = input.course === "ANY" && input.season === null;

  const season = input.season
    ? input.season
    : searchAllSeasons
      ? null
      : await resolveSearchSeason({
          fallbackDate: currentDate,
          courses,
          gender: input.gender,
          minAge: Math.min(...targetAges),
          maxAge: Math.max(...targetAges),
        });

  const minAge = Math.min(...targetAges);
  const maxAge = Math.max(...targetAges);

  const found = await db
    .select({
      level: meets.level,
      meetId: meets.id,
      meetName: meets.name,
      meetSeason: meets.season,
      meetCourse: meets.course,
      meetDate: meets.meetDate,
      meetDateEnd: meets.meetEndDate,
      meetMetadata: meets.metadataJson,
      ageMin: standards.ageMin,
      ageMax: standards.ageMax,
      eventCode: standards.eventCode,
      timeMs: standards.timeMs,
    })
    .from(standards)
    .innerJoin(meets, eq(standards.meetId, meets.id))
    .where(
      and(
        ...(season === null ? [] : [eq(meets.season, season)]),
        inArray(meets.course, courses),
        eq(standards.gender, input.gender),
        lte(standards.ageMin, maxAge),
        gte(standards.ageMax, minAge),
        inArray(meets.level, [...STANDARD_LEVELS]),
      ),
    )
    .orderBy(asc(meets.level), asc(meets.name), asc(standards.eventCode));

  const results: Record<StandardLevel, SearchMeetResult[]> = {
    national: [],
    kyushu: [],
    kagoshima: [],
  };

  const grouped = new Map<string, SearchMeetResult>();
  const seenItemKeys = new Map<string, Set<string>>();

  for (const row of found) {
    const key = `${row.level}|${row.meetId}`;
    let meetGroup = grouped.get(key);

    if (!meetGroup) {
      meetGroup = {
        meet_id: row.meetId,
        meet_name: row.meetName,
        meet_season: row.meetSeason,
        meet_course: row.meetCourse,
        meet_date: row.meetDate,
        meet_date_end: row.meetDateEnd,
        meet_metadata: (row.meetMetadata ?? null) as Record<string, unknown> | null,
        items: [],
      };
      grouped.set(key, meetGroup);
      seenItemKeys.set(key, new Set());
      results[row.level].push(meetGroup);
    }

    const seen = seenItemKeys.get(key);
    if (!seen) {
      continue;
    }

    for (const targetAge of targetAges) {
      if (row.ageMin <= targetAge && row.ageMax >= targetAge) {
        const itemKey = `${row.eventCode}|${targetAge}`;
        if (seen.has(itemKey)) {
          continue;
        }
        seen.add(itemKey);
        meetGroup.items.push({
          event_code: row.eventCode,
          age: targetAge,
          time: formatTimeMs(row.timeMs),
        });
      }
    }
  }

  for (const level of STANDARD_LEVELS) {
    results[level].sort((a, b) => {
      if (a.meet_season !== b.meet_season) {
        return b.meet_season - a.meet_season;
      }
      return a.meet_name.localeCompare(b.meet_name);
    });
    for (const meet of results[level]) {
      meet.items.sort((a, b) => {
        const eventComparison = compareEventCode(a.event_code, b.event_code);
        if (eventComparison !== 0) {
          return eventComparison;
        }
        return a.age - b.age;
      });
    }
  }

  return {
    targetAges,
    season,
    course: input.course,
    gender: input.gender,
    results,
  };
}
