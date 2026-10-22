document.getElementById('loginForm').addEventListener('submit', async e => {
	e.preventDefault();
	const err = document.getElementById('loginError');
	const res = await fetch('/login', {method: 'POST', body: new URLSearchParams(new FormData(e.target))});
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
