package com.example.demo.controller;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.service.BusinessException;
import com.example.demo.service.MemberService;
import jakarta.servlet.http.HttpSession;
import java.net.URI;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
public class AuthController {

	private final MemberService memberService;

	public AuthController(MemberService memberService) {
		this.memberService = memberService;
	}

	@GetMapping("/")
	public String home() {
		return "redirect:/orders";
	}

	@GetMapping("/login")
	public String loginForm(HttpSession session) {
		if (session.getAttribute(LoginInterceptor.SESSION_USER) != null) {
			return "redirect:/orders";
		}
		return "forward:/pages/login.html";
	}

	/** 로그인 화면(JS)이 폼 값으로 호출한다. 성공하면 /orders 로 이동시키고, 실패하면 이유를 JSON 으로 돌려준다. */
	@PostMapping("/login")
	@ResponseBody
	public ResponseEntity<?> login(@RequestParam String username, @RequestParam String password,
			HttpSession session) {
		if (memberService.authenticate(username, password)) {
			session.setAttribute(LoginInterceptor.SESSION_USER, username);
			return ResponseEntity.status(HttpStatus.FOUND).location(URI.create("/orders")).build();
		}
		return ResponseEntity.ok(Map.of("error", "아이디 또는 비밀번호가 올바르지 않습니다"));
	}

	@GetMapping("/signup")
	public String signupForm(HttpSession session) {
		if (session.getAttribute(LoginInterceptor.SESSION_USER) != null) {
			return "redirect:/orders";
		}
		return "forward:/pages/signup.html";
	}

	/** 가입만 한다(자동 로그인 없음). 거부 사유는 400 JSON 으로 돌려준다. */
	@PostMapping("/signup")
	@ResponseBody
	public ResponseEntity<?> signup(@RequestParam String username, @RequestParam String password) {
		try {
			memberService.signup(username, password);
		} catch (BusinessException e) {
			return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
		}
		return ResponseEntity.status(HttpStatus.CREATED).build();
	}

	@PostMapping("/logout")
	@ResponseBody
	public ResponseEntity<Void> logout(HttpSession session) {
		session.invalidate();
		return ResponseEntity.noContent().build();
	}

	/** 모든 화면 상단에 로그인한 아이디를 보여 주기 위한 정보 */
	@GetMapping("/api/me")
	@ResponseBody
	public Map<String, String> me(HttpSession session) {
		return Map.of("loginUser", (String) session.getAttribute(LoginInterceptor.SESSION_USER));
	}
}
