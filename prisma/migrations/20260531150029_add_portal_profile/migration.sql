-- CreateTable
CREATE TABLE "PortalProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "questions" TEXT NOT NULL,
    "sampleUrl" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PortalProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PortalProfile_userId_completed_idx" ON "PortalProfile"("userId", "completed");

-- CreateIndex
CREATE UNIQUE INDEX "PortalProfile_userId_portal_key" ON "PortalProfile"("userId", "portal");
