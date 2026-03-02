import { EVENT_CODE_REGEX } from "@/lib/domain";

type ParsedEventCode = {
  stroke: "FR" | "BK" | "BR" | "FL" | "IM";
  distance: number;
};

const STROKE_LABELS: Record<ParsedEventCode["stroke"], string> = {
  FR: "自由形",
  BK: "背泳ぎ",
  BR: "平泳ぎ",
  FL: "バタフライ",
  IM: "個人メドレー",
};

const STROKE_ORDER: Record<ParsedEventCode["stroke"], number> = {
  FR: 0,
  BK: 1,
  BR: 2,
  FL: 3,
  IM: 4,
};

export function parseEventCode(eventCode: string): ParsedEventCode | null {
  if (!EVENT_CODE_REGEX.test(eventCode)) {
    return null;
  }

  const [stroke, distanceText] = eventCode.split("_");
  const distance = Number.parseInt(distanceText, 10);

  if (!Number.isFinite(distance)) {
    return null;
  }

  return {
    stroke: stroke as ParsedEventCode["stroke"],
    distance,
  };
}

export function compareEventCode(a: string, b: string): number {
  const parsedA = parseEventCode(a);
  const parsedB = parseEventCode(b);

  if (parsedA && parsedB) {
    const strokeComparison = STROKE_ORDER[parsedA.stroke] - STROKE_ORDER[parsedB.stroke];
    if (strokeComparison !== 0) {
      return strokeComparison;
    }

    const distanceComparison = parsedA.distance - parsedB.distance;
    if (distanceComparison !== 0) {
      return distanceComparison;
    }
  }

  return a.localeCompare(b);
}

export function formatEventCodeLabel(eventCode: string): string {
  const parsed = parseEventCode(eventCode);
  if (!parsed) {
    return eventCode;
  }

  return `${parsed.distance}m${STROKE_LABELS[parsed.stroke]}`;
}
