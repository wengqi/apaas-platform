-- CreateIndex
CREATE INDEX "records_data_idx" ON "records" USING GIN ("data");
