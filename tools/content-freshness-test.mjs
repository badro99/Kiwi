#!/usr/bin/env node

import { PUBLISHED_LOCALES, TOPICS } from '../content/guides/manifest.mjs';

const strictArg = process.argv.find((arg) => arg.startsWith('--max-age-days='));
const maxAgeDays = strictArg ? Number(strictArg.split('=')[1]) : null;
const now = new Date(process.env.KIWI_CONTENT_NOW || Date.now());
const projectTimeZone = 'Europe/Berlin';
const maxFutureSkewMs = 5 * 60_000;
const failures = [];
let reviewedPages = 0;

const dateToDayNumber = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  const dayNumber = Date.UTC(year, month - 1, day);
  return new Date(dayNumber).toISOString().slice(0, 10) === value ? dayNumber : null;
};

const zonedDate = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

if (strictArg && (!Number.isInteger(maxAgeDays) || maxAgeDays < 1)) {
  failures.push('--max-age-days must be a positive integer');
}
if (Number.isNaN(now.getTime())) failures.push('KIWI_CONTENT_NOW must be a valid date when supplied');
const currentDay = Number.isNaN(now.getTime()) ? null : dateToDayNumber(zonedDate(now, projectTimeZone));

for (const topic of TOPICS) {
  const reviewDates = new Set();
  for (const locale of PUBLISHED_LOCALES) {
    const page = topic.pages[locale];
    const reviewDate = page.legalReviewDate;
    if (topic.legalReviewRequired && !reviewDate) {
      failures.push(`${topic.id}/${locale} has legal claims but no legalReviewDate`);
      continue;
    }
    if (!reviewDate) continue;

    reviewedPages += 1;
    reviewDates.add(reviewDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
      failures.push(`${topic.id}/${locale} has an invalid legalReviewDate: ${reviewDate}`);
      continue;
    }

    const reviewedDay = dateToDayNumber(reviewDate);
    const modifiedAt = new Date(page.dateModified);
    if (reviewedDay === null) failures.push(`${topic.id}/${locale} has an impossible legalReviewDate`);
    if (Number.isNaN(modifiedAt.getTime()) || page.dateModified.slice(0, 10) < reviewDate) {
      failures.push(`${topic.id}/${locale} dateModified predates its legal review`);
    } else if (modifiedAt.getTime() > now.getTime() + maxFutureSkewMs) {
      failures.push(`${topic.id}/${locale} dateModified is in the future`);
    }

    if (maxAgeDays && reviewedDay !== null && currentDay !== null) {
      const ageDays = Math.floor((currentDay - reviewedDay) / 86_400_000);
      if (ageDays < 0) failures.push(`${topic.id}/${locale} legal review is dated in the future`);
      if (ageDays > maxAgeDays) failures.push(`${topic.id}/${locale} legal review is ${ageDays} days old (limit ${maxAgeDays})`);
    }
  }
  if (topic.legalReviewRequired && reviewDates.size !== 1) {
    failures.push(`${topic.id} locales do not share one legal review date`);
  }
}

if (failures.length) {
  console.error(`\n  ✗ content freshness · ${failures.length} failure(s)`);
  failures.forEach((failure) => console.error('     · ' + failure));
  process.exit(1);
}

const suffix = maxAgeDays ? `, all within ${maxAgeDays} days` : ', dates and locale parity valid';
console.log(`  ✓ content freshness (${reviewedPages} legally reviewed pages${suffix})`);
