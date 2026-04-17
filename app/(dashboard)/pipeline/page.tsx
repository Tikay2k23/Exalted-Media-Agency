import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { getPipelineData } from "@/lib/data/queries";
import { canMovePipeline } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const assignee = typeof params.assignee === "string" ? params.assignee : "ALL";
  const data = await getPipelineData(user, assignee);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account Pipeline</CardTitle>
          <CardDescription>
            {canMovePipeline(user.role)
              ? "Move client accounts between stages to keep the delivery pipeline current. Every move is recorded."
              : "View the live pipeline for your assigned accounts and stay aligned with the team."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row md:items-center">
            <Select name="assignee" defaultValue={assignee} className="max-w-xs">
              <option value="ALL">All assignees</option>
              {data.users.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
            <Button type="submit">Filter board</Button>
          </form>
        </CardContent>
      </Card>

      <PipelineBoard initialStages={data.stages} canMove={canMovePipeline(user.role)} />
    </div>
  );
}
