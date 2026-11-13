import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const events=sqliteTable('events',{
  id:text('id').primaryKey(),
  family:text('family').notNull(),
  title:text('title').notNull(),
  kind:text('kind').notNull(),
  icon:text('icon').notNull(),
  start:text('start').notNull(),
  end:text('end').notNull(),
  calendarType:text('calendar_type').notNull().default('solar'),
  lunarStart:text('lunar_start').notNull().default(''),
  color:text('color').notNull().default(''),
  note:text('note').notNull().default(''),
  revision:integer('revision').notNull().default(1),
  updatedAt:text('updated_at').notNull(),
},table=>[index('events_family_dates').on(table.family,table.start,table.end)]);
