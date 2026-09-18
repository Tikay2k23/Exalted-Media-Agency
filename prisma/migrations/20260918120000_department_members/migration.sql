-- AlterEnum
ALTER TYPE "Department" ADD VALUE 'AUTOMATION';

-- AlterEnum
ALTER TYPE "EmploymentType" ADD VALUE 'FREELANCER';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_MEMBER_ADDED';

-- AlterEnum
ALTER TYPE "TeamRole" ADD VALUE 'DEPARTMENT_MEMBER';

-- AlterTable
ALTER TABLE "EmployeeTask" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "sopId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "workingHours" TEXT;

-- AddForeignKey
ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_sopId_fkey" FOREIGN KEY ("sopId") REFERENCES "Sop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

