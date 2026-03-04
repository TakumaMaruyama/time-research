import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { cheerClicks } from "@/db/schema";
import {
  CHEER_COOKIE_NAME,
  getTodayIsoInCheerTimeZone,
  hashCheerUserId,
  resolveCheerUserId,
  setCheerUserCookie,
} from "@/lib/cheer";

export const dynamic = "force-dynamic";

type CheerStatusResponse = {
  totalCount: number;
  canCheer: boolean;
  today: string;
};

type CheerPostResponse = CheerStatusResponse & {
  accepted: boolean;
};

function toNonNegativeCount(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

async function getTotalCheerCount(): Promise<number> {
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(cheerClicks);

  return toNonNegativeCount(rows[0]?.count);
}

async function hasCheeredOnDate(userHash: string, cheerDate: string): Promise<boolean> {
  const rows = await db
    .select({ id: cheerClicks.id })
    .from(cheerClicks)
    .where(and(eq(cheerClicks.userHash, userHash), eq(cheerClicks.cheerDate, cheerDate)))
    .limit(1);

  return rows.length > 0;
}

function buildJsonResponse<T extends Record<string, unknown>>(body: T, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const resolvedUser = resolveCheerUserId(request.cookies.get(CHEER_COOKIE_NAME)?.value);
  const userHash = hashCheerUserId(resolvedUser.userId);
  const today = getTodayIsoInCheerTimeZone();

  try {
    const [totalCount, alreadyCheeredToday] = await Promise.all([
      getTotalCheerCount(),
      hasCheeredOnDate(userHash, today),
    ]);

    const response = buildJsonResponse<CheerStatusResponse>({
      totalCount,
      canCheer: !alreadyCheeredToday,
      today,
    });

    if (resolvedUser.shouldSetCookie) {
      setCheerUserCookie(response, request, resolvedUser.userId);
    }

    return response;
  } catch (error) {
    console.error(error);
    return buildJsonResponse({ error: "Internal server error." }, 500);
  }
}

export async function POST(request: NextRequest) {
  const resolvedUser = resolveCheerUserId(request.cookies.get(CHEER_COOKIE_NAME)?.value);
  const userHash = hashCheerUserId(resolvedUser.userId);
  const today = getTodayIsoInCheerTimeZone();

  try {
    const inserted = await db
      .insert(cheerClicks)
      .values({
        userHash,
        cheerDate: today,
      })
      .onConflictDoNothing({
        target: [cheerClicks.userHash, cheerClicks.cheerDate],
      })
      .returning({ id: cheerClicks.id });

    const totalCount = await getTotalCheerCount();

    const response = buildJsonResponse<CheerPostResponse>({
      accepted: inserted.length > 0,
      totalCount,
      canCheer: false,
      today,
    });

    if (resolvedUser.shouldSetCookie) {
      setCheerUserCookie(response, request, resolvedUser.userId);
    }

    return response;
  } catch (error) {
    console.error(error);
    return buildJsonResponse({ error: "Internal server error." }, 500);
  }
}
