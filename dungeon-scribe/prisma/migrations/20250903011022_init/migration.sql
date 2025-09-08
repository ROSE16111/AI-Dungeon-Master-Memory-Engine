/*
  https://kroki.io/dbml/svg/eNqFUcFqwzAMvecrdOulNJexQyGDje2wyw5lt1KKlmitqe0EWy4NZf8-2U2zlGXZRUjP0ntPVp5DURTwjh-afEyzLOVQomlQ7SycMwBVQQgS1o1TBl0LB2o3grNiaT2iK_fopPaMjp-RCSoJrAwJGJpY3KJfVxlXS5iSsGiGCpqOpEFZlvxq8fUy-kOKWm_5xJO8ZW2ZLAPTaYxLEEfitnrkEdc-mMQ1-Tdt0zduYzEi-lsC0o-8DZaGta2ZljCzQeuoPtuM-hXxHT2hp_u7xN_PdVh6n8OARdbJL-d_scF014_pje20pCfvVW2jsFjCkskNxlekkeXZ71XT0azoc5lWWQycPvS2F2I5tXSn-qer8_N31ze1-O0C
*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Session";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateDate" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "campaignId" TEXT NOT NULL,
    CONSTRAINT "Role_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AllTxt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AllTxt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Summary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roleName" TEXT,
    "campaignId" TEXT NOT NULL,
    CONSTRAINT "Summary_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "Summary" ADD COLUMN "imageBase64" TEXT;

