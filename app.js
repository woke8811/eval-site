/* P1 #6 kilo-auto/free — 排行榜前端 app.js（无外部依赖）。
 * 数据从同目录 models.json 读取（框架 §4 schema）。
 * 画布：canvas 手绘六维雷达图；不依赖任何库。
 */
(function () {
  const MODELS_URL = "models.json";

  const DIM_KEYS = ["d1", "d2", "d3", "d4", "d5", "d6"];
  const DIM_LABELS = ["D1 指令遵循", "D2 推理代码", "D3 长上下文", "D4 工具调用", "D5 速度稳定", "D6 性价比"];
  const DIM_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2"];

  const SCEN_KEYS = ["writing", "coding", "agent", "freeride"];
  const SCEN_LABELS = ["写作创作", "编程", "Agent/自动化", "白嫖/预算"];

  let models = [];
  let bankHash = "—";

  async function main() {
    try {
      const res = await fetch(MODELS_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("models.json 读取失败：" + res.status);
      const data = await res.json();
      models = Array.isArray(data.models) ? data.models : Array.isArray(data) ? data : [];
      if (data.bank_hash) bankHash = data.bank_hash;
      else if (models[0] && models[0].bank_hash) bankHash = models[0].bank_hash;
    } catch (e) {
      console.error(e);
      document.getElementById("scores-table").textContent = "models.json 未就绪，请把它放在 leaderboard/ 与 index.html 同目录。";
      document.getElementById("bank-leaderboard").textContent = "—";
      document.getElementById("arena-leaderboard").textContent = "—";
      document.getElementById("bank-hash").textContent = "—";
      return;
    }
    renderAll();
  }

  /* ---------- 雷达图（canvas 手绘） ---------- */
  function drawRadar() {
    const canvas = document.getElementById("radar");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.parentElement.clientWidth || 640;
    const cssH = 320;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);
    const w = cssW, h = cssH;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(cx, cy) * 0.72;

    ctx.clearRect(0, 0, w, h);

    const n = DIM_KEYS.length;
    // 角度：从正上方开始顺时针
    function axisPt(i, ratio) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return { x: cx + Math.cos(ang) * r * ratio, y: cy + Math.sin(ang) * r * ratio };
    }

    // 同心圆（正六边形网格）+ 轴线
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e5e7eb";
    for (const ring of [20, 40, 60, 80, 100]) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const p = axisPt(i % n, ring / 100);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    for (let i = 0; i < n; i++) {
      const p = axisPt(i, 1);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      // 轴标签
      ctx.fillStyle = "#6b7280";
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lx = cx + Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n) * (r + 22);
      const ly = cy + Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / n) * (r + 22);
      ctx.fillText(DIM_LABELS[i], lx, ly);
    }

    // 绘制每个模型的雷达多边形（最多 6 条，避免太乱）
    const showModels = models.slice(0, 6);
    showModels.forEach((m, mi) => {
      const sd = m.six_dims || {};
      const pts = DIM_KEYS.map((k, i) => axisPt(i, (sd[k] || 0) / 100));
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = DIM_COLORS[mi % DIM_COLORS.length] + "22";
      ctx.fill();
      ctx.strokeStyle = DIM_COLORS[mi % DIM_COLORS.length];
      ctx.lineWidth = 2;
      ctx.stroke();
      // 顶点
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, 2 * Math.PI);
        ctx.fillStyle = DIM_COLORS[mi % DIM_COLORS.length];
        ctx.fill();
      });
    });

    // 图例
    const leg = document.getElementById("radar-legend");
    leg.innerHTML = "";
    showModels.forEach((m, mi) => {
      const span = document.createElement("span");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = DIM_COLORS[mi % DIM_COLORS.length];
      const txt = document.createTextNode(m.id + (m.sample ? " （sample）" : ""));
      span.appendChild(dot);
      span.appendChild(txt);
      leg.appendChild(span);
    });
  }

  /* ---------- 表格：模型分详情 ---------- */
  function avgSix(m) {
    const sd = m.six_dims || {};
    const vals = DIM_KEYS.map((k) => Number(sd[k]) || 0);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function freerideScore(m) {
    const sc = m.scenario || {};
    const s = Number(sc.freeride) || 0;
    return s;
  }

  function renderScoresTable() {
    const el = document.getElementById("scores-table");
    const rows = models.slice().sort((a, b) => avgSix(b) - avgSix(a));
    let html =
      '<table><thead><tr><th>模型</th><th>六维均分</th>' +
      DIM_KEYS.map((k) => "<th>" + DIM_LABELS[DIM_KEYS.indexOf(k)] + "</th>").join("") +
      '<th style="width:72px;">四场景最高</th>' +
      '<th style="width:72px;">白嫖分</th>' +
      '<th style="width:72px;">样例</th></tr></thead><tbody>';
    rows.forEach((m) => {
      const sd = m.six_dims || {};
      const sc = m.scenario || {};
      const scenVals = SCEN_KEYS.map((k) => Number(sc[k]) || 0);
      const scenBest = Math.max(...scenVals).toFixed(0);
      const fr = freerideScore(m);
      const sampleTag = m.sample ? '<span class="tag-sample">sample</span>' : "—";
      html += "<tr>";
      html += "<td><b>" + escapeHtml(m.id) + "</b></td>";
      html += "<td>" + avgSix(m).toFixed(1) + "</td>";
      DIM_KEYS.forEach((k) => (html += "<td>" + (Number(sd[k]) || 0) + "</td>"));
      html += "<td>" + scenBest + "</td>";
      html += "<td style='color:#059669;font-weight:600;'>" + fr + "</td>";
      html += "<td>" + sampleTag + "</td>";
      html += "</tr>";
    });
    html += "</tbody></table>";
    el.innerHTML = html;
  }

  /* ---------- 双轨榜单：题库榜 + 社区榜（两套分不混算） ---------- */
  function renderLeaderboards() {
    // 题库榜：按六维均分
    const bank = models.slice().sort((a, b) => avgSix(b) - avgSix(a));
    // 社区榜：按 arena 胜率（arena_wins/(wins+losses)）
    const arena = models.slice().sort((a, b) => arenaRate(b) - arenaRate(a));

    function listEl(title, items, valueFn, fmt) {
      let h = '<div class="muted" style="font-size:11px;margin-bottom:6px;">' + title + "</div><table>";
      h += "<thead><tr><th style='width:34px;'>#</th><th>模型</th><th style='width:110px;'>分数</th></tr></thead><tbody>";
      items.forEach((m, i) => {
        const tag = m.sample ? ' <span class="tag-sample">sample</span>' : "";
        h += "<tr><td>" + (i + 1) + "</td><td><b>" + escapeHtml(m.id) + "</b>" + tag + "</td><td>" + fmt(valueFn(m)) + "</td></tr>";
      });
      h += "</tbody></table>";
      return h;
    }

    document.getElementById("bank-leaderboard").innerHTML = listEl(
      "题库榜（六维均分，严肃分）",
      bank,
      avgSix,
      (v) => v.toFixed(1)
    );
    document.getElementById("arena-leaderboard").innerHTML = listEl(
      "社区榜（对战胜率，娱乐分）",
      arena,
      arenaRate,
      (v) => (v * 100).toFixed(0) + "%"
    );
  }

  function arenaRate(m) {
    const w = Number(m.arena_wins) || 0;
    const l = Number(m.arena_losses) || 0;
    const t = w + l;
    return t ? w / t : 0;
  }

  function renderModelList() {
    const el = document.getElementById("model-list");
    let h = "<ul style='padding:0;margin:0;list-style:none;font-size:12px;'>";
    models.forEach((m) => {
      h += "<li style='padding:4px 0;border-bottom:1px solid #f0f2f5;'>";
      h += "<b>" + escapeHtml(m.id) + "</b>" + (m.sample ? ' <span class="tag-sample">sample</span>' : "");
      h += "</li>";
    });
    h += "</ul>";
    el.innerHTML = h;
  }

  function renderSponsor() {
    const el = document.getElementById("sponsor-slot");
    el.innerHTML =
      '<div style="font-size:12px;"><b style="color:#d97706;">赞助</b> 位（厂商邀请赛 / 赛季冠名预留）</div>' +
      '<div class="neutral" style="margin-top:4px;">中立五规第 4 条：显式标注「赞助」，不进入任何分数计算。</div>';
  }

  function renderBankHash() {
    document.getElementById("bank-hash").textContent = bankHash;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderAll() {
    drawRadar();
    renderScoresTable();
    renderLeaderboards();
    renderModelList();
    renderSponsor();
    renderBankHash();
  }

  window.addEventListener("resize", drawRadar);
  main();
})();
