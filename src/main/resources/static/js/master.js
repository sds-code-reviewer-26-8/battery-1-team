(() => {
	const root = document.getElementById('masterForm');
	const flash = document.getElementById('flash');

	const num = (name, value, attrs) => h('input', {type: 'number', min: '1', name, value, ...attrs});

	function render(data) {
		const f = data.form;
		const factories = h('section', {class: 'card'}, h('h2', null, '공장'),
			h('table', {class: 'grid'},
				h('thead', null, h('tr', null, h('th', null, '나라'), h('th', null, '하루 최대 생산량(K)'),
					h('th', null, '재고 상한(K)'), h('th', null, '셀당 원가(원)'))),
				h('tbody', null, data.factories.map(c => h('tr', null, h('td', null, c.label),
					h('td', null, num('maxDaily_' + c.name, f['maxDaily_' + c.name])),
					h('td', null, num('stockLimit_' + c.name, f['stockLimit_' + c.name])),
					h('td', null, num('unitCost_' + c.name, f['unitCost_' + c.name])))))));

		const ships = h('section', {class: 'card'}, h('h2', null, '선박'),
			h('div', {class: 'row'},
				h('label', null, '배 척수 (1~4) ', num('shipCount', f.shipCount, {max: '4'})),
				h('label', null, '척당 일 운항비(억 원) ',
					h('input', {type: 'text', inputmode: 'decimal', name: 'shipDailyCost', value: f.shipDailyCost}))));

		const cs = data.countries;
		const routes = h('section', {class: 'card'}, h('h2', null, '항로 (항해 일수, 양방향 동일)'),
			h('table', {class: 'grid matrix'},
				h('thead', null, h('tr', null, h('th'), cs.slice(1).map(c => h('th', null, c.label)))),
				h('tbody', null, cs.slice(0, -1).map((a, ai) => h('tr', null, h('th', null, a.label),
					cs.slice(1).map((b, k) => {
						const bi = k + 1;
						if (bi <= ai) return h('td', null, h('span', {class: 'muted'}, '-'));
						const name = 'days_' + a.name + '_' + b.name;
						return h('td', null, num(name, f[name]));
					}))))));

		root.replaceChildren(factories, ships, routes, h('button', {type: 'submit', class: 'primary'}, '저장'));
	}

	async function load(message) {
		try {
			render(await getJson('/api/master/form'));
			flash.replaceChildren();
			if (message) flash.append(h('p', {class: 'alert ok'}, message));
		} catch (e) {
			flash.replaceChildren(h('p', {class: 'alert error'}, e.message));
		}
	}

	root.addEventListener('submit', async e => {
		e.preventDefault();
		const res = await fetch('/master', {method: 'POST', body: new URLSearchParams(new FormData(root))});
		if (res.status === 401) {
			location.href = '/login';
			return;
		}
		if (res.redirected) {
			await load('마스터 데이터를 저장했습니다');
			return;
		}
		let data = null;
		try {
			data = await res.json();
		} catch (x) { /* 본문 없음 */ }
		const errors = (data && data.errors) || ['저장에 실패했습니다'];
		flash.replaceChildren(h('div', {class: 'alert error'}, h('strong', null, '저장하지 않았습니다. 아래 값을 확인하세요.'),
			h('ul', null, errors.map(m => h('li', null, m)))));
	});

	load();
})();
