-- CreateEnum
CREATE TYPE "A2PStatus" AS ENUM ('NOT_REQUIRED', 'INFORMATION_NEEDED', 'UNDER_INTERNAL_REVIEW', 'NEEDS_CLIENT_CHANGES', 'READY_TO_SUBMIT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_RESUBMISSION');

-- CreateEnum
CREATE TYPE "A2PEntityType" AS ENUM ('SOLE_PROPRIETOR', 'LLC', 'CORPORATION', 'PARTNERSHIP', 'NONPROFIT', 'GOVERNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "A2PReviewStatus" AS ENUM ('NOT_REVIEWED', 'NEEDS_CHANGES', 'READY_FOR_REVIEW', 'APPROVED_INTERNALLY');

-- CreateEnum
CREATE TYPE "A2PUseCase" AS ENUM ('APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER', 'LEAD_FOLLOW_UP', 'QUOTE_FOLLOW_UP', 'CUSTOMER_SUPPORT', 'SERVICE_NOTIFICATION', 'ORDER_STATUS', 'ACCOUNT_NOTIFICATION', 'MARKETING_PROMOTION', 'REACTIVATION', 'TWO_FACTOR', 'MISSED_CALL_TEXT_BACK', 'OTHER');

-- CreateEnum
CREATE TYPE "A2POptInMethod" AS ENUM ('WEBSITE_FORM', 'CONTACT_FORM', 'LANDING_PAGE', 'BOOKING_FORM', 'CHECKOUT', 'PAPER_FORM', 'IN_PERSON', 'VERBAL', 'TEXT_TO_JOIN', 'EXISTING_CUSTOMER', 'OTHER');

-- CreateEnum
CREATE TYPE "A2PSampleCategory" AS ENUM ('TRANSACTIONAL', 'LEAD_FOLLOW_UP', 'MARKETING', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssetType" ADD VALUE 'BUSINESS_REGISTRATION';
ALTER TYPE "AssetType" ADD VALUE 'EIN_CONFIRMATION';
ALTER TYPE "AssetType" ADD VALUE 'OPT_IN_SCREENSHOT';
ALTER TYPE "AssetType" ADD VALUE 'PRIVACY_POLICY_EVIDENCE';
ALTER TYPE "AssetType" ADD VALUE 'TERMS_EVIDENCE';

-- CreateTable
CREATE TABLE "A2PProfile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "A2PStatus" NOT NULL DEFAULT 'INFORMATION_NEEDED',
    "legalName" TEXT,
    "dbaName" TEXT,
    "entityType" "A2PEntityType",
    "countryOfRegistration" TEXT,
    "taxId" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "stateRegion" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "businessPhone" TEXT,
    "businessEmail" TEXT,
    "websiteUrl" TEXT,
    "socialUrls" TEXT[],
    "representativeContactId" TEXT,
    "representativeName" TEXT,
    "representativeTitle" TEXT,
    "representativeEmail" TEXT,
    "representativePhone" TEXT,
    "representativeRelation" TEXT,
    "authorisationConfirmedAt" TIMESTAMP(3),
    "useCases" "A2PUseCase"[],
    "useCaseOther" TEXT,
    "internalUseCase" TEXT,
    "clientCampaignDescription" TEXT,
    "reviewedCampaignDescription" TEXT,
    "optInMethods" "A2POptInMethod"[],
    "optInMethodOther" TEXT,
    "optInPageUrl" TEXT,
    "optInFormUrl" TEXT,
    "optInCheckboxText" TEXT,
    "consentLanguage" TEXT,
    "checkboxIsOptional" BOOLEAN,
    "checkboxUncheckedByDefault" BOOLEAN,
    "privacyPolicyUrl" TEXT,
    "termsUrl" TEXT,
    "smsTermsUrl" TEXT,
    "optInKeywords" TEXT,
    "optOutKeywords" TEXT,
    "helpKeywords" TEXT,
    "optInConfirmation" TEXT,
    "optOutConfirmation" TEXT,
    "helpResponse" TEXT,
    "messagesContainLinks" BOOLEAN,
    "linkDomains" TEXT,
    "messagesContainPhoneNumbers" BOOLEAN,
    "monthlyVolume" TEXT,
    "monthlyLeads" TEXT,
    "trafficMix" TEXT,
    "isTwoWay" BOOLEAN,
    "businessHours" TEXT,
    "repliesHandledBy" TEXT,
    "needsMissedCallTextBack" BOOLEAN,
    "needsAppointmentReminders" BOOLEAN,
    "needsLeadNurture" BOOLEAN,
    "needsReactivation" BOOLEAN,
    "existingPhoneNumber" TEXT,
    "keepExistingNumber" BOOLEAN,
    "needsNewNumber" BOOLEAN,
    "preferredAreaCode" TEXT,
    "forwardingNumber" TEXT,
    "inboundCallRecipient" TEXT,
    "voicemailRequired" BOOLEAN,
    "smsInboxUsers" TEXT,
    "primarySmsResponder" TEXT,
    "afterHoursBehaviour" TEXT,
    "identityReview" "A2PReviewStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "consentReview" "A2PReviewStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "campaignReview" "A2PReviewStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "A2PProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "A2PSampleMessage" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "category" "A2PSampleCategory" NOT NULL DEFAULT 'TRANSACTIONAL',
    "body" TEXT NOT NULL,
    "reviewNote" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "A2PSampleMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "A2PSubmission" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "brandId" TEXT,
    "campaignId" TEXT,
    "providerStatus" TEXT,
    "response" TEXT,
    "rejectedReason" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "A2PSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "A2PProfile_clientId_key" ON "A2PProfile"("clientId");

-- CreateIndex
CREATE INDEX "A2PProfile_status_idx" ON "A2PProfile"("status");

-- CreateIndex
CREATE INDEX "A2PSampleMessage_profileId_idx" ON "A2PSampleMessage"("profileId");

-- CreateIndex
CREATE INDEX "A2PSubmission_profileId_idx" ON "A2PSubmission"("profileId");

-- CreateIndex
CREATE INDEX "A2PSubmission_submittedAt_idx" ON "A2PSubmission"("submittedAt");

-- AddForeignKey
ALTER TABLE "A2PProfile" ADD CONSTRAINT "A2PProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "A2PProfile" ADD CONSTRAINT "A2PProfile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "A2PProfile" ADD CONSTRAINT "A2PProfile_representativeContactId_fkey" FOREIGN KEY ("representativeContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "A2PSampleMessage" ADD CONSTRAINT "A2PSampleMessage_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "A2PProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "A2PSubmission" ADD CONSTRAINT "A2PSubmission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "A2PProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "A2PSubmission" ADD CONSTRAINT "A2PSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
