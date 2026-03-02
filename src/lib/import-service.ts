import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { meets, standards } from "@/db/schema";
import { parseIsoDateOnly } from "@/lib/date";
import {
  courseSchema,
  EVENT_CODE_REGEX,
  genderSchema,
  standardLevelSchema,
  type Course,
  type Gender,
  type StandardLevel,
} from "@/lib/domain";
import { BadRequestError } from "@/lib/errors";
import { formatTimeMs, parseTimeToMs } from "@/lib/time";

const meetMetadataSchema = z.record(z.string(), z.unknown());
const meetDateSchema = z
  .string()
  .trim()
  .refine((value) => parseIsoDateOnly(value) !== null, {
    message: "meetDate must be YYYY-MM-DD.",
  });

export const adminImportRequestSchema = z.object({
  level: standardLevelSchema,
  season: z.coerce.number().int().min(1900).max(3000),
  course: courseSchema,
  meetName: z.string().trim().min(1, "meetName is required."),
  meetDate: meetDateSchema.nullable().optional().default(null),
  meetMetadata: meetMetadataSchema.nullable().optional().default(null),
  jsonText: z.string().min(1, "jsonText is required."),
});

const sourceSchema = z.object({
  title: z.string().trim().min(1, "source.title is required."),
  url: z.string().url().nullable(),
  pages: z.array(z.number().int().nonnegative()).nullable(),
});

const importPayloadSchema = z.object({
  source: sourceSchema,
  rows: z.array(z.unknown()),
});

const importRowSchema = z
  .object({
    gender: genderSchema,
    age_min: z.number().int().min(0).max(120),
    age_max: z.number().int().min(0).max(120),
    event_code: z
      .string()
      .trim()
      .regex(
        EVENT_CODE_REGEX,
        "event_code must match /^(FR|BK|BR|FL|IM)_\\d{2,4}$/",
      ),
    time: z.string().trim().min(1),
  })
  .superRefine((row, ctx) => {
    if (row.age_min > row.age_max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "age_min must be <= age_max",
        path: ["age_min"],
      });
    }
  });

export type AdminImportRequest = z.infer<typeof adminImportRequestSchema>;

export type ImportError = {
  rowIndex: number | null;
  message: string;
};

export type NormalizedImportRow = {
  rowIndex: number;
  gender: Gender;
  age_min: number;
  age_max: number;
  event_code: string;
  time: string;
  time_ms: number;
  status: "add" | "update" | "skip";
};

export type ImportPreviewMeet = {
  id: string | null;
  level: StandardLevel;
  season: number;
  course: Course;
  name: string;
  meet_date: string | null;
  metadata: Record<string, unknown> | null;
  exists: boolean;
};

export type ImportPreviewResult = {
  meet: ImportPreviewMeet;
  source: z.infer<typeof sourceSchema> | null;
  normalizedRows: NormalizedImportRow[];
  errors: ImportError[];
  counts: {
    total: number;
    add: number;
    update: number;
    skip: number;
    error: number;
  };
};

type ParsedRow = Omit<NormalizedImportRow, "status"> & {
  uniqueKey: string;
};

type ExistingRow = {
  uniqueKey: string;
  timeMs: number;
};

export type ExistingMeet = {
  id: string;
  meetDate: string | null;
  metadata: Record<string, unknown> | null;
};

function makeUniqueKey(params: {
  gender: Gender;
  ageMin: number;
  ageMax: number;
  eventCode: string;
}): string {
  return [params.gender, params.ageMin, params.ageMax, params.eventCode].join("|");
}

function buildErrorMessage(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

function parseImportJson(
  input: AdminImportRequest,
): {
  source: z.infer<typeof sourceSchema> | null;
  parsedRows: ParsedRow[];
  errors: ImportError[];
  totalRows: number;
} {
  const errors: ImportError[] = [];

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.jsonText);
  } catch {
    return {
      source: null,
      parsedRows: [],
      errors: [{ rowIndex: null, message: "jsonText is not valid JSON." }],
      totalRows: 0,
    };
  }

  const topLevel = importPayloadSchema.safeParse(parsedJson);
  if (!topLevel.success) {
    return {
      source: null,
      parsedRows: [],
      errors: [{ rowIndex: null, message: buildErrorMessage(topLevel.error.issues) }],
      totalRows: 0,
    };
  }

  const parsedRows: ParsedRow[] = [];
  const seenKeyToFirstIndex = new Map<string, number>();

  for (const [rowIndex, rowValue] of topLevel.data.rows.entries()) {
    const rowResult = importRowSchema.safeParse(rowValue);
    if (!rowResult.success) {
      errors.push({
        rowIndex,
        message: buildErrorMessage(rowResult.error.issues),
      });
      continue;
    }

    const timeMs = parseTimeToMs(rowResult.data.time);
    if (timeMs === null) {
      errors.push({
        rowIndex,
        message:
          "time format is invalid. Allowed formats: 59.87, 1:02.34, 00:29.80, 10:12.34",
      });
      continue;
    }

    const uniqueKey = makeUniqueKey({
      gender: rowResult.data.gender,
      ageMin: rowResult.data.age_min,
      ageMax: rowResult.data.age_max,
      eventCode: rowResult.data.event_code,
    });

    const firstIndex = seenKeyToFirstIndex.get(uniqueKey);
    if (firstIndex !== undefined) {
      errors.push({
        rowIndex,
        message: `duplicate key in rows. first index: ${firstIndex}`,
      });
      continue;
    }

    seenKeyToFirstIndex.set(uniqueKey, rowIndex);

    parsedRows.push({
      rowIndex,
      gender: rowResult.data.gender,
      age_min: rowResult.data.age_min,
      age_max: rowResult.data.age_max,
      event_code: rowResult.data.event_code,
      time: rowResult.data.time,
      time_ms: timeMs,
      uniqueKey,
    });
  }

  return {
    source: topLevel.data.source,
    parsedRows,
    errors,
    totalRows: topLevel.data.rows.length,
  };
}

export async function findExistingMeet(
  input: Pick<AdminImportRequest, "level" | "season" | "course" | "meetName">,
): Promise<ExistingMeet | null> {
  const rows = await db
    .select({
      id: meets.id,
      meetDate: meets.meetDate,
      metadata: meets.metadataJson,
    })
    .from(meets)
    .where(
      and(
        eq(meets.level, input.level),
        eq(meets.season, input.season),
        eq(meets.course, input.course),
        eq(meets.name, input.meetName),
      ),
    )
    .limit(1);

  const found = rows[0];
  if (!found) {
    return null;
  }

  return {
    id: found.id,
    meetDate: found.meetDate,
    metadata: (found.metadata ?? null) as Record<string, unknown> | null,
  };
}

async function findExistingRows(meetId: string): Promise<Map<string, ExistingRow>> {
  const rows = await db
    .select({
      gender: standards.gender,
      ageMin: standards.ageMin,
      ageMax: standards.ageMax,
      eventCode: standards.eventCode,
      timeMs: standards.timeMs,
    })
    .from(standards)
    .where(eq(standards.meetId, meetId));

  const map = new Map<string, ExistingRow>();

  for (const row of rows) {
    const uniqueKey = makeUniqueKey({
      gender: row.gender,
      ageMin: row.ageMin,
      ageMax: row.ageMax,
      eventCode: row.eventCode,
    });

    map.set(uniqueKey, { uniqueKey, timeMs: row.timeMs });
  }

  return map;
}

export function validateAdminImportRequest(input: unknown): AdminImportRequest {
  const parsed = adminImportRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(
      parsed.error.issues.map((issue) => issue.message).join(", "),
    );
  }

  return parsed.data;
}

export async function buildImportPreview(
  input: AdminImportRequest,
): Promise<ImportPreviewResult> {
  const parsed = parseImportJson(input);
  const existingMeet = await findExistingMeet(input);
  const resolvedMeetDate = input.meetDate ?? existingMeet?.meetDate ?? null;

  const meet: ImportPreviewMeet = {
    id: existingMeet?.id ?? null,
    level: input.level,
    season: input.season,
    course: input.course,
    name: input.meetName,
    meet_date: resolvedMeetDate,
    metadata: input.meetMetadata,
    exists: Boolean(existingMeet),
  };

  const counts = {
    total: parsed.totalRows,
    add: 0,
    update: 0,
    skip: 0,
    error: parsed.errors.length,
  };

  if (parsed.parsedRows.length === 0) {
    return {
      meet,
      source: parsed.source,
      normalizedRows: [],
      errors: parsed.errors,
      counts,
    };
  }

  const existingRows = existingMeet ? await findExistingRows(existingMeet.id) : new Map();

  const normalizedRows: NormalizedImportRow[] = parsed.parsedRows.map((row) => {
    const existing = existingRows.get(row.uniqueKey);

    let status: NormalizedImportRow["status"] = "add";
    if (existing) {
      status = existing.timeMs === row.time_ms ? "skip" : "update";
    }

    counts[status] += 1;

    return {
      rowIndex: row.rowIndex,
      gender: row.gender,
      age_min: row.age_min,
      age_max: row.age_max,
      event_code: row.event_code,
      time: formatTimeMs(row.time_ms),
      time_ms: row.time_ms,
      status,
    };
  });

  return {
    meet,
    source: parsed.source,
    normalizedRows,
    errors: parsed.errors,
    counts,
  };
}
