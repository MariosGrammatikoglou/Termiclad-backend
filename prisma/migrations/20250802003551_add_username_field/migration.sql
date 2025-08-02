-- DropForeignKey
ALTER TABLE "public"."GroupChat" DROP CONSTRAINT "GroupChat_createdBy_fkey";

-- DropIndex
DROP INDEX "public"."GroupMember_groupId_userId_key";
