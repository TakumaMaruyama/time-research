import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { getCurrentDatePartsInTimeZone, toIsoDateString } from "@/lib/date";

export const CHEER_COOKIE_NAME = "cheer_user_id";
export const CHEER_TIME_ZONE = "Asia/Tokyo";

const CHEER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export type ResolvedCheerUser = {
  userId: string;
  shouldSetCookie: boolean;
};

export function resolveCheerUserId(cookieValue: string | undefined): ResolvedCheerUser {
  const normalized = cookieValue?.trim();
  if (normalized) {
    return { userId: normalized, shouldSetCookie: false };
  }

  return {
    userId: crypto.randomUUID(),
    shouldSetCookie: true,
  };
}

export function hashCheerUserId(userId: string): string {
  return crypto.createHash("sha256").update(userId).digest("hex");
}

export function getTodayIsoInCheerTimeZone(): string {
  const parts = getCurrentDatePartsInTimeZone(CHEER_TIME_ZONE);
  return toIsoDateString(parts);
}

function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.toLowerCase().includes("https");
  }
  return request.nextUrl.protocol === "https:";
}

export function setCheerUserCookie(
  response: NextResponse,
  request: NextRequest,
  userId: string,
): void {
  response.cookies.set({
    name: CHEER_COOKIE_NAME,
    value: userId,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: CHEER_COOKIE_MAX_AGE_SECONDS,
  });
}
