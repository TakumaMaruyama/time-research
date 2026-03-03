import { z } from "zod";

import { courseSchema, EVENT_CODE_REGEX, genderSchema, standardLevelSchema } from "@/lib/domain";
import { BadRequestError } from "@/lib/errors";
import { parseIsoDateOnly } from "@/lib/date";
import { parseTimeToMs } from "@/lib/time";

export const adminRecordsFilterSchema = z.object({
  level: standardLevelSchema,
  season: z.coerce.number().int().min(1900).max(3000).nullable().optional().default(null),
  course: courseSchema,
});

export const adminRecordUpsertSchema = z
  .object({
    gender: genderSchema,
    age_min: z.coerce.number().int().min(0).max(120),
    age_max: z.coerce.number().int().min(0).max(120),
    event_code: z
      .string()
      .trim()
      .regex(
        EVENT_CODE_REGEX,
        "event_code must match /^((FR|BK|BR|FL|IM)_\\d{2,4}|(FRR|MRR)_\\dX\\d{2,4})$/",
      ),
    time: z.string().trim().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.age_min > value.age_max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "age_min must be <= age_max",
        path: ["age_min"],
      });
    }
  });

export const adminMeetUpdateSchema = z
  .object({
    season: z.coerce.number().int().min(1900).max(3000),
    meet_date: z.union([z.string().trim().min(1), z.null()]).optional(),
  })
  .superRefine((value, ctx) => {
    if (typeof value.meet_date === "string" && parseIsoDateOnly(value.meet_date) === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "meet_date must be YYYY-MM-DD.",
        path: ["meet_date"],
      });
    }
  });

export type AdminRecordsFilter = z.infer<typeof adminRecordsFilterSchema>;

export type AdminRecordUpsertInput = z.infer<typeof adminRecordUpsertSchema> & {
  time_ms: number;
};

export type AdminMeetUpdateInput = z.infer<typeof adminMeetUpdateSchema>;

function issuesToMessage(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

export function parseAdminRecordsFilter(input: unknown): AdminRecordsFilter {
  const parsed = adminRecordsFilterSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(issuesToMessage(parsed.error.issues));
  }
  return parsed.data;
}

export function parseAdminRecordUpsertInput(input: unknown): AdminRecordUpsertInput {
  const parsed = adminRecordUpsertSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(issuesToMessage(parsed.error.issues));
  }

  const time_ms = parseTimeToMs(parsed.data.time);
  if (time_ms === null) {
    throw new BadRequestError(
      "time format is invalid. Allowed formats: 59.87, 1:02.34, 00:29.80, 10:12.34",
    );
  }

  return {
    ...parsed.data,
    time_ms,
  };
}

export function parseAdminMeetUpdateInput(input: unknown): AdminMeetUpdateInput {
  const parsed = adminMeetUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(issuesToMessage(parsed.error.issues));
  }
  return parsed.data;
}

export function parseUuid(input: unknown, label: string): string {
  const parsed = z.string().uuid().safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(`${label} must be a valid UUID.`);
  }
  return parsed.data;
}
