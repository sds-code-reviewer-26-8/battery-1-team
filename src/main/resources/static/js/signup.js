document.getElementById('signupForm').addEventListener('submit', async e => {
	e.preventDefault();
	const err = document.getElementById('signupError');
	let res;
	try {
		res = await fetch('/signup', {method: 'POST', body: new URLSearchParams(new FormData(e.target))});
	} catch (x) {
		err.textContent = '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요';
		err.hidden = false;
		return;
	}
	if (res.ok) {
		alert('가입되었습니다. 로그인해 주세요');
		location.href = '/login';
		return;
	}
	let data = null;
	try {
		data = await res.json();
	} catch (x) { /* 본문 없음 */ }
	err.textContent = (data && data.error) || '회원가입에 실패했습니다';
	err.hidden = false;
});
