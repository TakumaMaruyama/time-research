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

    const rows = await db
      .select({
        id: meets.id,
        name: meets.name,
        course: meets.course,
        meetDate: meets.meetDate,
        metadata: meets.metadataJson,
        updatedAt: meets.updatedAt,
        rowCount: count(standards.id),
      })
      .from(meets)
      .leftJoin(standards, eq(standards.meetId, meets.id))
      .where(
        filter.course === "ANY"
          ? and(eq(meets.level, filter.level), eq(meets.season, filter.season))
          : and(
              eq(meets.level, filter.level),
              eq(meets.season, filter.season),
              eq(meets.course, filter.course),
            ),
      )
      .groupBy(meets.id)
      .orderBy(asc(meets.name), asc(meets.course));

    return NextResponse.json({
      meets: rows.map((row) => ({
        id: row.id,
        name: row.name,
        course: row.course,
        meet_date: row.meetDate,
        metadata: (row.metadata ?? null) as Record<string, unknown> | null,
        updated_at: row.updatedAt.toISOString(),
        row_count: Number(row.rowCount),
      })),
    });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
