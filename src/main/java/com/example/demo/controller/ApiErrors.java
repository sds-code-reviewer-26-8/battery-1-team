package com.example.demo.controller;

import com.example.demo.service.BusinessException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/** JSON API 컨트롤러가 함께 쓰는 오류 응답 */
final class ApiErrors {

	private ApiErrors() {
	}

	/** 서버가 처리할 수 없는 상태(저장된 데이터가 깨진 경우 등) */
	static ResponseEntity<Map<String, Object>> serverError(String message) {
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", message, "conflict", false));
	}

	static ResponseEntity<Map<String, Object>> of(BusinessException e) {
		HttpStatus status = e.isConflict() ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
		return ResponseEntity.status(status).body(Map.of("error", e.getMessage(), "conflict", e.isConflict()));
	}
}
