package com.example.demo.service;

import com.example.demo.entity.Member;
import com.example.demo.repository.MemberRepository;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.spec.KeySpec;
import java.util.Base64;
import java.util.regex.Pattern;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 회원가입과 로그인 검증. 비밀번호는 PBKDF2 솔트 해시로 저장하고 평문은 남기지 않는다. */
@Service
public class MemberService {

	public static final String ADMIN = "admin";
	static final int MIN_PASSWORD_LENGTH = 4;
	private static final Pattern USERNAME = Pattern.compile("[A-Za-z0-9_]{3,20}");
	private static final int ITERATIONS = 120_000;
	private static final SecureRandom RANDOM = new SecureRandom();

	private final MemberRepository members;

	public MemberService(MemberRepository members) {
		this.members = members;
	}

	@Transactional
	public void signup(String username, String password) {
		String name = username == null ? "" : username.trim();
		if (!USERNAME.matcher(name).matches()) {
			throw new BusinessException("아이디는 영문, 숫자, _ 로 3~20자여야 합니다");
		}
		if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
			throw new BusinessException("비밀번호는 " + MIN_PASSWORD_LENGTH + "자 이상이어야 합니다");
		}
		if (ADMIN.equalsIgnoreCase(name) || members.existsByUsername(name)) {
			throw new BusinessException("이미 사용 중인 아이디입니다");
		}
		byte[] salt = new byte[16];
		RANDOM.nextBytes(salt);
		try {
			members.saveAndFlush(new Member(name, Base64.getEncoder().encodeToString(salt), hash(password, salt)));
		} catch (DataIntegrityViolationException e) {
			throw new BusinessException("이미 사용 중인 아이디입니다");
		}
	}

	/** admin/admin 이거나 가입한 회원이면 true */
	@Transactional(readOnly = true)
	public boolean authenticate(String username, String password) {
		if (username == null || password == null) {
			return false;
		}
		if (ADMIN.equals(username) && ADMIN.equals(password)) {
			return true;
		}
		return members.findByUsername(username).map(m -> {
			String actual = hash(password, Base64.getDecoder().decode(m.getSalt()));
			return MessageDigest.isEqual(actual.getBytes(StandardCharsets.UTF_8),
					m.getPasswordHash().getBytes(StandardCharsets.UTF_8));
		}).orElse(false);
	}

	private static String hash(String password, byte[] salt) {
		try {
			KeySpec spec = new PBEKeySpec(password.toCharArray(), salt, ITERATIONS, 256);
			byte[] h = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
			return Base64.getEncoder().encodeToString(h);
		} catch (GeneralSecurityException e) {
			throw new IllegalStateException("비밀번호 해시를 만들지 못했습니다", e);
		}
	}
}
