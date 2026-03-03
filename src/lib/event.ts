import { EVENT_CODE_REGEX } from "@/lib/domain";

type ParsedIndividualEventCode = {
  kind: "individual";
  stroke: "FR" | "BK" | "BR" | "FL" | "IM";
  distance: number;
};

type ParsedRelayEventCode = {
  kind: "relay";
  stroke: "FRR" | "MRR";
  relayCount: number;
  distance: number;
};

type ParsedEventCode = ParsedIndividualEventCode | ParsedRelayEventCode;

const STROKE_LABELS: Record<ParsedIndividualEventCode["stroke"], string> = {
  FR: "自由形",
  BK: "背泳ぎ",
  BR: "平泳ぎ",
  FL: "バタフライ",
  IM: "個人メドレー",
};

const RELAY_LABELS: Record<ParsedRelayEventCode["stroke"], string> = {
  FRR: "フリーリレー",
  MRR: "メドレーリレー",
};

const STROKE_ORDER: Record<ParsedIndividualEventCode["stroke"], number> = {
  FR: 0,
  BK: 1,
  BR: 2,
  FL: 3,
  IM: 4,
};

const RELAY_ORDER: Record<ParsedRelayEventCode["stroke"], number> = {
  FRR: 5,
  MRR: 6,
};

function parseRelayDistance(distanceText: string): { relayCount: number; distance: number } | null {
  const [relayCountText, distancePart] = distanceText.split("X");
  const relayCount = Number.parseInt(relayCountText, 10);
  const distance = Number.parseInt(distancePart, 10);

  if (!Number.isFinite(relayCount) || !Number.isFinite(distance)) {
    return null;
  }

  return { relayCount, distance };
}

export function parseEventCode(eventCode: string): ParsedEventCode | null {
  if (!EVENT_CODE_REGEX.test(eventCode)) {
    return null;
  }

  const [stroke, distanceText] = eventCode.split("_");

  if (stroke === "FRR" || stroke === "MRR") {
    const parsedRelay = parseRelayDistance(distanceText);
    if (!parsedRelay) {
      return null;
    }
    return {
      kind: "relay",
      stroke,
      relayCount: parsedRelay.relayCount,
      distance: parsedRelay.distance,
    };
  }

  const distance = Number.parseInt(distanceText, 10);
  if (!Number.isFinite(distance)) {
    return null;
  }

  return {
    kind: "individual",
    stroke: stroke as ParsedIndividualEventCode["stroke"],
    distance,
  };
}

export function compareEventCode(a: string, b: string): number {
  const parsedA = parseEventCode(a);
  const parsedB = parseEventCode(b);

  if (parsedA && parsedB) {
    const orderA = parsedA.kind === "individual" ? STROKE_ORDER[parsedA.stroke] : RELAY_ORDER[parsedA.stroke];
    const orderB = parsedB.kind === "individual" ? STROKE_ORDER[parsedB.stroke] : RELAY_ORDER[parsedB.stroke];
    const strokeComparison = orderA - orderB;
    if (strokeComparison !== 0) {
      return strokeComparison;
    }

    if (parsedA.kind === "relay" && parsedB.kind === "relay") {
      const relayCountComparison = parsedA.relayCount - parsedB.relayCount;
      if (relayCountComparison !== 0) {
        return relayCountComparison;
      }
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

  if (parsed.kind === "relay") {
    return `${parsed.relayCount}×${parsed.distance}m${RELAY_LABELS[parsed.stroke]}`;
  }

  return `${parsed.distance}m${STROKE_LABELS[parsed.stroke]}`;
}
