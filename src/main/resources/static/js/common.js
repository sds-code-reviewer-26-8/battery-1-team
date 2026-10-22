const COUNTRY_LABEL = {KOREA: '한국', CHINA: '중국', JAPAN: '일본', VIETNAM: '베트남', INDONESIA: '인도네시아'};
const FACTORY_ORDER = ['CHINA', 'JAPAN', 'VIETNAM', 'INDONESIA'];

/** 천 단위 쉼표 */
const fmt = n => Number(n).toLocaleString('ko-KR');

/** 원 → 억원(소수 2자리) */
const eok = won => (won / 1e8).toFixed(2);

/** JSON 요청. 실패하면 서버가 준 이유(error)를 담은 Error 를 던진다. */
async function postJson(url, body) {
	const res = await fetch(url, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(body)
	});
	let data = null;
	try {
		data = await res.json();
	} catch (e) { /* 본문 없음 */ }
	if (res.status === 401) {
		location.href = '/login';
		throw new Error('로그인이 필요합니다');
	}
	if (!res.ok) {
		const err = new Error((data && data.error) || '요청에 실패했습니다');
		err.conflict = !!(data && data.conflict);
		throw err;
	}
	return data;
}

/** JSON 조회. 실패하면 서버가 준 이유(error)를 담은 Error 를 던진다. */
async function getJson(url) {
	const res = await fetch(url);
	let data = null;
	try {
		data = await res.json();
	} catch (e) { /* 본문 없음 */ }
	if (res.status === 401) {
		location.href = '/login';
		throw new Error('로그인이 필요합니다');
	}
	if (!res.ok) {
		throw new Error((data && data.error) || '요청에 실패했습니다');
	}
	return data;
}

/** 요소 만들기. 글자는 textContent 로만 넣는다(서버 값을 HTML 로 해석하지 않는다). */
function h(tag, attrs, ...children) {
	const e = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs || {})) {
		if (v === false || v == null) continue;
		if (k === 'class') e.className = v;
		else e.setAttribute(k, v);
	}
	for (const c of children.flat()) {
		if (c == null || c === false) continue;
		e.append(c instanceof Node ? c : document.createTextNode(String(c)));
	}
	return e;
}

/** 공통 머리말: 상단 메뉴와 로그인 사용자. active 는 orders / new / master */
function renderHeader(active) {
	const link = (href, key, text) => h('a', {href, class: active === key ? 'active' : null}, text);
	const userName = h('span');
	const logoutBtn = h('button', {type: 'submit', class: 'link'}, '로그아웃');
	const logoutForm = h('form', {method: 'post', action: '/logout'}, logoutBtn);
	logoutForm.addEventListener('submit', async e => {
		e.preventDefault();
		try {
			await fetch('/logout', {method: 'POST'});
		} catch (x) {
			alert('로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요');
			return;
		}
		location.href = '/login';
	});
	const header = h('header', {class: 'topbar'},
		h('a', {class: 'brand', href: '/orders'}, '배터리 주문 관리'),
		h('nav', null, link('/orders', 'orders', '주문 목록'), link('/orders/new', 'new', '주문 추가'),
			link('/master', 'master', '마스터 데이터')),
		h('div', {class: 'user'}, userName, logoutForm));
	document.body.prepend(header);
	getJson('/api/me').then(me => {
		userName.textContent = me.loginUser;
	}).catch(() => { /* 401 이면 getJson 이 로그인 화면으로 보낸다 */ });
}
