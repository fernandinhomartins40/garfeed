-- CreateTable
CREATE TABLE "PlateDesign" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "widthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "doc" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlateDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlateDesign_restaurantId_idx" ON "PlateDesign"("restaurantId");

-- AddForeignKey
ALTER TABLE "PlateDesign" ADD CONSTRAINT "PlateDesign_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
