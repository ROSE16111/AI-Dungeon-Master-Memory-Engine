-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT,
    "notes" TEXT,
    "primaryLocationId" TEXT,
    CONSTRAINT "Session_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Session_primaryLocationId_fkey" FOREIGN KEY ("primaryLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "presence" TEXT NOT NULL DEFAULT 'PRESENT',
    "joinedAt" DATETIME,
    "leftAt" DATETIME,
    "notes" TEXT,
    CONSTRAINT "SessionParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SessionParticipant_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "notes" TEXT,
    "campaignId" TEXT NOT NULL,
    CONSTRAINT "Item_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "campaignId" TEXT NOT NULL,
    "parentLocationId" TEXT,
    CONSTRAINT "Location_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Location_parentLocationId_fkey" FOREIGN KEY ("parentLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT,
    "campaignId" TEXT NOT NULL,
    "locationId" TEXT,
    "sessionId" TEXT,
    CONSTRAINT "Event_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranscriptSpan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spanId" TEXT NOT NULL,
    "allTxtId" TEXT NOT NULL,
    "speaker" TEXT,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "TranscriptSpan_allTxtId_fkey" FOREIGN KEY ("allTxtId") REFERENCES "AllTxt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventSpan" (
    "eventId" TEXT NOT NULL,
    "transcriptSpanId" TEXT NOT NULL,

    PRIMARY KEY ("eventId", "transcriptSpanId"),
    CONSTRAINT "EventSpan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventSpan_transcriptSpanId_fkey" FOREIGN KEY ("transcriptSpanId") REFERENCES "TranscriptSpan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Possession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" DATETIME,
    "startEventId" TEXT,
    "endEventId" TEXT,
    "campaignId" TEXT NOT NULL,
    CONSTRAINT "Possession_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Possession_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Possession_startEventId_fkey" FOREIGN KEY ("startEventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Possession_endEventId_fkey" FOREIGN KEY ("endEventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Possession_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "statType" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "effectiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceEventId" TEXT,
    "campaignId" TEXT NOT NULL,
    CONSTRAINT "StatSnapshot_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StatSnapshot_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StatSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    CONSTRAINT "Alias_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Alias_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AllTxt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT,
    CONSTRAINT "AllTxt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AllTxt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AllTxt" ("campaignId", "content", "createdAt", "id") SELECT "campaignId", "content", "createdAt", "id" FROM "AllTxt";
DROP TABLE "AllTxt";
ALTER TABLE "new_AllTxt" RENAME TO "AllTxt";
CREATE INDEX "AllTxt_sessionId_idx" ON "AllTxt"("sessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Session_campaignId_date_idx" ON "Session"("campaignId", "date");

-- CreateIndex
CREATE INDEX "Session_primaryLocationId_idx" ON "Session"("primaryLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_campaignId_sessionNumber_key" ON "Session"("campaignId", "sessionNumber");

-- CreateIndex
CREATE INDEX "SessionParticipant_roleId_idx" ON "SessionParticipant"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionParticipant_sessionId_roleId_key" ON "SessionParticipant"("sessionId", "roleId");

-- CreateIndex
CREATE INDEX "Item_campaignId_name_idx" ON "Item"("campaignId", "name");

-- CreateIndex
CREATE INDEX "Location_campaignId_name_idx" ON "Location"("campaignId", "name");

-- CreateIndex
CREATE INDEX "Location_parentLocationId_idx" ON "Location"("parentLocationId");

-- CreateIndex
CREATE INDEX "Event_campaignId_occurredAt_idx" ON "Event"("campaignId", "occurredAt");

-- CreateIndex
CREATE INDEX "Event_locationId_occurredAt_idx" ON "Event"("locationId", "occurredAt");

-- CreateIndex
CREATE INDEX "Event_sessionId_occurredAt_idx" ON "Event"("sessionId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptSpan_spanId_key" ON "TranscriptSpan"("spanId");

-- CreateIndex
CREATE INDEX "TranscriptSpan_allTxtId_idx" ON "TranscriptSpan"("allTxtId");

-- CreateIndex
CREATE INDEX "TranscriptSpan_speaker_idx" ON "TranscriptSpan"("speaker");

-- CreateIndex
CREATE INDEX "EventSpan_transcriptSpanId_idx" ON "EventSpan"("transcriptSpanId");

-- CreateIndex
CREATE INDEX "Possession_characterId_endAt_idx" ON "Possession"("characterId", "endAt");

-- CreateIndex
CREATE INDEX "Possession_itemId_endAt_idx" ON "Possession"("itemId", "endAt");

-- CreateIndex
CREATE INDEX "Possession_campaignId_idx" ON "Possession"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Possession_characterId_itemId_startAt_key" ON "Possession"("characterId", "itemId", "startAt");

-- CreateIndex
CREATE INDEX "StatSnapshot_characterId_statType_effectiveAt_idx" ON "StatSnapshot"("characterId", "statType", "effectiveAt");

-- CreateIndex
CREATE INDEX "StatSnapshot_campaignId_idx" ON "StatSnapshot"("campaignId");

-- CreateIndex
CREATE INDEX "Alias_characterId_idx" ON "Alias"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "Alias_campaignId_alias_key" ON "Alias"("campaignId", "alias");
