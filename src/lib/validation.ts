import { z } from "zod";

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "공항 코드는 IATA 3글자여야 합니다 (예: ICN)");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시각은 HH:MM 형식");

export const watchInputSchema = z
  .object({
    origin: iata,
    destination: iata,
    departDate: dateStr,
    returnDate: dateStr.nullable().optional(),
    timeFrom: timeStr.default("00:00"),
    timeTo: timeStr.default("23:59"),
    maxPrice: z.number().int().positive().max(100_000_000),
  })
  .refine((v) => v.origin !== v.destination, { message: "출발지와 도착지가 같습니다" })
  .refine((v) => !v.returnDate || v.returnDate >= v.departDate, {
    message: "오는 날이 가는 날보다 빠릅니다",
  })
  .refine((v) => v.timeFrom <= v.timeTo, { message: "시간대 범위가 올바르지 않습니다" });

export const watchPatchSchema = z.object({
  origin: iata.optional(),
  destination: iata.optional(),
  departDate: dateStr.optional(),
  returnDate: dateStr.nullable().optional(),
  timeFrom: timeStr.optional(),
  timeTo: timeStr.optional(),
  maxPrice: z.number().int().positive().max(100_000_000).optional(),
  active: z.boolean().optional(),
});

export type WatchInput = z.infer<typeof watchInputSchema>;
export type WatchPatch = z.infer<typeof watchPatchSchema>;
