import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const standardLevelEnum = pgEnum("standard_level", [
  "national",
  "kyushu",
  "kagoshima",
]);

export const courseEnum = pgEnum("course", ["SCM", "LCM", "ANY"]);

export const genderEnum = pgEnum("gender", ["M", "F"]);

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  url: text("url"),
  pagesJson: jsonb("pages_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const meets = pgTable(
  "meets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    level: standardLevelEnum("level").notNull(),
    season: integer("season").notNull(),
    course: courseEnum("course").notNull(),
    name: text("name").notNull(),
    meetDate: date("meet_date", { mode: "string" }),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("meets_unique_key").on(
      table.level,
      table.season,
      table.course,
      table.name,
    ),
    index("meets_lookup_idx").on(table.season, table.course, table.level),
  ],
);

export const standards = pgTable(
  "standards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetId: uuid("meet_id")
      .notNull()
      .references(() => meets.id, { onDelete: "cascade" }),
    gender: genderEnum("gender").notNull(),
    ageMin: integer("age_min").notNull(),
    ageMax: integer("age_max").notNull(),
    eventCode: text("event_code").notNull(),
    timeMs: integer("time_ms").notNull(),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("standards_unique_key").on(
      table.meetId,
      table.gender,
      table.ageMin,
      table.ageMax,
      table.eventCode,
    ),
    index("standards_meet_gender_idx").on(table.meetId, table.gender),
  ],
);

export type StandardLevel = (typeof standardLevelEnum.enumValues)[number];
export type Course = (typeof courseEnum.enumValues)[number];
export type Gender = (typeof genderEnum.enumValues)[number];
