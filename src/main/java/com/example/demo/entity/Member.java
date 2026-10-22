package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 회원가입으로 만든 계정. 역할 구분 없이 로그인하면 admin 과 같은 권한을 가진다. 비밀번호는 솔트 해시로만 저장한다. */
@Entity
@Table(name = "member")
public class Member {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true, length = 20)
	private String username;

	@Column(nullable = false)
	private String salt;

	@Column(nullable = false)
	private String passwordHash;

	protected Member() {
	}

	public Member(String username, String salt, String passwordHash) {
		this.username = username;
		this.salt = salt;
		this.passwordHash = passwordHash;
	}

	public String getUsername() {
		return username;
	}

	public String getSalt() {
		return salt;
	}

	public String getPasswordHash() {
		return passwordHash;
	}
}
