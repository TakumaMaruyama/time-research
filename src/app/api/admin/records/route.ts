import { and, asc, count, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { meets, standards } from "@/db/schema";
import { isAdminRequest } from "@/lib/admin-auth";
import { parseAdminRecordsFilter } from "@/lib/admin-records-service";
import { BadRequestError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const filter = parseAdminRecordsFilter({
      level: request.nextUrl.searchParams.get("level"),
      season: request.nextUrl.searchParams.get("season"),
      course: request.nextUrl.searchParams.get("course"),
    });

    const whereClause = and(
      eq(meets.level, filter.level),
      filter.season === null ? undefined : eq(meets.season, filter.season),
      filter.course === null || filter.course === "ANY"
        ? undefined
        : eq(meets.course, filter.course),
    );

    try {
      const rows = await db
        .select({
          id: meets.id,
          name: meets.name,
          season: meets.season,
          course: meets.course,
          meetDate: meets.meetDate,
          meetDateEnd: meets.meetEndDate,
          metadata: meets.metadataJson,
          updatedAt: meets.updatedAt,
          rowCount: count(standards.id),
        })
        .from(meets)
        .leftJoin(standards, eq(standards.meetId, meets.id))
        .where(whereClause)
        .groupBy(meets.id)
        .orderBy(asc(meets.season), asc(meets.name), asc(meets.course));

      return NextResponse.json({
        meets: rows.map((row) => ({
          id: row.id,
          name: row.name,
          season: row.season,
          course: row.course,
          meet_date: row.meetDate,
          meet_date_end: row.meetDateEnd,
          metadata: (row.metadata ?? null) as Record<string, unknown> | null,
          updated_at: row.updatedAt.toISOString(),
          row_count: Number(row.rowCount),
        })),
      });
    } catch (error) {
      const maybeError = error as { code?: string; message?: string };
      const isMissingMeetEndDateColumn =
        maybeError.code === "42703" &&
        typeof maybeError.message === "string" &&
        maybeError.message.includes("meet_end_date");

      if (!isMissingMeetEndDateColumn) {
        throw error;
      }

      // Backward compatibility for DBs before migration 0005.
      const rows = await db
        .select({
          id: meets.id,
          name: meets.name,
          season: meets.season,
          course: meets.course,
          meetDate: meets.meetDate,
          metadata: meets.metadataJson,
          updatedAt: meets.updatedAt,
          rowCount: count(standards.id),
        })
        .from(meets)
        .leftJoin(standards, eq(standards.meetId, meets.id))
        .where(whereClause)
        .groupBy(meets.id)
        .orderBy(asc(meets.season), asc(meets.name), asc(meets.course));

      return NextResponse.json({
        meets: rows.map((row) => ({
          id: row.id,
          name: row.name,
          season: row.season,
          course: row.course,
          meet_date: row.meetDate,
          meet_date_end: null,
          metadata: (row.metadata ?? null) as Record<string, unknown> | null,
          updated_at: row.updatedAt.toISOString(),
          row_count: Number(row.rowCount),
        })),
      });
    }
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
