package com.example.demo.controller;

import com.example.demo.service.BusinessException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/** JSON API 컨트롤러가 함께 쓰는 오류 응답 */
final class ApiErrors {

	private ApiErrors() {
	}

	static ResponseEntity<Map<String, Object>> of(BusinessException e) {
		HttpStatus status = e.isConflict() ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
		return ResponseEntity.status(status).body(Map.of("error", e.getMessage(), "conflict", e.isConflict()));
	}
}
