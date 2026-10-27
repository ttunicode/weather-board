// app.js – 화면 동작 (목록 그리기, 일정 추가)

let tasks = [];
let baseTasks = [];
let weatherByRegion = {};

function loadAddedTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

async function loadTasks() {
  const msgBox = document.getElementById('msgBox');
  try {
    const response = await fetch('./data/tasks.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('일정 JSON 형식이 올바르지 않습니다.');
    baseTasks = data;
    msgBox.textContent = '';
  } catch (error) {
    baseTasks = [];
    msgBox.textContent = window.location.protocol === 'file:'
      ? '배포 주소로 열어 주세요'
      : '일정 목록 파일을 읽지 못했습니다.';
  }

  tasks = baseTasks.concat(loadAddedTasks());
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

function addTask(e) {
  e.preventDefault();
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  const saved = loadAddedTasks();
  saved.push(t);
  localStorage.setItem('wx_added', JSON.stringify(saved));
  e.target.reset();
  tasks = baseTasks.concat(saved);
  renderTasks();
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
