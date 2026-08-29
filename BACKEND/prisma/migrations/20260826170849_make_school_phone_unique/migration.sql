/*
  Warnings:

  - A unique constraint covering the columns `[phone]` on the table `schools` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "schools_phone_key" ON "schools"("phone");
