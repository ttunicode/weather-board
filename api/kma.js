const { judge } = require('../logic');

const SUPABASE_URL = 'https://qojxaerbpjtwijyfiamm.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_W9oqJLqOc7JzXlx4XWIrTw_r4-3CuQm';

const REGION_GRID = {
  세종: { nx: 66, ny: 103 },
  대전: { nx: 67, ny: 100 },
  태안: { nx: 48, ny: 109 },
  보령: { nx: 54, ny: 100 },
};

function kstDateTime() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]));
}

function previousDate(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function latestKmaBase() {
  const now = kstDateTime();
  const today = `${now.year}${now.month}${now.day}`;
  let date = today;
  const minutes = Number(now.hour) * 60 + Number(now.minute) - 20;
  const cycles = [2, 5, 8, 11, 14, 17, 20, 23];
  const hour = cycles.filter((cycle) => cycle * 60 <= minutes).pop();
  if (hour === undefined) {
    date = previousDate(`${now.year}-${now.month}-${now.day}`);
    return { date, time: '2300', today };
  }
  return { date, time: String(hour).padStart(2, '0') + '00', today };
}

async function readTasks(region) {
  const params = new URLSearchParams({
    select: 'id,title,region,kind,owner',
    region: `eq.${region}`,
    order: 'id.asc',
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/wx_tasks?${params}`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
  });
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status})`);
  return response.json();
}

async function readKmaWeather(region, grid) {
  const serviceKey = process.env.KMA_KEY;
  if (!serviceKey) throw new Error('Vercel KMA_KEY 환경변수가 설정되지 않았습니다.');

  const base = latestKmaBase();
  const params = new URLSearchParams({
    serviceKey,
    pageNo: '1',
    numOfRows: '1000',
    dataType: 'JSON',
    base_date: base.date,
    base_time: base.time,
    nx: String(grid.nx),
    ny: String(grid.ny),
  });
  const response = await fetch(`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params}`);
  if (!response.ok) throw new Error(`기상청 요청 실패 (${response.status})`);

  const payload = await response.json();
  const result = payload && payload.response;
  const resultCode = result && result.header && result.header.resultCode;
  if (resultCode && resultCode !== '00' && resultCode !== '0000') {
    const message = result.header.resultMsg || '응답 오류';
    throw new Error(`기상청 응답 오류 (${resultCode}: ${message})`);
  }

  const today = base.today;
  const rawItems = result && result.body && result.body.items && result.body.items.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const todayItems = items.filter((item) => item.fcstDate === today);
  const valuesFor = (category) => todayItems
    .filter((item) => item.category === category)
    .map((item) => Number(item.fcstValue))
    .filter((value) => Number.isFinite(value) && value > -100);
  const max = (values) => values.length ? Math.max(...values) : null;

  const dailyHigh = max(valuesFor('TMX')) ?? max(valuesFor('TMP'));
  const windMax = max(valuesFor('WSD'));
  const rainProb = max(valuesFor('POP'));
  if ([dailyHigh, windMax, rainProb].some((value) => value === null)) {
    throw new Error('기상청 응답에 오늘 기온·풍속·강수확률이 모두 포함되지 않았습니다.');
  }

  return {
    source: '기상청 단기예보',
    date: today,
    tempMax: dailyHigh,
    windMax,
    rainProb,
    baseDate: base.date,
    baseTime: base.time,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET 요청만 지원합니다.' });
  }

  const region = typeof req.query.region === 'string' ? req.query.region : '';
  const grid = REGION_GRID[region];
  if (!grid) {
    return res.status(400).json({ error: 'region은 세종, 대전, 태안, 보령 중 하나여야 합니다.' });
  }

  try {
    const [schedules, weather] = await Promise.all([
      readTasks(region),
      readKmaWeather(region, grid),
    ]);
    return res.status(200).json({
      region,
      weather,
      schedules: schedules.map((schedule) => ({
        ...schedule,
        weather,
        judgment: judge(schedule.kind, weather),
      })),
    });
  } catch (error) {
    const message = error.message === 'Vercel KMA_KEY 환경변수가 설정되지 않았습니다.'
      ? error.message
      : 'Supabase 일정 또는 기상청 날씨를 조회하지 못했습니다.';
    return res.status(502).json({ error: message });
  }
};
