/** 네이버 판매처(OTA) 코드 → 읽기 쉬운 이름. 코드 앞 3글자로 매칭, 모르면 코드 그대로. */
const PARTNER_PREFIX_NAMES: Record<string, string> = {
  AGD: "아고다",
  CTR: "트립닷컴",
  TRP: "트립닷컴",
  BDC: "부킹닷컴",
  KYK: "카약",
  WHY: "와이페이모어",
  TOV: "투어비스",
  ONT: "온라인투어",
  HAT: "하나투어",
  MRT: "마이리얼트립",
  IPK: "인터파크투어",
  JJD: "제주닷컴",
  EDR: "익스피디아",
  ATK: "에어트리",
};

export function partnerName(code: string | null | undefined): string | null {
  if (!code) return null;
  return PARTNER_PREFIX_NAMES[code.slice(0, 3).toUpperCase()] ?? code;
}
