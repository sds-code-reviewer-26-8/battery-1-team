#!/usr/bin/env python3
"""JMeter .jtl(CSV)를 읽어 HTML 을 만든다. 표준 라이브러리만 쓴다.

실행 하나:  report.py run result.jtl <라벨>.html --plan perf-baseline --label run --round 01 --args "-Jduration=60"
차수 전체:  report.py index docs/jmeter/round-01 docs/jmeter/round-01/index.html
(index 는 run 이 각 HTML 에 심어 둔 요약 JSON 을 읽으므로 .jtl 이 없어도 다시 만들 수 있다.)
"""
import json
import re
import argparse
import csv
import html
from collections import Counter, defaultdict
from datetime import datetime

READ_LABELS = {"simulate", "orders-list", "order-detail"}
WRITE_LABELS = {"confirm"}
AUX = {"로그인", "경합 판정", "경합 후 이력", "이력 판정"}  # 보조·판정용 샘플(측정 통계·산점도에서 제외)
P95_READ_MS = 500   # 제안, 확인 필요 (docs/jmeter/구성안.md 6절)
P95_WRITE_MS = 1000
STRESS_ERR_RATE = 1.0  # %

PLAN_TITLE = {
	"perf-baseline": "성능 테스트 (기준선)",
	"stress-step": "스트레스 테스트 (단계별)",
	"stress-concurrency": "동시성 경합 테스트",
}


def pct(sorted_vals, p):
	if not sorted_vals:
		return 0
	k = max(0, min(len(sorted_vals) - 1, round(p / 100 * len(sorted_vals) + 0.5) - 1))
	return sorted_vals[k]


def load(path):
	rows = []
	with open(path, newline="", encoding="utf-8") as f:
		for r in csv.DictReader(f):
			if r["threadName"].startswith("[setUp]"):
				continue  # 시드·준비 단계는 측정에서 제외
			rows.append({
				"t": int(r["timeStamp"]) / 1000, "ms": int(r["elapsed"]), "label": r["label"],
				"code": r["responseCode"], "msg": r["responseMessage"], "ok": r["success"] == "true",
				"threads": int(r["allThreads"]),
			})
	return rows


def stats(rows):
	by = defaultdict(list)
	for r in rows:
		by[r["label"]].append(r)
	out = {}
	for label, rs in by.items():
		ms = sorted(r["ms"] for r in rs)
		span = max(r["t"] + r["ms"] / 1000 for r in rs) - min(r["t"] for r in rs)
		out[label] = {
			"n": len(rs), "err": sum(1 for r in rs if not r["ok"]),
			"avg": sum(ms) / len(ms), "min": ms[0], "max": ms[-1],
			"p90": pct(ms, 90), "p95": pct(ms, 95), "p99": pct(ms, 99),
			"tps": len(rs) / span if span > 0 else 0,
			"codes": Counter(r["code"] for r in rs),
		}
	return out


def e(s):
	return html.escape(str(s))


def scatter(label, rs, t0, warm):
	"""요청 하나의 응답시간 산점도(SVG). 실패는 ✕, 앞쪽 워밍업 구간은 옅게 칠한다."""
	W, H, L, B, T = 440, 200, 44, 26, 22
	tmax = max(r["t"] - t0 for r in rs) or 1
	ymax = max(r["ms"] for r in rs) or 1
	step = max(1, len(rs) // 1200)
	pts = rs[::step] + [r for r in rs if not r["ok"]][:200]
	x = lambda t: L + (t / tmax) * (W - L - 8)
	y = lambda v: H - B - (v / ymax) * (H - B - T)
	s = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{e(label)} 응답시간 산점도">']
	for i in range(5):
		v = ymax * i / 4
		s.append(f'<line class="grid" x1="{L}" x2="{W - 8}" y1="{y(v):.1f}" y2="{y(v):.1f}"/>'
				f'<text class="tick" x="{L - 6}" y="{y(v) + 4:.1f}" text-anchor="end">{v:.0f}</text>')
	if tmax > warm:
		s.append(f'<rect class="warm" x="{L}" y="{T}" width="{x(warm) - L:.1f}" height="{H - B - T}"/>')
	for r in pts:
		cx, cy = x(r["t"] - t0), y(r["ms"])
		tip = f'{r["t"] - t0:.1f}s · {r["ms"]}ms · {r["code"]}'
		if r["ok"]:
			s.append(f'<circle class="dot" cx="{cx:.1f}" cy="{cy:.1f}" r="2.6"><title>{e(tip)}</title></circle>')
		else:
			s.append(f'<path class="bad" d="M{cx - 3.5:.1f} {cy - 3.5:.1f}l7 7m0 -7l-7 7"><title>{e(tip)} (실패)</title></path>')
	s.append(f'<text class="tick" x="{L}" y="{H - 8}">0s</text><text class="tick" x="{W - 8}" y="{H - 8}" text-anchor="end">{tmax:.0f}s</text>')
	s.append(f'<text class="tick" x="{L}" y="12">ms</text></svg>')
	return "".join(s)


def timeline(rows, t0):
	"""10초 구간별 요청 수(막대)와 오류 수."""
	bins = defaultdict(lambda: [0, 0])
	for r in rows:
		b = int((r["t"] - t0) // 10)
		bins[b][0] += 1
		bins[b][1] += 0 if r["ok"] else 1
	n = max(bins) + 1
	span = max(r["t"] + r["ms"] / 1000 for r in rows) - t0
	W, H, L, B, T = 920, 200, 44, 26, 22
	width = lambda b: min(10, span - b * 10) if b == n - 1 else 10
	width = lambda b, f=width: max(f(b), 1)
	ymax = max(bins[b][0] / width(b) for b in bins) or 1
	bw = (W - L - 8) / n
	s = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="10초 구간별 Throughput과 오류">']
	for i in range(5):
		v = ymax * i / 4
		yy = H - B - (v / ymax) * (H - B - T)
		s.append(f'<line class="grid" x1="{L}" x2="{W - 8}" y1="{yy:.1f}" y2="{yy:.1f}"/><text class="tick" x="{L - 6}" y="{yy + 4:.1f}" text-anchor="end">{v:.0f}</text>')
	for b in range(n):
		c, er = bins.get(b, [0, 0])
		h = (c / width(b)) / ymax * (H - B - T)
		xx = L + b * bw
		s.append(f'<rect class="bar" x="{xx + 1:.1f}" y="{H - B - h:.1f}" width="{max(bw - 2, 1):.1f}" height="{h:.1f}" rx="2"><title>{b * 10}–{b * 10 + 10}s · {c / width(b):.1f} req/s · 오류 {er}건</title></rect>')
		if er:
			s.append(f'<text class="errmark" x="{xx + bw / 2:.1f}" y="{H - B - h - 4:.1f}" text-anchor="middle">✕{er}</text>')
	s.append(f'<text class="tick" x="{L}" y="{H - 8}">0s</text><text class="tick" x="{W - 8}" y="{H - 8}" text-anchor="end">{n * 10}s</text><text class="tick" x="{L}" y="12">req/s</text></svg>')
	return "".join(s)


def verdicts(plan, st, rows):
	"""(이름, 기준, 측정값, 통과 여부)"""
	v = []
	target = {k: s for k, s in st.items() if k not in AUX}
	total = sum(s["n"] for s in target.values())
	err = sum(s["err"] for s in target.values())
	rate = err / total * 100 if total else 0
	if plan == "perf-baseline":
		v.append(("오류율", "0%", f"{rate:.2f}% ({err}/{total})", err == 0))
		for k, s in sorted(target.items()):
			limit = P95_WRITE_MS if k in WRITE_LABELS else P95_READ_MS
			v.append((f"{k} p95", f"≤ {limit}ms", f"{s['p95']}ms", s["p95"] <= limit))
	elif plan == "stress-step":
		peak = max((r["threads"] for r in rows), default=0)
		v.append(("최대 동시 사용자", "기록용", f"{peak}명", True))
		v.append(("오류율", f"≤ {STRESS_ERR_RATE:g}% 이면 한계 미도달", f"{rate:.2f}% ({err}/{total})", rate <= STRESS_ERR_RATE))
		for k, s in sorted(target.items()):
			v.append((f"{k} p95", "기록용", f"{s['p95']}ms", True))
	else:
		crit = {"경합 판정": "성공 1건, 나머지 409", "이력 판정": "이력 2건(확정 + 진행)"}
		for k in ("경합 판정", "이력 판정"):
			if k in st:
				msg = next((r["msg"] for r in rows if r["label"] == k), "")
				v.append((k, crit[k], msg or ("OK" if st[k]["err"] == 0 else "실패"), st[k]["err"] == 0))
		race = [r for r in rows if r["label"] == "status-race"]
		five = sum(1 for r in race if r["code"].startswith("5"))
		v.append(("경합 중 5xx", "0건", f"{five}건", five == 0))
	return v


CSS = """
:root{color-scheme:light;--bg:#f4f6fb;--card:#fff;--panel:#fff;--ink:#1b2333;--ink2:#667189;--muted:#667189;--line:#e2e7f1;--accent:#2f5bea;
--ok:#0f7a58;--ok-bg:#e1f5ec;--warn:#9a5208;--warn-bg:#fdefd8;--bad:#b3212f;--bad-bg:#fde7ea;--info-bg:#e9efff;
--grid:#e1e0d9;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--warm:rgba(42,120,214,.07);
--shadow:0 1px 2px rgba(20,30,60,.06),0 10px 28px rgba(20,30,60,.07)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--bg:#0e131f;--card:#161d2d;--panel:#161d2d;--ink:#e7ebf4;--ink2:#93a0ba;--muted:#93a0ba;--line:#26304a;--accent:#8aa8ff;
--ok:#63d6a9;--ok-bg:#12342b;--warn:#f1b660;--warn-bg:#3a2b13;--bad:#ff8c9a;--bad-bg:#3e1b22;--info-bg:#1c2745;--grid:#2c2c2a;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--warm:rgba(57,135,229,.10);--shadow:none}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 "맑은 고딕","Segoe UI",system-ui,-apple-system,"Noto Sans KR",sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:32px 20px 72px}
.hero{border-radius:22px;padding:30px 32px;box-shadow:var(--shadow);color:#fff;background:linear-gradient(135deg,#0c4a3a 0%,#0f7a58 60%,#34b58a 100%)}
.hero.fail{background:linear-gradient(135deg,#6e1420 0%,#b3212f 60%,#e5707c 100%)}
.hero .meta{font-size:13px;opacity:.88}
.hero h1{margin:8px 0 16px;font-size:27px;line-height:1.3;font-weight:800}
.hero p{margin:14px 0 0}
.hero a{color:#fff}
.badge{display:inline-flex;align-items:center;gap:7px;font-weight:800;font-size:13px;padding:6px 14px;border-radius:999px;background:#fff;color:#0f7a58}
.hero.fail .badge{color:#b3212f}
.badge .dot{width:9px;height:9px;border-radius:50%;background:currentColor}
.chip.type{background:rgba(255,255,255,.2);color:#fff;margin-left:8px;font-size:12px;padding:5px 12px}
h2{margin:34px 0 14px;font-size:18px;display:flex;align-items:center;gap:10px}
h2 .no{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;background:var(--accent);color:#fff;font-size:13px;font-weight:800}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 22px;box-shadow:var(--shadow);overflow-x:auto}
.stack{display:grid;gap:14px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.step{position:relative;padding-top:24px;overflow:visible}
.step .tag{position:absolute;top:-12px;left:18px;font-size:12px;font-weight:800;color:#fff;background:var(--accent);padding:3px 12px;border-radius:999px}
.step ul{margin:4px 0;padding-left:20px}
.chip{display:inline-block;font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;white-space:nowrap}
.chip.pass{background:var(--ok-bg);color:var(--ok)}.chip.fail{background:var(--bad-bg);color:var(--bad)}
.chip.warn{background:var(--warn-bg);color:var(--warn)}.chip.skip{background:var(--line);color:var(--muted)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;text-align:center;box-shadow:var(--shadow)}
.tile b{display:block;font-size:28px;font-variant-numeric:tabular-nums}.tile span{color:var(--muted);font-size:13px}
.tile.ok b{color:var(--ok)}.tile.bad b{color:var(--bad)}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:14px}
th,td{padding:8px 10px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
th:first-child,td:first-child{text-align:left}th{color:var(--muted);font-weight:800;font-size:12px}
tr.aux td{color:var(--muted)}td.l,th.l{text-align:left;white-space:normal}
td a,.back{color:var(--accent);text-decoration:none;font-weight:700}td a:hover,.back:hover{text-decoration:underline}
.pass{color:var(--ok);font-weight:800}.fail{color:var(--bad);font-weight:800}
.callout{border-radius:10px;padding:12px 16px;background:var(--info-bg);margin:0 0 14px}
.todo{border-radius:10px;padding:10px 14px;background:var(--warn-bg)}
.lbl{font-size:12px;font-weight:800;color:var(--muted);margin:16px 0 6px}
.concl{font-size:17px;font-weight:700;margin:8px 0 0}
ul.plain{margin:4px 0;padding-left:20px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:14px}
.cap{font-weight:800;margin:0 0 4px}.cap small{color:var(--muted);font-weight:400}
svg{width:100%;height:auto;display:block}
.grid{stroke:var(--grid)}.tick{fill:var(--ink2);font-size:10px}.dot{fill:var(--s1);fill-opacity:.55}.bar{fill:var(--s1)}
.bad{stroke:var(--bad);stroke-width:2;fill:none}.errmark{fill:var(--bad);font-size:10px;font-weight:700}.warm{fill:var(--warm)}
.legend{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 6px;font-size:13px;color:var(--muted)}
.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}
.note{color:var(--muted);font-size:13px;margin-top:8px}
details{margin-top:14px}summary{cursor:pointer;font-weight:800}
footer{text-align:center;color:var(--muted);font-size:12px;margin-top:40px}
@media (max-width:760px){.steps{grid-template-columns:1fr}.grid2{grid-template-columns:1fr}}
"""

PLAN_INFO = {
	"perf-baseline": ("기능 점검", "정상 수준의 부하에서 응답시간 기준선을 잰다",
		"읽기 혼합과 확정 흐름 사용자를 함께 투입하고, 요청 사이에 2~4초 쉬면서 일정 시간 반복한다"),
	"stress-step": ("한계 탐색", "사용자를 단계별로 늘려 느려지거나 오류가 나는 지점을 찾는다",
		"simulate → 주문 목록 → 주문 상세를 대기 없이 반복한다. 단계마다 서버를 새로 띄운다"),
	"stress-concurrency": ("동시성", "같은 주문을 동시에 바꿀 때 한 명만 성공하는지 확인한다",
		"확정 100건을 동시에 보낸 뒤, 같은 주문·같은 version으로 상태 변경 100건을 동시에 보낸다"),
}
WHAT_NEXT = {
	"perf-baseline": "오류 없이 위로 튀는 구간이 산점도에 있으면 JFR(build/jmeter/…/server.jfr)로 서버 내부를 확인하세요. 부하를 올린 기준선이 필요하면 -JreadThreads, -JwriteThreads로 다시 실행합니다.",
	"stress-step": "차수 요약(index.html)에서 단계 간 추이를 비교하세요. 처리량이 가장 높은 단계 아래쪽에 한계가 있으므로 그 구간의 단계를 더 잘게 나눠 다시 실행합니다.",
	"stress-concurrency": "성공이 1건이 아니거나 5xx가 있으면 낙관적 락(OrderService) 결함을 의심하세요.",
}
NOTES = ["서버와 JMeter가 같은 PC에서 돌아 CPU를 나눠 씁니다. 절대 성능이 아니라 기준선·상대 비교로만 읽으세요.",
	"인메모리 DB(19080 포트)라 파일 DB와 성능이 다를 수 있습니다.",
	"기준값(오류율 0%, 읽기 p95 500ms, 확정 p95 1,000ms)은 근거 없는 제안값이라 확인이 필요합니다."]


def page(title, hero, body):
	return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
		f'<title>{e(title)}</title><style>{CSS}{EXTRA_CSS}</style></head><body><div class="wrap">{hero}{body}'
		f'<footer>JMeter 성능·스트레스 테스트 리포트 · 자세한 사용법은 docs/jmeter/README.md</footer></div></body></html>')


def hero(meta, title, ok, chip, line, extra=""):
	return (f'<div class="hero{"" if ok else " fail"}"><div class="meta">{meta}</div><h1>{e(title)}</h1>'
		f'<span class="badge"><span class="dot"></span>{"PASS · 모든 기준 충족" if ok else "FAIL · 미충족 항목 있음"}</span><span class="chip type">{e(chip)}</span>'
		f'<p>{line}</p>{extra}</div>')


def sec(no, title, inner):
	return f'<h2><span class="no">{no}</span>{e(title)}</h2>{inner}'


def run_line(plan, total, err, tps, peak, st):
	target = {k: s for k, s in st.items() if k not in AUX}
	worst = max((s["p95"] for s in target.values()), default=0)
	if plan == "stress-concurrency":
		return f"동시 {peak}명이 같은 주문을 바꾸려 했고, 오류 {err}건. 결과는 아래 판정을 확인하세요."
	return f"동시 사용자 최대 {peak}명, 요청 {total:,}건 중 오류 {err}건. 전체 {tps:,.0f} req/s, 가장 느린 요청의 p95는 {worst:,}ms입니다."


def run_report(a):
	rows = load(a.jtl)
	if not rows:
		raise SystemExit("측정 결과가 비어 있습니다")
	t0 = min(r["t"] for r in rows)
	st = stats(rows)
	target = {k: s for k, s in st.items() if k not in AUX}
	total = sum(s["n"] for s in target.values())
	err = sum(s["err"] for s in target.values())
	dur = max(r["t"] + r["ms"] / 1000 for r in rows) - t0
	vs = verdicts(a.plan, st, rows)
	allpass = all(v[3] for v in vs)
	peak = max(r["threads"] for r in rows)
	summary = {
		"plan": a.plan, "label": a.label, "round": a.round, "args": a.args.strip(), "start": t0, "allpass": allpass,
		"total": total, "err": err, "tps": total / dur, "peak": peak, "dur": dur,
		"p95": {k: s["p95"] for k, s in target.items()}, "verdicts": [[n, c, v, ok] for n, c, v, ok in vs],
	}
	chip, goal, how = PLAN_INFO.get(a.plan, ("", "", ""))
	meta = f'{e(a.round)}차 · {e(a.label)} · {datetime.fromtimestamp(t0):%Y-%m-%d %H:%M} 실행 · <a class="back" style="color:#fff" href="index.html">← 차수 전체 요약</a>'
	h = [hero(meta, PLAN_TITLE.get(a.plan, a.plan), allpass, chip, run_line(a.plan, total, err, total / dur, peak, st)),
		f'<script type="application/json" id="summary">{json.dumps(summary, ensure_ascii=False).replace("</", "<\\\\/")}</script>']

	opt = f'<div class="lbl">실행 옵션</div><code>{e(a.args.strip())}</code>' if a.args.strip() else ""
	bad = [v for v in vs if not v[3]]
	h.append(sec(1, "한눈에 보는 요약", '<div class="steps">'
		f'<div class="card step"><span class="tag">목적</span><ul><li>{e(goal)}</li></ul></div>'
		f'<div class="card step"><span class="tag">실행</span><ul><li>{e(how)}</li><li>인메모리 DB(19080)에서 실행</li></ul>{opt}</div>'
		f'<div class="card step"><span class="tag">결과</span><ul><li>요청 {total:,}건, 오류 {err}건</li><li>기준 {len(vs) - len(bad)}/{len(vs)}개 충족</li><li>최대 {peak}명, {total / dur:,.1f} req/s</li></ul></div></div>'))

	rowsv = ['<div class="card"><table><tr><th>항목</th><th class="l">기준</th><th class="l">측정</th><th>판정</th></tr>']
	for name, crit, val, ok in vs:
		chip_html = '<span class="chip skip">기록</span>' if crit == "기록용" else ('<span class="chip pass">통과</span>' if ok else '<span class="chip fail">미달</span>')
		rowsv.append(f'<tr><td>{e(name)}</td><td class="l">{e(crit)}</td><td class="l"><b>{e(val)}</b></td><td>{chip_html}</td></tr>')
	rowsv.append('</table></div>')
	h.append(sec(2, "합격 기준 판정", "".join(rowsv) +
		'<p class="note">기준값은 제안값(근거 없음, 확인 필요)입니다. 스트레스는 오류율 1% 초과를 한계로 보고, 단계별 p95는 기록만 합니다. 경합 기준(성공 1건)만 코드 규칙에서 나온 값입니다.</p>'))

	tiles = ('<div class="tiles">'
		f'<div class="tile"><b>{total:,}</b><span>측정 요청 수</span></div>'
		f'<div class="tile {"ok" if err == 0 else "bad"}"><b>{err / total * 100 if total else 0:.2f}%</b><span>오류율 ({err:,}건)</span></div>'
		f'<div class="tile"><b>{total / dur:,.1f}</b><span>전체 req/s</span></div>'
		f'<div class="tile"><b>{peak}</b><span>최대 동시 Thread</span></div>'
		f'<div class="tile"><b>{dur:.0f}s</b><span>실행 시간</span></div></div>')
	tb = ['<div class="card"><table><tr><th>요청</th><th>건수</th><th>오류</th><th>평균</th><th>최소</th><th>최대</th><th>p90</th><th>p95</th><th>p99</th><th>req/s</th><th>응답 코드</th></tr>']
	for k in sorted(st, key=lambda k: (k in AUX, k)):
		s = st[k]
		codes = ", ".join(f"{c}×{n}" for c, n in sorted(s["codes"].items()))
		tb.append(f'<tr class="{"aux" if k in AUX else ""}"><td>{e(k)}{" (보조)" if k in AUX else ""}</td><td>{s["n"]:,}</td><td class="{"fail" if s["err"] else ""}">{s["err"]}</td>'
			f'<td>{s["avg"]:.0f}</td><td>{s["min"]}</td><td>{s["max"]}</td><td>{s["p90"]}</td><td>{s["p95"]}</td><td>{s["p99"]}</td><td>{s["tps"]:.1f}</td><td>{e(codes)}</td></tr>')
	tb.append('</table></div><p class="note">시간 단위는 ms. 시드·준비(setUp) 요청은 제외했습니다.</p>')
	h.append(sec(3, "핵심 수치", tiles + "".join(tb)))

	charts = ['<div class="card"><p class="cap">시간대별 Throughput <small>10초 구간, ✕는 오류</small></p>' + timeline(rows, t0) + '</div>',
		'<p class="note">아래 산점도는 점 하나가 요청 하나입니다. 옅은 파란 영역은 기동 직후 30초(워밍업)이고, 점에 마우스를 올리면 값이 보입니다. 오류 없이 위로 튀는 구간은 서버 내부(JFR)를 확인할 신호입니다.</p>',
		'<div class="grid2">']
	for k in sorted(target):
		rs = [r for r in rows if r["label"] == k]
		charts.append(f'<div class="card"><p class="cap">{e(k)} <small>{len(rs):,}건 · p95 {st[k]["p95"]}ms</small></p>{scatter(k, rs, t0, 30)}</div>')
	charts.append('</div>')
	h.append(sec(4, "그래프", "".join(charts)))

	concl = ("모든 기준을 충족했습니다." if allpass else "미충족 항목이 있습니다: " + ", ".join(f"{n}({v})" for n, c, v, ok in bad))
	h.append(sec(5, "결론", f'<div class="card"><span class="chip {"pass" if allpass else "fail"}">{"PASS" if allpass else "FAIL"}</span>'
		f'<p class="concl">{e(concl)}</p><div class="lbl">알아둘 점</div><ul class="plain">' + "".join(f"<li>{e(n)}</li>" for n in NOTES) + '</ul>'
		f'<div class="lbl">다음에 할 일</div><div class="todo">{e(WHAT_NEXT.get(a.plan, ""))}</div></div>'))
	with open(a.out, "w", encoding="utf-8") as f:
		f.write(page(f"{PLAN_TITLE.get(a.plan, a.plan)} 결과", "", "".join(h)))


EXTRA_CSS = ""

SERIES = ["simulate", "orders-list", "order-detail"]
SERIES_VAR = {"simulate": "--s1", "orders-list": "--s2", "order-detail": "--s3"}


def line_chart(title, pts_by_series, unit, direct_labels=True):
	"""x=동시 사용자 수, y=값. 시리즈별 선 + 끝점 직접 라벨 + 범례(HTML)."""
	W, H, L, R, T, B = 460, 230, 48, 70, 22, 30
	xs = sorted({x for pts in pts_by_series.values() for x, _ in pts})
	ymax = max((y for pts in pts_by_series.values() for _, y in pts), default=1) or 1
	xmax = max(xs) if xs else 1
	X = lambda v: L + (v / xmax) * (W - L - R)
	Y = lambda v: H - B - (v / ymax) * (H - B - T)
	s = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{e(title)}">']
	for i in range(5):
		v = ymax * i / 4
		s.append(f'<line class="grid" x1="{L}" x2="{W - R}" y1="{Y(v):.1f}" y2="{Y(v):.1f}"/><text class="tick" x="{L - 6}" y="{Y(v) + 4:.1f}" text-anchor="end">{v:,.0f}</text>')
	s.append(f'<text class="tick" x="{L}" y="12">{e(unit)}</text>')
	last = -99
	for x in xs:
		if X(x) - last >= 26:  # 가까운 눈금은 건너뛴다(점의 툴팁에는 값이 있다)
			s.append(f'<text class="tick" x="{X(x):.1f}" y="{H - 10}" text-anchor="middle">{x}</text>')
			last = X(x)
	s.append(f'<text class="tick" x="{W - R}" y="{H - 10}" text-anchor="end" dx="64">명</text>')
	label_ys = []
	for name, pts in pts_by_series.items():
		var = SERIES_VAR.get(name, "--s1")
		pts = sorted(pts)
		d = " ".join(f"{'M' if i == 0 else 'L'}{X(x):.1f} {Y(y):.1f}" for i, (x, y) in enumerate(pts))
		s.append(f'<path d="{d}" fill="none" stroke="var({var})" stroke-width="2"/>')
		for x, y in pts:
			s.append(f'<circle cx="{X(x):.1f}" cy="{Y(y):.1f}" r="4" fill="var({var})" stroke="var(--panel)" stroke-width="2"><title>{e(name)} · {x}명 · {y:,.0f} {e(unit)}</title></circle>')
		if direct_labels and pts:
			x, y = pts[-1]
			ly = Y(y) + 4
			while any(abs(ly - o) < 11 for o in label_ys):  # 끝점 라벨이 겹치면 아래로 민다
				ly += 11
			label_ys.append(ly)
			s.append(f'<text class="tick" x="{X(x) + 8:.1f}" y="{ly:.1f}">{e(name)}</text>')
	s.append("</svg>")
	return "".join(s)


def index_report(a):
	import glob
	import os
	runs = []
	for f in sorted(glob.glob(os.path.join(a.dir, "*.html"))):
		if os.path.basename(f) == "index.html":
			continue
		m = re.search(r'<script type="application/json" id="summary">(.*?)</script>', open(f, encoding="utf-8").read(), re.S)
		if m:
			d = json.loads(m.group(1).replace("<\\\\/", "</"))
			d["file"] = os.path.basename(f)
			runs.append(d)
	if not runs:
		raise SystemExit("요약이 담긴 실행 HTML 이 없습니다")
	order = {"perf-baseline": 0, "stress-step": 1, "stress-concurrency": 2}
	runs.sort(key=lambda d: (order.get(d["plan"], 9), d["peak"] if d["plan"] == "stress-step" else 0, d["start"]))
	rnd = runs[0]["round"]
	allpass = all(d["allpass"] for d in runs)
	steps = [d for d in runs if d["plan"] == "stress-step"]
	total = sum(d["total"] for d in runs)
	err = sum(d["err"] for d in runs)
	date = f'{datetime.fromtimestamp(min(d["start"] for d in runs)):%Y-%m-%d}'

	# 스트레스 단계에서 읽는 포인트를 계산한다
	facts = []
	if steps:
		best = max(steps, key=lambda d: d["tps"])
		facts.append(f'처리량은 <b>{best["peak"]}명 단계에서 가장 높고</b>({best["tps"]:,.0f} req/s) 그보다 사용자가 많아져도 처리량은 늘지 않습니다.')
		over = next((d for d in steps if any(v > P95_READ_MS for v in d["p95"].values())), None)
		if over:
			k, v = max(over["p95"].items(), key=lambda kv: kv[1])
			facts.append(f'읽기 p95가 {P95_READ_MS}ms(제안 기준)를 처음 넘는 단계는 <b>{over["peak"]}명</b>입니다({k} {v:,}ms).')
		else:
			facts.append(f'모든 스트레스 단계에서 읽기 p95가 {P95_READ_MS}ms 이하입니다.')
		worst = max(steps, key=lambda d: d["peak"])
		facts.append(f'가장 높은 단계({worst["peak"]}명)의 p95는 {max(worst["p95"].values()):,}ms입니다.')
		errsteps = [d for d in steps if d["err"]]
		facts.append("오류는 한 단계에서도 나오지 않았습니다." if not errsteps else f'오류가 난 단계: {", ".join(d["label"] for d in errsteps)}.')
	hero_line = (f'실행 {len(runs)}건, 요청 {total:,}건 중 오류 {err}건. ' + (facts[0] if facts else "")).replace("<b>", "").replace("</b>", "")
	meta = f'{e(rnd)}차 · {date} 실행 · 인메모리 DB(19080), 서버와 JMeter 같은 PC'
	h = [hero(meta, f"{rnd}차 성능·스트레스 테스트 요약", allpass, "종합", e(hero_line))]

	h.append(sec(1, "한눈에 보는 요약", '<div class="steps">'
		'<div class="card step"><span class="tag">목적</span><ul><li>서버가 사용자가 몰릴 때 얼마나 버티는지 기준선과 한계 위치를 잰다</li><li>같은 주문 동시 변경 시 한 명만 성공하는지 확인한다</li></ul></div>'
		f'<div class="card step"><span class="tag">실행</span><ul><li>성능 기준선 {sum(d["plan"] == "perf-baseline" for d in runs)}건</li><li>스트레스 {len(steps)}단계({", ".join(str(d["peak"]) for d in steps)}명)</li><li>동시성 경합 {sum(d["plan"] == "stress-concurrency" for d in runs)}건</li></ul></div>'
		f'<div class="card step"><span class="tag">결과</span><ul><li>요청 {total:,}건, 오류 {err}건</li><li>{sum(d["allpass"] for d in runs)}/{len(runs)}개 실행이 기준 충족</li>' + (f'<li>최고 {max(d["tps"] for d in steps):,.0f} req/s</li>' if steps else "") + '</ul></div></div>'))

	rowsx = ['<div class="card"><table><tr><th>실행</th><th class="l">plan</th><th>동시 Thread</th><th>요청 수</th><th>오류율</th><th>req/s</th><th class="l">p95 (ms)</th><th>판정</th></tr>']
	for d in runs:
		p95 = ", ".join(f"{k} {v:,}" for k, v in sorted(d["p95"].items()))
		rate = d["err"] / d["total"] * 100 if d["total"] else 0
		rowsx.append(f'<tr><td><a href="{e(d["file"])}">{e(d["label"])}</a></td><td class="l">{e(PLAN_TITLE.get(d["plan"], d["plan"]))}</td><td>{d["peak"]}</td><td>{d["total"]:,}</td>'
			f'<td class="{"fail" if d["err"] else ""}">{rate:.2f}%</td><td>{d["tps"]:,.1f}</td><td class="l">{e(p95)}</td>'
			f'<td><span class="chip {"pass" if d["allpass"] else "fail"}">{"충족" if d["allpass"] else "미충족"}</span></td></tr>')
	rowsx.append('</table></div><p class="note">실행 이름을 누르면 상세 화면으로 이동합니다.</p>')
	h.append(sec(2, "실행 결과", "".join(rowsx)))

	if len(steps) >= 2:
		p95s = {k: [(d["peak"], d["p95"][k]) for d in steps if k in d["p95"]] for k in SERIES}
		tps = {"Throughput": [(d["peak"], d["tps"]) for d in steps]}
		legend = "".join(f'<span><i style="background:var({SERIES_VAR[k]})"></i>{k}</span>' for k in SERIES)
		h.append(sec(3, "스트레스 단계별 추이", '<div class="grid2">'
			f'<div class="card"><p class="cap">동시 사용자 수별 p95 응답시간 <small>(ms, 낮을수록 좋음)</small></p><div class="legend">{legend}</div>{line_chart("p95 응답시간", p95s, "ms")}</div>'
			f'<div class="card"><p class="cap">동시 사용자 수별 Throughput <small>(req/s)</small></p>{line_chart("Throughput", tps, "req/s", direct_labels=False)}</div></div>'
			'<p class="note">점에 마우스를 올리면 값이 보입니다.</p>'))

	bad = [(d["label"], n, c, v) for d in runs for n, c, v, ok in d["verdicts"] if not ok]
	concl = ['<div class="card">',
		f'<span class="chip {"pass" if allpass else "fail"}">{"PASS" if allpass else "FAIL"}</span>',
		f'<p class="concl">{"모든 실행이 합격 기준을 충족했습니다." if allpass else "기준에 못 미친 항목이 있습니다."}</p>',
		'<div class="lbl">읽을 점</div><ul class="plain">' + "".join(f"<li>{f}</li>" for f in facts) + '</ul>']
	if bad:
		concl.append('<div class="lbl">미충족 항목</div><table><tr><th>실행</th><th>항목</th><th class="l">기준</th><th>측정</th></tr>' + "".join(
			f'<tr><td>{e(l)}</td><td>{e(n)}</td><td class="l">{e(c)}</td><td class="fail">{e(v)}</td></tr>' for l, n, c, v in bad) + '</table>')
	concl.append('<div class="lbl">알아둘 점</div><ul class="plain">' + "".join(f"<li>{e(n)}</li>" for n in NOTES) + '</ul>')
	concl.append('<div class="lbl">다음에 할 일</div><div class="todo">처리량이 가장 높은 단계보다 낮은 사용자 수(예: 10~30명)를 추가해 한계를 더 정확히 찾고, 가장 느린 요청(주문 목록)은 JFR로 원인을 확인하세요. 쓰기(확정) 단독 스트레스는 아직 실행하지 않았습니다.</div></div>')
	h.append(sec(4 if len(steps) >= 2 else 3, "결론", "".join(concl)))

	h.append(sec(5 if len(steps) >= 2 else 4, "이 화면 읽는 법", '<div class="card"><ol class="plain">'
		'<li><b>상단 배지</b>: 모든 실행이 기준을 충족하면 PASS, 하나라도 못 미치면 FAIL입니다. 스트레스 단계의 p95는 기준 없이 기록만 해서 배지에 영향이 없습니다.</li>'
		'<li><b>실행 결과 표</b>: 한 줄이 한 번의 실행입니다. 동시 Thread는 그때 최대 사용자 수, p95는 요청의 95%가 끝난 시간(ms)입니다.</li>'
		'<li><b>추이 차트(왼쪽)</b>: 가로가 사용자 수, 세로가 p95입니다. 선이 가파르게 오르는 지점부터 서버가 느려지기 시작합니다.</li>'
		'<li><b>추이 차트(오른쪽)</b>: 사용자 수별 처리량입니다. 가장 높은 지점이 처리 한계에 가까운 곳이고, 그 뒤로 내려가거나 평평하면 사용자를 늘려도 처리량이 늘지 않습니다.</li>'
		'<li><b>상세 화면</b>: 요청별 평균·p95·p99·응답 코드, 시간대별 처리량, 응답시간 산점도입니다. 산점도의 ✕는 오류, 옅은 파란 영역은 기동 직후 30초(워밍업)입니다.</li></ol></div>'))
	with open(a.out, "w", encoding="utf-8") as f:
		f.write(page(f"{rnd}차 성능 테스트 요약", "", "".join(h)))


def main():
	ap = argparse.ArgumentParser()
	sub = ap.add_subparsers(dest="cmd", required=True)
	r = sub.add_parser("run")
	r.add_argument("jtl")
	r.add_argument("out")
	r.add_argument("--plan", default="")
	r.add_argument("--label", default="")
	r.add_argument("--round", default="")
	r.add_argument("--args", default="")
	r.set_defaults(fn=run_report)
	i = sub.add_parser("index")
	i.add_argument("dir")
	i.add_argument("out")
	i.set_defaults(fn=index_report)
	a = ap.parse_args()
	a.fn(a)


if __name__ == "__main__":
	main()
