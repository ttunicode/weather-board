// logic.js – 판단 규칙만 (화면을 다루는 코드 금지)

// 교육용 가상 기준 (실제 작업 중지 · 행사 취소 기준은 각 기관 규정을 따름)
const RULES = { wind: 10, rain: 60, heat: 33 };

// Open-Meteo 좌표 (위도, 경도)
const REGION_COORDINATES = {
  세종: [36.4801, 127.2890],
  대전: [36.3504, 127.3845],
  태안: [36.7456, 126.2980],
  보령: [36.3333, 126.6128],
};

function buildWeatherUrl(region) {
  const coordinates = REGION_COORDINATES[region];
  if (!coordinates) throw new Error('지원하지 않는 지역입니다: ' + region);

  const params = new URLSearchParams({
    latitude: coordinates[0],
    longitude: coordinates[1],
    daily: 'temperature_2m_max,wind_speed_10m_max,precipitation_probability_max',
    wind_speed_unit: 'ms',
    timezone: 'Asia/Seoul',
    forecast_days: 1,
  });
  return 'https://api.open-meteo.com/v1/forecast?' + params.toString();
}

function parseWeatherResponse(data) {
  const daily = data && data.daily;
  const tempMax = daily && daily.temperature_2m_max && daily.temperature_2m_max[0];
  const windMax = daily && daily.wind_speed_10m_max && daily.wind_speed_10m_max[0];
  const rainProb = daily && daily.precipitation_probability_max && daily.precipitation_probability_max[0];
  if (![tempMax, windMax, rainProb].every(Number.isFinite)) {
    throw new Error('날씨 응답에 필요한 오늘 데이터가 없습니다.');
  }
  return { tempMax, windMax, rainProb };
}

function applyWeatherTest(weather, search) {
  const params = new URLSearchParams(search || '');
  return params.get('test') === 'wind' ? { ...weather, windMax: 12 } : weather;
}

// 일정 구분과 날씨로 판단 (w가 없으면 '날씨 확인 전')
function judge(kind, w) {
  if (kind === '실내') return { level: 'ok', text: '영향 없음' };
  if (!w) return { level: 'none', text: '날씨 확인 전' };
  if (kind === '고소' && w.windMax >= RULES.wind) return { level: 'stop', text: '중지 검토 (강풍)' };
  if (w.tempMax >= RULES.heat) return { level: 'warn', text: '폭염 휴식' };
  if (w.rainProb >= RULES.rain) return { level: 'warn', text: '우천 주의' };
  return { level: 'ok', text: '진행' };
}

if (typeof module !== 'undefined') {
  module.exports = { RULES, REGION_COORDINATES, buildWeatherUrl, parseWeatherResponse, applyWeatherTest, judge };
}
