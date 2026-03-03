import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { meets, sources, standards } from "@/db/schema";
import { isAdminRequest } from "@/lib/admin-auth";
import { BadRequestError } from "@/lib/errors";
import { buildImportPreview, validateAdminImportRequest } from "@/lib/import-service";

export async function POST(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const input = validateAdminImportRequest(body);
    const preview = await buildImportPreview(input);

    if (!preview.source) {
      return NextResponse.json(
        {
          error: "source information is invalid.",
          errors: preview.errors,
          counts: preview.counts,
        },
        { status: 400 },
      );
    }

    const rowsToWrite = preview.normalizedRows.filter((row) => row.status !== "skip");

    let meetId: string | null = null;
    let sourceId: string | null = null;

    await db.transaction(async (tx) => {
      const upsertedMeet = await tx
        .insert(meets)
        .values({
          level: input.level,
          season: input.season,
          course: input.course,
          name: input.meetName,
          meetDate: preview.meet.meet_date,
          meetEndDate: preview.meet.meet_date_end,
          metadataJson: input.meetMetadata,
        })
        .onConflictDoUpdate({
          target: [meets.level, meets.season, meets.course, meets.name],
          set: {
            meetDate: preview.meet.meet_date,
            meetEndDate: preview.meet.meet_date_end,
            metadataJson: input.meetMetadata,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: meets.id });

      meetId = upsertedMeet[0]?.id ?? null;
      if (!meetId) {
        throw new Error("Failed to upsert meet.");
      }
      const ensuredMeetId = meetId;

      const insertedSource = await tx
        .insert(sources)
        .values({
          title: preview.source!.title,
          url: preview.source!.url,
          pagesJson: preview.source!.pages,
        })
        .returning({ id: sources.id });

      sourceId = insertedSource[0]?.id ?? null;

      if (rowsToWrite.length > 0) {
        await tx
          .insert(standards)
          .values(
            rowsToWrite.map((row) => ({
              meetId: ensuredMeetId,
              gender: row.gender,
              ageMin: row.age_min,
              ageMax: row.age_max,
              eventCode: row.event_code,
              timeMs: row.time_ms,
              sourceId,
            })),
          )
          .onConflictDoUpdate({
            target: [
              standards.meetId,
              standards.gender,
              standards.ageMin,
              standards.ageMax,
              standards.eventCode,
            ],
            set: {
              timeMs: sql`excluded.time_ms`,
              sourceId,
              updatedAt: sql`now()`,
            },
          });
      }
    });

    return NextResponse.json({
      meetId,
      counts: preview.counts,
      errors: preview.errors,
      sourceId,
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof BadRequestError) {
      return NextResponse.json(
        { error: error.message || "Invalid request body." },
        { status: 400 },
      );
    }

    console.error(error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
