// =====================================================================
// 共通ユーティリティ
// =====================================================================

function formatCurrency(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function formatPrincipalAxis(value) {
  if (value >= 100000000) {
    const valueInOku = value / 100000000;
    return `${valueInOku.toLocaleString("ja-JP", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    })}億円`;
  }

  return `${(value / 10000).toLocaleString("ja-JP", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}万円`;
}

function getNiceMax(value) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function clamp(value, min, max) {
  return Number.isNaN(value) ? min : Math.min(Math.max(value, min), max);
}

// =====================================================================
// DOM参照と、フェーズ間で共有する状態
// =====================================================================

const a = {
  principal: document.getElementById("a-principal"),
  monthly: document.getElementById("a-monthly"),
  rate: document.getElementById("a-rate"),
  years: document.getElementById("a-years"),

  principalValue: document.getElementById("a-principal-value"),
  monthlyValue: document.getElementById("a-monthly-value"),
  rateValue: document.getElementById("a-rate-value"),
  yearsValue: document.getElementById("a-years-value"),

  finalBalance: document.getElementById("a-final-balance"),
  totalContribution: document.getElementById("a-total-contribution"),
  profit: document.getElementById("a-profit"),
  chart: document.getElementById("accumulate-chart"),
};

const w = {
  principal: document.getElementById("w-principal"),
  rate: document.getElementById("w-rate"),
  withdrawal: document.getElementById("w-withdrawal"),

  principalValue: document.getElementById("w-principal-value"),
  rateValue: document.getElementById("w-rate-value"),
  withdrawalValue: document.getElementById("w-withdrawal-value"),

  finalBalance: document.getElementById("w-final-balance"),
  breakdownYear: document.getElementById("w-breakdown-year"),
  chart: document.getElementById("withdraw-chart"),
};

const linkToggle = document.getElementById("link-toggle");
const linkedReadout = document.getElementById("linked-readout");
const connectorFinalBalance = document.getElementById("connector-final-balance");
const copyLinkBtn = document.getElementById("copyLinkBtn");

// 積立フェーズの最終残高（連携ONのときに取崩フェーズの元本として使われる）
let latestFinalBalance = 0;
// 連携トグルの現在値
let isLinked = linkToggle.checked;

// =====================================================================
// Stage 1: 積立投資シミュレーション
// =====================================================================

function getProjection(principal, monthly, annualRate, years) {
  const months = years * 12;
  const balances = [principal];
  let balance = principal;
  let totalContribution = principal;

  for (let month = 1; month <= months; month += 1) {
    balance = balance * (1 + annualRate / 100 / 12) + monthly;
    totalContribution += monthly;
    balances.push(balance);
  }

  return {
    balances,
    totalContribution,
    finalBalance: balance,
    profit: balance - totalContribution,
  };
}

function drawAccumulateChart(balances, years) {
  const width = 760;
  const height = 420;
  const margin = { top: 24, right: 24, bottom: 48, left: 84 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const maxValue = getNiceMax(Math.max(...balances, 1) * 1.1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxValue * t);

  a.chart.innerHTML = "";

  a.chart.appendChild(svgEl("rect", { x: 0, y: 0, width, height, fill: "#f4f6fb", rx: 20 }));
  a.chart.appendChild(
    svgEl("rect", {
      x: margin.left,
      y: margin.top,
      width: plotWidth,
      height: plotHeight,
      fill: "#ffffff",
      stroke: "#dbe2ec",
    })
  );

  ticks.forEach((tickValue, index) => {
    const y = margin.top + plotHeight * (1 - index / 4);
    a.chart.appendChild(
      svgEl("line", {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        stroke: "rgba(36,70,111,0.12)",
      })
    );
    const label = svgEl("text", {
      x: margin.left - 12,
      y: y + 4,
      fill: "#7b8aa3",
      "font-size": 12,
      "text-anchor": "end",
    });
    label.textContent = formatPrincipalAxis(tickValue);
    a.chart.appendChild(label);
  });

  a.chart.appendChild(
    svgEl("line", {
      x1: margin.left,
      y1: height - margin.bottom,
      x2: width - margin.right,
      y2: height - margin.bottom,
      stroke: "#a9b7cc",
    })
  );
  a.chart.appendChild(
    svgEl("line", {
      x1: margin.left,
      y1: margin.top,
      x2: margin.left,
      y2: height - margin.bottom,
      stroke: "#a9b7cc",
    })
  );

  const linePoints = balances.map((value, index) => {
    const x = margin.left + (index / (balances.length - 1)) * plotWidth;
    const y = margin.top + plotHeight * (1 - Math.max(0, value) / maxValue);
    return { x, y };
  });

  const pathData = linePoints
    .map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  a.chart.appendChild(
    svgEl("path", {
      d: pathData,
      fill: "none",
      stroke: "#336485",
      "stroke-width": 3.5,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    })
  );

  for (let year = 0; year <= years; year += Math.max(1, Math.round(years / 4))) {
    const x = margin.left + (year / years) * plotWidth;
    const label = svgEl("text", {
      x,
      y: height - margin.bottom + 24,
      fill: "#7b8aa3",
      "font-size": 12,
      "text-anchor": "middle",
    });
    label.textContent = `${year}年`;
    a.chart.appendChild(label);
  }
}

function renderAccumulate() {
  const principal = Number(a.principal.value);
  const monthly = Number(a.monthly.value);
  const annualRate = Number(a.rate.value);
  const years = Number(a.years.value);

  a.principalValue.value = formatCurrency(principal);
  a.monthlyValue.value = formatCurrency(monthly);
  a.rateValue.value = formatPercent(annualRate);
  a.yearsValue.value = `${years}年`;

  const projection = getProjection(principal, monthly, annualRate, years);

  a.finalBalance.textContent = formatCurrency(projection.finalBalance);
  a.totalContribution.textContent = formatCurrency(projection.totalContribution);
  a.profit.textContent = formatCurrency(projection.profit);

  drawAccumulateChart(projection.balances, years);

  latestFinalBalance = projection.finalBalance;
  connectorFinalBalance.textContent = formatCurrency(latestFinalBalance);

  if (isLinked) {
    syncLinkedPrincipal();
  }

  syncShareUrl();
}

[a.principal, a.monthly, a.rate, a.years].forEach((input) => {
  input.addEventListener("input", renderAccumulate);
});

// =====================================================================
// Stage 2: 定額取崩シミュレーション
// =====================================================================

function buildWithdrawalSeries(principal, annualRate, monthlyWithdrawal) {
  const monthlyRate = annualRate / 100 / 12;
  const months = 40 * 12;
  const points = [{ x: 0, y: principal }];
  let balance = principal;
  let breakdownMonth = null;

  for (let month = 1; month <= months; month += 1) {
    balance = balance * (1 + monthlyRate) - monthlyWithdrawal;

    if (balance <= 0) {
      balance = 0;
      if (breakdownMonth === null) {
        breakdownMonth = month;
      }
    }

    points.push({ x: month / 12, y: balance });
  }

  return { points, breakdownMonth };
}

function drawWithdrawChart(points) {
  const width = 760;
  const height = 420;
  const margin = { top: 24, right: 24, bottom: 48, left: 84 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const maxValue = getNiceMax(Math.max(...points.map((p) => p.y), 1) * 1.1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxValue * t);

  w.chart.innerHTML = "";

  w.chart.appendChild(svgEl("rect", { x: 0, y: 0, width, height, fill: "#f4f6fb", rx: 20 }));
  w.chart.appendChild(
    svgEl("rect", {
      x: margin.left,
      y: margin.top,
      width: plotWidth,
      height: plotHeight,
      fill: "#ffffff",
      stroke: "#dbe2ec",
    })
  );

  ticks.forEach((tickValue, index) => {
    const y = margin.top + plotHeight * (1 - index / 4);
    w.chart.appendChild(
      svgEl("line", {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        stroke: "rgba(36,70,111,0.12)",
      })
    );
    const label = svgEl("text", {
      x: margin.left - 12,
      y: y + 4,
      fill: "#7b8aa3",
      "font-size": 12,
      "text-anchor": "end",
    });
    label.textContent = formatPrincipalAxis(tickValue);
    w.chart.appendChild(label);
  });

  w.chart.appendChild(
    svgEl("line", {
      x1: margin.left,
      y1: height - margin.bottom,
      x2: width - margin.right,
      y2: height - margin.bottom,
      stroke: "#a9b7cc",
    })
  );
  w.chart.appendChild(
    svgEl("line", {
      x1: margin.left,
      y1: margin.top,
      x2: margin.left,
      y2: height - margin.bottom,
      stroke: "#a9b7cc",
    })
  );

  const linePoints = points.map((point) => {
    const x = margin.left + (point.x / 40) * plotWidth;
    const y = margin.top + plotHeight * (1 - Math.max(0, point.y) / maxValue);
    return { x, y };
  });

  const pathData = linePoints
    .map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  w.chart.appendChild(
    svgEl("path", {
      d: pathData,
      fill: "none",
      stroke: "#336485",
      "stroke-width": 3.5,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    })
  );

  for (let year = 0; year <= 40; year += 10) {
    const x = margin.left + (year / 40) * plotWidth;
    const label = svgEl("text", {
      x,
      y: height - margin.bottom + 24,
      fill: "#7b8aa3",
      "font-size": 12,
      "text-anchor": "middle",
    });
    label.textContent = `${year}年`;
    w.chart.appendChild(label);
  }
}

function renderWithdraw() {
  const principal = isLinked ? latestFinalBalance : Number(w.principal.value);
  const annualRate = Number(w.rate.value);
  const monthlyWithdrawal = Number(w.withdrawal.value);

  w.principalValue.value = formatCurrency(principal);
  w.rateValue.value = formatPercent(annualRate);
  w.withdrawalValue.value = formatCurrency(monthlyWithdrawal);

  const { points, breakdownMonth } = buildWithdrawalSeries(principal, annualRate, monthlyWithdrawal);
  const finalBalance = points[points.length - 1].y;
  w.finalBalance.textContent = formatCurrency(finalBalance);

  if (breakdownMonth === null) {
    w.breakdownYear.textContent = "40年以内に枯渇なし";
  } else {
    const years = Math.floor(breakdownMonth / 12);
    const months = breakdownMonth % 12;
    w.breakdownYear.textContent = `${years}年${months}か月`;
  }

  drawWithdrawChart(points);

  syncShareUrl();
}

[w.rate, w.withdrawal].forEach((input) => {
  input.addEventListener("input", renderWithdraw);
});

w.principal.addEventListener("input", () => {
  if (!isLinked) {
    renderWithdraw();
  }
});

// =====================================================================
// フェーズ間の連携ロジック: 積立の最終残高 → 取崩の元本
// =====================================================================

function syncLinkedPrincipal() {
  const min = Number(w.principal.min);
  const max = Number(w.principal.max);
  // スライダーのつまみ位置は表示上の目安として範囲内にクランプするが、
  // 実際の計算には latestFinalBalance をそのまま使用する。
  w.principal.value = Math.min(Math.max(latestFinalBalance, min), max);
  renderWithdraw();
}

function setLinked(linked) {
  isLinked = linked;
  w.principal.disabled = linked;
  linkedReadout.classList.toggle("active", linked);

  if (linked) {
    syncLinkedPrincipal();
  } else {
    renderWithdraw();
  }
}

linkToggle.addEventListener("change", () => setLinked(linkToggle.checked));

// =====================================================================
// 共有リンク: 現在の設定をURLクエリパラメータに保存し、コピーする
// =====================================================================

function parseQueryState() {
  const params = new URLSearchParams(window.location.search);
  if ([...params.keys()].length === 0) {
    return null;
  }

  const readParam = (key, input) =>
    clamp(Number(params.get(key) ?? input.value), Number(input.min), Number(input.max));

  return {
    principal: readParam("principal", a.principal),
    monthly: readParam("monthly", a.monthly),
    rate: readParam("rate", a.rate),
    years: readParam("years", a.years),
    wPrincipal: readParam("wprincipal", w.principal),
    wRate: readParam("wrate", w.rate),
    wWithdrawal: readParam("wwithdrawal", w.withdrawal),
    linked: params.has("linked") ? params.get("linked") !== "0" : isLinked,
  };
}

function applyParsedState(parsed) {
  if (!parsed) {
    return;
  }

  a.principal.value = parsed.principal;
  a.monthly.value = parsed.monthly;
  a.rate.value = parsed.rate;
  a.years.value = parsed.years;
  w.principal.value = parsed.wPrincipal;
  w.rate.value = parsed.wRate;
  w.withdrawal.value = parsed.wWithdrawal;
  linkToggle.checked = parsed.linked;
  isLinked = parsed.linked;
}

function syncShareUrl() {
  const params = new URLSearchParams({
    principal: a.principal.value,
    monthly: a.monthly.value,
    rate: a.rate.value,
    years: a.years.value,
    wprincipal: w.principal.value,
    wrate: w.rate.value,
    wwithdrawal: w.withdrawal.value,
    linked: isLinked ? "1" : "0",
  });
  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, "", url);
}

function copyLink() {
  const shareUrl = window.location.href;
  navigator.clipboard
    .writeText(shareUrl)
    .then(() => {
      copyLinkBtn.textContent = "リンクをコピーしました";
      setTimeout(() => {
        copyLinkBtn.textContent = "共有リンクをコピー";
      }, 1800);
    })
    .catch(() => {
      alert("共有リンクのコピーに失敗しました。URLを手動でコピーしてください。");
    });
}

copyLinkBtn.addEventListener("click", copyLink);

// =====================================================================
// 初期描画
// =====================================================================

// URLにクエリパラメータがあれば、それを初期状態として各入力に反映する。
applyParsedState(parseQueryState());

// 連携の初期表示（disabled属性・注記の表示）を先に整えてから、
// 積立側の初回計算を行う。renderAccumulate は連携中なら取崩側の
// 計算・描画も内部で行うので、連携OFFで始まる場合だけここで補う
// （どちらの場合も renderWithdraw は1回しか呼ばれない）。
w.principal.disabled = isLinked;
linkedReadout.classList.toggle("active", isLinked);
renderAccumulate();
if (!isLinked) {
  renderWithdraw();
}
