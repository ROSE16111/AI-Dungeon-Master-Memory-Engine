-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'auto',
    "source" TEXT NOT NULL DEFAULT 'live',
    "text" TEXT NOT NULL,
    "keyPhrases" JSONB NOT NULL,
    "keySentences" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
