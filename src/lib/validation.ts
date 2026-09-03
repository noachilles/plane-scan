import { z } from "zod";

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "공항 코드는 IATA 3글자여야 합니다 (예: ICN)");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시각은 HH:MM 형식");
const price = z.number().int().positive().max(100_000_000);

const conditionFields = {
  origin: iata,
  destination: iata,
  departDate: dateStr,
  returnDate: dateStr.nullable().optional(),
  timeFrom: timeStr.default("00:00"),
  timeTo: timeStr.default("23:59"),
  returnTimeFrom: timeStr.nullable().optional(),
  returnTimeTo: timeStr.nullable().optional(),
  directOnly: z.boolean().default(false),
};

interface ConditionValues {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  timeFrom: string;
  timeTo: string;
  returnTimeFrom?: string | null;
  returnTimeTo?: string | null;
}

function checkCondition(v: ConditionValues, ctx: z.RefinementCtx): void {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (v.origin === v.destination) issue("출발지와 도착지가 같습니다");
  if (v.returnDate && v.returnDate < v.departDate) issue("오는 날이 가는 날보다 빠릅니다");
  if (v.timeFrom > v.timeTo) issue("가는편 시간대 범위가 올바르지 않습니다");
  if (v.returnTimeFrom && v.returnTimeTo && v.returnTimeFrom > v.returnTimeTo) issue("오는편 시간대 범위가 올바르지 않습니다");
}

/** 목표가 없이 현재 최저가만 조회할 때 쓰는 조건 */
export const quoteInputSchema = z.object(conditionFields).superRefine(checkCondition);

export const watchInputSchema = z.object({ ...conditionFields, maxPrice: price }).superRefine(checkCondition);

export const watchPatchSchema = z.object({
  origin: iata.optional(),
  destination: iata.optional(),
  departDate: dateStr.optional(),
  returnDate: dateStr.nullable().optional(),
  timeFrom: timeStr.optional(),
  timeTo: timeStr.optional(),
  returnTimeFrom: timeStr.nullable().optional(),
  returnTimeTo: timeStr.nullable().optional(),
  directOnly: z.boolean().optional(),
  maxPrice: price.optional(),
  active: z.boolean().optional(),
});

export const favoriteRouteSchema = z
  .object({
    origin: iata,
    destination: iata,
    label: z.string().trim().max(30).nullable().optional(),
  })
  .refine((v) => v.origin !== v.destination, { message: "출발지와 도착지가 같습니다" });

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export type WatchInput = z.infer<typeof watchInputSchema>;
export type WatchPatch = z.infer<typeof watchPatchSchema>;
export type QuoteInput = z.infer<typeof quoteInputSchema>;
