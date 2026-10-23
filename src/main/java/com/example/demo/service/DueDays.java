package com.example.demo.service;

/** 납기일 규칙의 단일 출처. 화면은 조회 API 로 이 값을 받아 쓴다. */
public final class DueDays {

	public static final int MIN = 5;
	public static final int MAX = 50;
	public static final String MESSAGE = "납기일은 %d일 이상 %d일 이하의 정수로 입력하세요.".formatted(MIN, MAX);

	private DueDays() {
	}

	public static boolean inRange(int days) {
		return days >= MIN && days <= MAX;
	}
}
