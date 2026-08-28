/**
 * 네이버 항공권 검색 결과로 바로 이동하는 딥링크.
 * 알림에서 원클릭으로 (조건이 채워진) 예매 화면에 진입시키는 용도 —
 * 이후 좌석 선택·결제(카카오페이 등)는 사용자가 직접 진행한다.
 */
export function buildDeeplink(w: {
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string | null;
}): string {
  const dep = w.depart_date.replaceAll("-", "");
  let path = `${w.origin}-${w.destination}-${dep}`;
  if (w.return_date) {
    const ret = w.return_date.replaceAll("-", "");
    path += `/${w.destination}-${w.origin}-${ret}`;
  }
  return `https://flight.naver.com/flights/international/${path}?adult=1&fareType=Y`;
}
