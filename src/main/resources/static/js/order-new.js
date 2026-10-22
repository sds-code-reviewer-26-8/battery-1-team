(function () {
	const totalInput = document.getElementById('total');
	const gaugesEl = document.getElementById('gauges');
	const inputError = document.getElementById('inputError');
	const runBtn = document.getElementById('runBtn');
	const resultEl = document.getElementById('result');
	const optionsEl = document.getElementById('options');
	const confirmBtn = document.getElementById('confirmBtn');
	const confirmError = document.getElementById('confirmError');

	let master = null;                 // 게이지 옆 방문 횟수 표시용
	let values = {};                   // 나라별 주문 수량(K)
	let total = parseInt(totalInput.value, 10) || 12000;
	let result = null;                 // 마지막 시뮬레이션 결과
	let selected = 'COST';
	let anim = null;
	const asap = document.getElementById('asap');
	const dueWrap = document.getElementById('dueWrap');
	const dueInput = document.getElementById('dueDays');
	const dueError = document.getElementById('dueError');
	let dueRule = null;                // 서버가 알려주는 납기 범위·문구 (로딩 전에는 체크박스를 막는다)
	asap.disabled = true;

	// ---- 게이지

	function even(sum) {
		const base = Math.floor(sum / FACTORY_ORDER.length);
		let rest = sum - base * FACTORY_ORDER.length;
		const v = {};
		FACTORY_ORDER.forEach(c => {
			v[c] = base + (rest > 0 ? 1 : 0);
			if (rest > 0) rest--;
		});
		return v;
	}

	function buildGauges() {
		gaugesEl.innerHTML = FACTORY_ORDER.map(c => `
			<div class="gauge" data-c="${c}">
				<input type="number" class="gnum" min="0" step="1">
				<input type="range" class="grange" min="0" step="1" orient="vertical">
				<div class="gname">${COUNTRY_LABEL[c]}</div>
				<div class="gvisits"></div>
			</div>`).join('');
		gaugesEl.querySelectorAll('.gauge').forEach(g => {
			const c = g.dataset.c;
			g.querySelector('.grange').addEventListener('input', e => move(c, parseInt(e.target.value, 10)));
			g.querySelector('.gnum').addEventListener('change', e => {
				const v = parseInt(e.target.value, 10);
				move(c, isNaN(v) ? values[c] : v);
			});
		});
		refreshGauges();
	}

	/** c 의 수량을 바꾸면 바로 오른쪽 나라가 반대로 조정된다(맨 오른쪽은 맨 왼쪽). 합계는 그대로. */
	function move(c, wanted) {
		const i = FACTORY_ORDER.indexOf(c);
		const neighbor = FACTORY_ORDER[(i + 1) % FACTORY_ORDER.length];
		const pair = values[c] + values[neighbor];
		const next = Math.max(0, Math.min(pair, wanted));
		values[c] = next;
		values[neighbor] = pair - next;
		refreshGauges();
		invalidate();
	}

	function refreshGauges() {
		gaugesEl.querySelectorAll('.gauge').forEach(g => {
			const c = g.dataset.c;
			g.querySelector('.gnum').value = values[c];
			const range = g.querySelector('.grange');
			range.max = total;
			range.value = values[c];
			const f = master && master.factories.find(x => x.country === c);
			g.querySelector('.gvisits').textContent = f && values[c] > 0
				? `방문 ${Math.ceil(values[c] / f.stockLimit)}회` : '방문 0회';
		});
	}

	totalInput.addEventListener('change', () => {
		const v = parseInt(totalInput.value, 10);
		if (!(v >= 1)) {
			totalInput.value = total;
			return;
		}
		total = v;
		values = even(total);
		refreshGauges();
		invalidate();
	});

	/** 입력이 바뀌면 이전 시뮬레이션 결과는 더 이상 이 입력의 결과가 아니다 */
	function invalidate() {
		result = null;
		resultEl.hidden = true;
		inputError.hidden = true;
	}

	// ---- 납기일 (초과 표시에 쓰고, 선택했으면 확정 시 함께 저장한다)

	/** 적용할 납기일(일). 체크가 꺼져 있거나 서버가 정한 범위를 벗어나면 null */
	function dueLimit() {
		if (!asap.checked || !dueRule) return null;
		const v = Number(dueInput.value);
		return Number.isInteger(v) && v >= dueRule.min && v <= dueRule.max ? v : null;
	}

	/** 이미 그려진 결과에 납기 초과 표시만 다시 입힌다(시뮬레이션·애니메이션은 그대로) */
	function applyDue() {
		const limit = dueLimit();
		if (asap.checked && limit === null) {
			showError(dueError, dueRule.message);
		} else {
			dueError.hidden = true;
		}
		if (!result) return;
		optionsEl.querySelectorAll('.option').forEach(b => {
			const o = result.options.find(x => x.type === b.dataset.type);
			const over = limit !== null && o.totalDays > limit;
			b.classList.toggle('over-due', over);
			const note = b.querySelector('.due-note');
			if (note) note.remove();
			if (over) {
				const span = document.createElement('span');
				span.className = 'due-note';
				span.textContent = `납기 ${o.totalDays - limit}일 초과`;
				b.appendChild(span);
			}
		});
		const plan = result.options.find(o => o.type === selected);
		document.querySelectorAll('#summary .stats b').forEach(b => {
			if (b.previousElementSibling && b.previousElementSibling.textContent === '소요 일수') {
				b.classList.toggle('over-due', limit !== null && plan.totalDays > limit);
			}
		});
	}

	asap.addEventListener('change', () => {
		dueWrap.hidden = !asap.checked;
		applyDue();
	});
	dueInput.addEventListener('input', applyDue);

	// ---- 시뮬레이션

	function showError(el, msg) {
		el.textContent = msg;
		el.hidden = false;
	}

	runBtn.addEventListener('click', async () => {
		inputError.hidden = true;
		confirmError.hidden = true;
		runBtn.disabled = true;
		try {
			result = await postJson('/api/simulate', {orders: values});
			master = result.master;
			refreshGauges();
			selected = 'COST';
			renderResult(true);
			resultEl.hidden = false;
			resultEl.scrollIntoView({behavior: 'smooth', block: 'start'});
		} catch (e) {
			result = null;
			resultEl.hidden = true;
			showError(inputError, e.message);
		} finally {
			runBtn.disabled = false;
		}
	});

	function currentStored() {
		const plan = result.options.find(o => o.type === selected);
		return {master: result.master, orders: result.orders, visits: result.visits, plan};
	}

	function renderResult(first) {
		optionsEl.innerHTML = result.options.map(o => `
			<button type="button" class="option ${o.type === selected ? 'selected' : ''}" data-type="${o.type}">
				<strong>${o.label}</strong>
				<span>소요 ${o.totalDays}일</span>
				<span>총 비용 ${eok(o.totalCost)}억원</span>
				<span class="muted">운항비 ${eok(o.shippingCost)}억원 · 운영비 ${o.operatingCost == null ? '-' : eok(o.operatingCost) + '억원'} · 배 ${o.ships.length}척</span>
			</button>`).join('');
		optionsEl.querySelectorAll('.option').forEach(b => b.addEventListener('click', () => {
			selected = b.dataset.type;
			renderResult(false);
		}));

		const stored = currentStored();
		PlanView.renderSummary(document.getElementById('summary'), stored);
		PlanView.renderDetails(document.getElementById('details'), stored);
		applyDue();
		const animRoot = document.getElementById('anim');
		if (!anim) {
			anim = BatteryAnim.mount(animRoot, stored, {autoplay: true});
		} else {
			anim.update(stored, true);
		}
	}

	// ---- 주문 확정

	confirmBtn.addEventListener('click', async () => {
		if (!result) return;
		confirmError.hidden = true;
		if (asap.checked && dueLimit() === null) {
			showError(confirmError, dueRule.message);
			return;
		}
		const limit = dueLimit();
		const plan = result.options.find(o => o.type === selected);
		if (limit !== null && plan && plan.totalDays > limit
				&& !window.confirm(`납기를 ${plan.totalDays - limit}일 초과합니다. 확정할까요?`)) {
			return;
		}
		confirmBtn.disabled = true;
		try {
			const res = await postJson('/api/orders', {
				orders: values,
				routeType: selected,
				masterVersion: result.master.version,
				memo: document.getElementById('memo').value,
				dueDays: dueLimit(),
				customerName: document.getElementById('customerName').value
			});
			location.href = '/orders/' + res.id;
		} catch (e) {
			showError(confirmError, e.message);
			confirmBtn.disabled = false;
		}
	});

	// ---- 시작

	values = even(total);
	buildGauges();
	fetch('/api/orders/due-rule').then(r => r.json()).then(rule => {
		dueRule = rule;
		dueInput.min = rule.min;
		dueInput.max = rule.max;
		dueInput.value = rule.min;
		asap.disabled = false;
	}).catch(() => { /* 범위를 못 받으면 납기 체크박스는 막아 둔다 */ });
	fetch('/api/master').then(r => r.json()).then(m => {
		master = m;
		refreshGauges();
	}).catch(() => { /* 방문 횟수 표시만 비어 있게 둔다 */ });
})();
