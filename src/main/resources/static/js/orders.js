(async () => {
	const status = new URLSearchParams(location.search).get('status');
	const errorBox = document.getElementById('error');
	let data;
	try {
		data = await getJson('/api/orders' + (status ? '?status=' + encodeURIComponent(status) : ''));
	} catch (e) {
		errorBox.textContent = e.message;
		errorBox.hidden = false;
		return;
	}

	const filters = document.getElementById('filters');
	filters.append(h('a', {href: '/orders', class: 'chip' + (status ? '' : ' active')},
		'전체 ', h('span', {class: 'count'}, data.total)));
	for (const s of data.statuses) {
		filters.append(h('a', {href: '/orders?status=' + s.name, class: 'chip' + (status === s.name ? ' active' : '')},
			h('span', null, s.label), ' ', h('span', {class: 'count'}, data.counts[s.name])));
	}

	const rows = document.getElementById('rows');
	for (const o of data.orders) {
		const over = o.dueDays != null && o.totalDays > o.dueDays;
		const tr = h('tr', {class: 'clickable'},
			h('td', null, h('a', {href: '/orders/' + o.id}, '#' + o.id)),
			h('td', null, o.confirmedAt),
			h('td', {class: 'num'}, fmt(o.totalK)),
			h('td', null, o.routeLabel),
			h('td', {class: 'num' + (over ? ' over-due' : '')}, o.totalDays),
			h('td', {class: 'num' + (over ? ' over-due' : '')}, o.dueDays != null ? o.dueDays : '-'),
			h('td', {class: 'num'}, o.totalCostEok),
			h('td', null, h('span', {class: 'badge badge-' + o.status}, o.statusLabel)),
			h('td', null, o.createdBy));
		tr.addEventListener('click', () => {
			location.href = '/orders/' + o.id;
		});
		rows.append(tr);
	}
	if (data.orders.length === 0) {
		rows.append(h('tr', null, h('td', {colspan: '9', class: 'empty'}, '주문이 없습니다.')));
	}
})();
