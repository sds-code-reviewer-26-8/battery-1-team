package com.example.demo.controller;

import com.example.demo.entity.Country;
import com.example.demo.service.BusinessException;
import com.example.demo.service.SimulationService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
public class SimulationController {

	public record SimulateRequest(Map<Country, Integer> orders) {
	}

	private final SimulationService service;

	public SimulationController(SimulationService service) {
		this.service = service;
	}

	@PostMapping("/api/simulate")
	@ResponseBody
	public ResponseEntity<?> simulate(@RequestBody SimulateRequest request) {
		try {
			return ResponseEntity.ok(service.simulate(request.orders()));
		} catch (BusinessException e) {
			return ApiErrors.of(e);
		}
	}
}
