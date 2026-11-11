-- CreateTable
CREATE TABLE "ApnsDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApnsDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApnsDevice_token_key" ON "ApnsDevice"("token");

-- CreateIndex
CREATE INDEX "ApnsDevice_userId_idx" ON "ApnsDevice"("userId");

-- AddForeignKey
ALTER TABLE "ApnsDevice" ADD CONSTRAINT "ApnsDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
