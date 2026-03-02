import { asc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { meets, standards } from "@/db/schema";
import { isAdminRequest } from "@/lib/admin-auth";
import { parseAdminRecordUpsertInput, parseUuid } from "@/lib/admin-records-service";
import { BadRequestError } from "@/lib/errors";
import { formatTimeMs } from "@/lib/time";

type RouteContext = {
  params: Promise<{ meetId: string }>;
};

async function findMeet(meetId: string) {
  const rows = await db
    .select({
      id: meets.id,
      level: meets.level,
      season: meets.season,
      course: meets.course,
      name: meets.name,
      meetDate: meets.meetDate,
      metadata: meets.metadataJson,
      updatedAt: meets.updatedAt,
    })
    .from(meets)
    .where(eq(meets.id, meetId))
    .limit(1);

  return rows[0] ?? null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const params = await context.params;
    const meetId = parseUuid(params.meetId, "meetId");

    const meet = await findMeet(meetId);
    if (!meet) {
      return NextResponse.json({ error: "Meet not found." }, { status: 404 });
    }

    const rows = await db
      .select({
        id: standards.id,
        gender: standards.gender,
        ageMin: standards.ageMin,
        ageMax: standards.ageMax,
        eventCode: standards.eventCode,
        timeMs: standards.timeMs,
        sourceId: standards.sourceId,
        updatedAt: standards.updatedAt,
      })
      .from(standards)
      .where(eq(standards.meetId, meetId))
      .orderBy(
        asc(standards.gender),
        asc(standards.ageMin),
        asc(standards.ageMax),
        asc(standards.eventCode),
      );

    return NextResponse.json({
      meet: {
        id: meet.id,
        level: meet.level,
        season: meet.season,
        course: meet.course,
        name: meet.name,
        meet_date: meet.meetDate,
        metadata: (meet.metadata ?? null) as Record<string, unknown> | null,
        updated_at: meet.updatedAt.toISOString(),
      },
      records: rows.map((row) => ({
        id: row.id,
        gender: row.gender,
        age_min: row.ageMin,
        age_max: row.ageMax,
        event_code: row.eventCode,
        time: formatTimeMs(row.timeMs),
        time_ms: row.timeMs,
        source_id: row.sourceId,
        updated_at: row.updatedAt.toISOString(),
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

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const params = await context.params;
    const meetId = parseUuid(params.meetId, "meetId");

    const body = await request.json();
    const input = parseAdminRecordUpsertInput(body);

    const meet = await findMeet(meetId);
    if (!meet) {
      return NextResponse.json({ error: "Meet not found." }, { status: 404 });
    }

    const inserted = await db
      .insert(standards)
      .values({
        meetId,
        gender: input.gender,
        ageMin: input.age_min,
        ageMax: input.age_max,
        eventCode: input.event_code,
        timeMs: input.time_ms,
      })
      .onConflictDoUpdate({
        target: [
          standards.meetId,
          standards.gender,
          standards.ageMin,
          standards.ageMax,
          standards.eventCode,
        ],
        set: {
          timeMs: input.time_ms,
        },
      })
      .returning({
        id: standards.id,
        gender: standards.gender,
        ageMin: standards.ageMin,
        ageMax: standards.ageMax,
        eventCode: standards.eventCode,
        timeMs: standards.timeMs,
      });

    const saved = inserted[0];

    return NextResponse.json({
      record: {
        id: saved.id,
        gender: saved.gender,
        age_min: saved.ageMin,
        age_max: saved.ageMax,
        event_code: saved.eventCode,
        time: formatTimeMs(saved.timeMs),
        time_ms: saved.timeMs,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
