document.getElementById('loginForm').addEventListener('submit', async e => {
	e.preventDefault();
	const err = document.getElementById('loginError');
	let res;
	try {
		res = await fetch('/login', {method: 'POST', body: new URLSearchParams(new FormData(e.target))});
	} catch (x) {
		err.textContent = '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요';
		err.hidden = false;
		return;
	}
	if (res.redirected) {
		location.href = '/orders';
		return;
	}
	let data = null;
	try {
		data = await res.json();
	} catch (x) { /* 본문 없음 */ }
	err.textContent = (data && data.error) || '로그인에 실패했습니다';
	err.hidden = false;
});
