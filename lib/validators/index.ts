import {
  ClientStatus,
  Department,
  EmployeeTaskStatus,
  Role,
  ServiceType,
  SocialPlatform,
  SocialTaskStatus,
  TaskCategory,
  TaskPriority,
} from "@prisma/client";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const userFormSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  role: z.nativeEnum(Role),
  department: z.nativeEnum(Department),
  jobTitle: z.string().max(80).optional().or(z.literal("")),
  weeklyCapacityHours: z.coerce.number().int().min(1).max(80),
  password: z.string().min(8).optional().or(z.literal("")),
  isActive: z.coerce.boolean().default(true),
});

export const clientFormSchema = z.object({
  clientName: z.string().min(2).max(80),
  companyName: z.string().min(2).max(120),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(40).optional().or(z.literal("")),
  assignedUserId: z.string().optional().or(z.literal("")),
  status: z.nativeEnum(ClientStatus),
  serviceType: z.nativeEnum(ServiceType),
  currentStageId: z.string().min(1),
  notes: z.string().max(3000).optional().or(z.literal("")),
});

export const clientStatusUpdateSchema = z.object({
  status: z.nativeEnum(ClientStatus),
});

export const pipelineMoveSchema = z.object({
  clientId: z.string().min(1),
  stageId: z.string().min(1),
  note: z.string().max(500).optional().or(z.literal("")),
});

export const socialTaskUpdateSchema = z.object({
  plannedPosts: z.coerce.number().int().min(1),
  completedPosts: z.coerce.number().int().min(0),
  dueDate: z.string().min(1),
  assignedUserId: z.string().optional().or(z.literal("")),
  status: z.nativeEnum(SocialTaskStatus),
  platform: z.nativeEnum(SocialPlatform),
});

export const employeeTaskFormSchema = z.object({
  title: z.string().min(2).max(120),
  note: z.string().optional().or(z.literal("")),
  assignedToId: z.string().min(1),
  dueDate: z.string().min(1),
  priority: z.nativeEnum(TaskPriority),
  category: z.nativeEnum(TaskCategory),
  estimatedHours: z.coerce.number().int().min(1).max(40),
  status: z.nativeEnum(EmployeeTaskStatus).default(EmployeeTaskStatus.TODO),
  clientId: z.string().optional().or(z.literal("")),
});

export const employeeTaskUpdateSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  note: z.string().optional().or(z.literal("")),
  dueDate: z.string().min(1).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  category: z.nativeEnum(TaskCategory).optional(),
  estimatedHours: z.coerce.number().int().min(1).max(40).optional(),
  status: z.nativeEnum(EmployeeTaskStatus),
  clientId: z.string().optional().or(z.literal("")),
  assignedToId: z.string().optional().or(z.literal("")),
});

export const employeeTaskEodEntrySchema = z.object({
  entryDate: z.string().min(1),
  summary: z.string().min(2).max(4000),
  blockers: z.string().max(2000).optional().or(z.literal("")),
  nextSteps: z.string().max(2000).optional().or(z.literal("")),
});
