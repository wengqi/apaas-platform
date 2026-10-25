-- CreateIndex
CREATE INDEX "process_tasks_candidateGroups_idx" ON "process_tasks" USING GIN ("candidateGroups");

-- CreateIndex
CREATE INDEX "process_tasks_node_execution_id_idx" ON "process_tasks"("node_execution_id");
