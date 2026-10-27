// app.js – 화면 동작 (목록 그리기, 일정 추가)

let tasks = [];
let weatherByRegion = {};
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function loadTasks() {
  const msgBox = document.getElementById('msgBox');
  msgBox.textContent = 'Supabase에서 일정을 불러오는 중입니다.';
  try {
    const { data, error } = await supabaseClient
      .from('wx_tasks')
      .select('id, title, region, kind, owner')
      .order('id', { ascending: true });
    if (error) throw error;
    tasks = data || [];
    msgBox.textContent = '';
  } catch (error) {
    tasks = [];
    msgBox.textContent = `Supabase에서 일정을 불러오지 못했습니다. setup.sql 실행과 config.js 연결값을 확인해 주세요. (${error.message})`;
  }

  renderTasks();
}

function weatherText(w) {
  return w ? w.tempMax + '℃ · ' + w.windMax + 'm/s · ' + w.rainProb + '%' : '-';
}

function renderTasks() {
  const body = document.getElementById('taskList');
  body.innerHTML = '';
  for (const t of tasks) {
    const w = weatherByRegion[t.region];
    const r = judge(t.kind, w);
    const tr = document.createElement('tr');
    for (const v of [t.title, t.region, t.kind, t.owner, weatherText(w)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    td.textContent = r.text;
    td.className = r.level;
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

async function addTask(e) {
  e.preventDefault();
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  const submitButton = e.target.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  const msgBox = document.getElementById('msgBox');
  msgBox.textContent = 'Supabase에 일정을 저장하고 있습니다.';
  try {
    const { error } = await supabaseClient.from('wx_tasks').insert(t);
    if (error) throw error;
    e.target.reset();
    await loadTasks();
  } catch (error) {
    msgBox.textContent = `일정을 저장하지 못했습니다. setup.sql의 권한과 DB 제약을 확인해 주세요. (${error.message})`;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

document.getElementById('taskForm').addEventListener('submit', addTask);
loadTasks();

const today = new Date();
const todayText = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-');
document.getElementById('currentDate').textContent = todayText;

document.getElementById('downloadReportButton').addEventListener('click', () => {
  const markdown = buildMarkdownReport(tasks, weatherByRegion);
  const blob = new Blob(['\uFEFF', markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `현장일정_판단_${todayText}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function loadWeather() {
  const weatherBox = document.getElementById('weatherBox');
  const regions = Object.keys(REGION_COORDINATES);
  const failedRegions = [];
  weatherBox.textContent = '오늘 지역별 날씨를 조회하고 있습니다.';

  await Promise.all(regions.map(async (region) => {
    try {
      const response = await fetch(buildWeatherUrl(region));
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const weather = parseWeatherResponse(data);
      weatherByRegion[region] = applyWeatherTest(weather, window.location.search);
    } catch (error) {
      failedRegions.push(region);
    }
  }));

  renderTasks();
  const loadedCount = regions.length - failedRegions.length;
  weatherBox.textContent = failedRegions.length
    ? `날씨 ${loadedCount}/${regions.length}개 지역 조회 완료 · 조회 실패: ${failedRegions.join(', ')} (실패한 지역 일정은 날씨 확인 전)`
    : `오늘 날씨 ${loadedCount}개 지역 조회 완료`;
}

loadWeather();
