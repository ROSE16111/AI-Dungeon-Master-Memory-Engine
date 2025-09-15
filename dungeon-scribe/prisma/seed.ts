// prisma/seed.ts (ESM) — uses string literals for enums and no skipDuplicates

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function maybeImageDataURL(p: string | undefined) {
  if (!p) return undefined;
  try {
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      const ext = path.extname(p).slice(1) || 'png';
      return `data:image/${ext};base64,${buf.toString('base64')}`;
    }
  } catch {}
  return undefined;
}

async function main() {
  const sessionImgPath = path.join(__dirname, '../public/summary.png');
  const characterImgPath = path.join(__dirname, '../public/summary.png');
  const sessionBase64 = maybeImageDataURL(sessionImgPath);
  const characterBase64 = maybeImageDataURL(characterImgPath);

  // ---------- Campaign ----------
  const campaign = await prisma.campaign.upsert({
    where: { id: 'cmp1' },
    update: {},
    create: {
      id: 'cmp1',
      title: 'The Shadow Forest',
      startDate: new Date('2025-08-01T10:00:00Z'),
    },
  });

  // ---------- Characters (Role) ----------
  const ranger = await prisma.role.upsert({
    where: { id: 'r1' },
    update: {},
    create: { id: 'r1', name: 'Thalion the Ranger', level: 5, campaignId: campaign.id },
  });

  const mage = await prisma.role.upsert({
    where: { id: 'r2' },
    update: {},
    create: { id: 'r2', name: 'Elaria the Sorceress', level: 7, campaignId: campaign.id },
  });

  // Alias example
  await prisma.alias.upsert({
    where: { id: 'a1' },
    update: {},
    create: {
      id: 'a1',
      characterId: ranger.id,
      campaignId: campaign.id,
      alias: 'Thal',
    },
  });

  // ---------- Locations ----------
  const city = await prisma.location.upsert({
    where: { id: 'loc-city' },
    update: {},
    create: {
      id: 'loc-city',
      name: 'Greenvale',
      kind: 'CITY', // LocationKind
      campaignId: campaign.id,
    },
  });

  const ruins = await prisma.location.upsert({
    where: { id: 'loc-ruins' },
    update: {},
    create: {
      id: 'loc-ruins',
      name: 'Vine-Covered Ruins',
      kind: 'DUNGEON', // LocationKind
      campaignId: campaign.id,
      parentLocationId: city.id,
    },
  });

  // ---------- Session ----------
  const session1 = await prisma.session.upsert({
    where: { id: 'sess1' },
    update: {},
    create: {
      id: 'sess1',
      campaignId: campaign.id,
      sessionNumber: 1,
      title: 'Session 1 — Into the Forest',
      date: new Date('2025-08-05T09:00:00Z'),
      summary:
        'The party left Greenvale, entered the Shadow Forest, and discovered vine-covered ruins.',
      primaryLocationId: ruins.id,
    },
  });

  // Attendance
  await prisma.sessionParticipant.upsert({
    where: { id: 'att1' },
    update: {},
    create: {
      id: 'att1',
      sessionId: session1.id,
      roleId: ranger.id,
      presence: 'PRESENT', // PresenceStatus
      joinedAt: new Date('2025-08-05T09:05:00Z'),
    },
  });

  await prisma.sessionParticipant.upsert({
    where: { id: 'att2' },
    update: {},
    create: {
      id: 'att2',
      sessionId: session1.id,
      roleId: mage.id,
      presence: 'PRESENT', // PresenceStatus
      joinedAt: new Date('2025-08-05T09:07:00Z'),
    },
  });

  // ---------- Transcript (AllTxt + Spans) ----------
  const txt1 = await prisma.allTxt.upsert({
    where: { id: 'txt1' },
    update: {},
    create: {
      id: 'txt1',
      content:
        '[09:05] Thalion: I see a hidden trail leading deeper.\n[09:10] Elaria: The vines react to magic—careful.\n[09:20] Thalion: Found an ancient key in the altar.',
      campaignId: campaign.id,
      createdAt: new Date('2025-08-05T09:30:00Z'),
      sessionId: session1.id,
    },
  });

  const span1 = await prisma.transcriptSpan.upsert({
    where: { id: 'span1' },
    update: {},
    create: {
      id: 'span1',
      spanId: 'span-txt1-0000-08000',
      allTxtId: txt1.id,
      speaker: 'Thalion the Ranger',
      startMs: 0,
      endMs: 8000,
      text: 'I see a hidden trail leading deeper.',
    },
  });

  const span2 = await prisma.transcriptSpan.upsert({
    where: { id: 'span2' },
    update: {},
    create: {
      id: 'span2',
      spanId: 'span-txt1-20000-26000',
      allTxtId: txt1.id,
      speaker: 'Thalion the Ranger',
      startMs: 20000,
      endMs: 26000,
      text: 'Found an ancient key in the altar.',
    },
  });

  // ---------- Items ----------
  const keyItem = await prisma.item.upsert({
    where: { id: 'item-key' },
    update: {},
    create: {
      id: 'item-key',
      name: 'Ancient Key',
      kind: 'KEY', // ItemKind
      notes: 'Bronze key with a leaf motif',
      campaignId: campaign.id,
    },
  });

  // ---------- Events (with provenance) ----------
  const eventTravel = await prisma.event.upsert({
    where: { id: 'ev-travel-1' },
    update: {},
    create: {
      id: 'ev-travel-1',
      type: 'TRAVEL_TO', // EventType
      occurredAt: new Date('2025-08-05T09:15:00Z'),
      summary: 'The party advances along a hidden trail toward the ruins.',
      campaignId: campaign.id,
      locationId: ruins.id,
      sessionId: session1.id,
    },
  });

  const eventAcquire = await prisma.event.upsert({
    where: { id: 'ev-acquire-key-1' },
    update: {},
    create: {
      id: 'ev-acquire-key-1',
      type: 'ACQUIRE_ITEM', // EventType
      occurredAt: new Date('2025-08-05T09:22:00Z'),
      summary: 'Thalion retrieves an ancient key from the altar.',
      campaignId: campaign.id,
      locationId: ruins.id,
      sessionId: session1.id,
    },
  });

  // Link events to transcript spans (idempotent upserts for composite PK)
  await prisma.eventSpan.upsert({
    where: {
      eventId_transcriptSpanId: { eventId: eventTravel.id, transcriptSpanId: span1.id },
    },
    update: {},
    create: { eventId: eventTravel.id, transcriptSpanId: span1.id },
  });
  await prisma.eventSpan.upsert({
    where: {
      eventId_transcriptSpanId: { eventId: eventAcquire.id, transcriptSpanId: span2.id },
    },
    update: {},
    create: { eventId: eventAcquire.id, transcriptSpanId: span2.id },
  });

  // ---------- Possession (current inventory) ----------
  await prisma.possession.upsert({
    where: { id: 'pos-1' },
    update: {},
    create: {
      id: 'pos-1',
      characterId: ranger.id,
      itemId: keyItem.id,
      campaignId: campaign.id,
      startAt: new Date('2025-08-05T09:22:00Z'),
      startEventId: eventAcquire.id,
      // endAt: null => currently owned
    },
  });

  // ---------- Stat snapshot ----------
  await prisma.statSnapshot.upsert({
    where: { id: 'stat1' },
    update: {},
    create: {
      id: 'stat1',
      characterId: mage.id,
      campaignId: campaign.id,
      statType: 'INT', // StatType
      value: 14,
      effectiveAt: new Date('2025-08-05T09:05:00Z'),
      sourceEventId: eventTravel.id, // provenance example
    },
  });

  // ---------- Summaries ----------
  await prisma.summary.upsert({
    where: { id: 'sum-session-1' },
    update: {},
    create: {
      id: 'sum-session-1',
      type: 'session', // SummaryType
      content:
        'Session 1 recap: The party left Greenvale, followed a hidden path, and found an ancient key in the forest ruins.',
      campaignId: campaign.id,
      createdAt: new Date('2025-08-05T12:00:00Z'),
      imageBase64: sessionBase64,
    },
  });

  await prisma.summary.upsert({
    where: { id: 'sum-char-elar1' },
    update: {},
    create: {
      id: 'sum-char-elar1',
      type: 'character', // SummaryType
      content: 'Elaria supported with arcane insight; current INT recorded as 14.',
      roleName: mage.name,
      campaignId: campaign.id,
      createdAt: new Date('2025-08-05T12:30:00Z'),
      imageBase64: characterBase64,
    },
  });

  console.log('✅ Seed completed for campaign:', campaign.title);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
