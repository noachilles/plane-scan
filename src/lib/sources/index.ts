import { mockSource } from "./mock";
import { naverSource } from "./naver";
import type { FlightSource } from "./types";

export function getSource(): FlightSource {
  return process.env.FLIGHT_SOURCE === "naver" ? naverSource : mockSource;
}

export * from "./types";
