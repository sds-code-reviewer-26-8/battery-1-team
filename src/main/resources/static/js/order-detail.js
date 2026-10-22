(() => {
	const id = location.pathname.split('/').pop();
	const flash = document.getElementById('flash');
	const content = document.getElementById('content');
	let planShown = false;

	function showFlash(message, error) {
		flash.replaceChildren();
		if (message) flash.append(h('p', {class: 'alert ok'}, message));
		if (error) flash.append(h('p', {class: 'alert error'}, error));
	}

	async function act(url, body) {
		let message = null, error = null;
		try {
			const res = await postJson(url, body);
			message = res.message;
		} catch (e) {
			error = e.message;
		}
		await load(message, error);
	}

	const changeStatus = (status, version) => act('/api/orders/' + id + '/status', {status, version});
	const changeCustomer = (customerName, version) => act('/api/orders/' + id + '/customer', {customerName, version});

	function render(o) {
		document.getElementById('orderId').textContent = '#' + o.id;
		document.getElementById('orderBadge').className = 'badge badge-' + o.status;
		document.getElementById('orderBadge').textContent = o.statusLabel;

		const meta = (label, value) => h('div', null, h('dt', null, label), h('dd', null, value));
		document.getElementById('meta').replaceChildren(
			meta('확정 일시', o.confirmedAt), meta('작성자', o.createdBy), meta('경로', o.routeLabel),
			meta('고객사', o.customerName != null ? o.customerName : '-'),
			meta('메모', o.memo != null ? o.memo : '-'));

		const customerForm = document.getElementById('customerForm');
		customerForm.hidden = !o.editable;
		const customerInput = document.getElementById('customerName');
		customerInput.value = o.customerName != null ? o.customerName : '';
		customerForm.onsubmit = e => {
			e.preventDefault();
			changeCustomer(customerInput.value, o.version);
		};

		const actions = document.getElementById('actions');
		actions.replaceChildren();
		actions.hidden = o.next.length === 0;
		document.getElementById('finalNote').hidden = o.editable;
		for (const s of o.next) {
			const form = h('form', {method: 'post', class: 'status-form'},
				h('button', {type: 'submit', class: s.name === 'CANCELED' ? 'danger' : 'primary'}, s.label + '(으)로 변경'));
			form.addEventListener('submit', e => {
				e.preventDefault();
				if (!confirm(s.label + '(으)로 바꿉니다. 계속할까요?')) return;
				changeStatus(s.name, o.version);
			});
			actions.append(form);
		}

		document.getElementById('history').replaceChildren(...o.history.map(r => h('tr', null,
			h('td', null, r.changedAt), h('td', null, r.fromLabel != null ? r.fromLabel : '-'),
			h('td', null, r.toLabel), h('td', null, r.changedBy))));

		if (!planShown) {
			planShown = true;
			PlanView.renderSummary(document.getElementById('summary'), o.plan);
			PlanView.renderDetails(document.getElementById('details'), o.plan);
			BatteryAnim.mount(document.getElementById('anim'), o.plan, {autoplay: false});
		}
	}

	async function load(message, error) {
		try {
			render(await getJson('/api/orders/' + id));
			content.hidden = false;
			showFlash(message, error);
		} catch (e) {
			content.hidden = true;
			showFlash(message, error || e.message);
		}
	}

	load();
})();
