import { z } from "zod";

export const STANDARD_LEVELS = ["national", "kyushu", "kagoshima"] as const;
export const COURSES = ["SCM", "LCM", "ANY"] as const;
export const GENDERS = ["M", "F"] as const;

export const standardLevelSchema = z.enum(STANDARD_LEVELS);
export const courseSchema = z.enum(COURSES);
export const genderSchema = z.enum(GENDERS);

export type StandardLevel = (typeof STANDARD_LEVELS)[number];
export type Course = (typeof COURSES)[number];
export type Gender = (typeof GENDERS)[number];

export const EVENT_CODE_REGEX =
  /^((FR|BK|BR|FL|IM)_\d{2,4}|(FRR|MRR)_\dX\d{2,4})$/;
