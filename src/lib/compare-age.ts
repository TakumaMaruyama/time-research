export const COMPARE_AGE_OPTIONS = [9, 10, 11, 12, 13, 14, 15, 16, 17] as const;
export const COMPARE_AGE_MIN = 9;
export const COMPARE_AGE_MAX_BUCKET = 17;

export type CompareAgeOption = (typeof COMPARE_AGE_OPTIONS)[number];

export function normalizeCompareAges(input: number[]): number[] {
  return [...new Set(input)]
    .map((value) => Number.parseInt(String(value), 10))
    .filter(
      (value) =>
        Number.isInteger(value) &&
        value >= COMPARE_AGE_MIN &&
        value <= COMPARE_AGE_MAX_BUCKET,
    )
    .sort((a, b) => a - b);
}

export function toCompareAgeBucket(age: number): number {
  if (age <= COMPARE_AGE_MIN) {
    return COMPARE_AGE_MIN;
  }
  if (age >= COMPARE_AGE_MAX_BUCKET) {
    return COMPARE_AGE_MAX_BUCKET;
  }
  return age;
}

export function formatCompareAgeLabel(age: number): string {
  if (age <= COMPARE_AGE_MIN) {
    return `${COMPARE_AGE_MIN}歳以下`;
  }
  if (age >= COMPARE_AGE_MAX_BUCKET) {
    return `${COMPARE_AGE_MAX_BUCKET}歳以上`;
  }
  return `${age}歳`;
}
