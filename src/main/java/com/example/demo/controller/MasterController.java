package com.example.demo.controller;

import com.example.demo.entity.Country;
import com.example.demo.service.BusinessException;
import com.example.demo.service.MasterService;
import com.example.demo.simulation.Master;
import java.math.BigDecimal;
import java.net.URI;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
public class MasterController {

	private final MasterService service;

	public MasterController(MasterService service) {
		this.service = service;
	}

	@GetMapping("/master")
	public String master() {
		return "forward:/pages/master.html";
	}

	/** 마스터 화면(JS)이 폼 값으로 호출한다. 성공하면 /master 로 이동시키고, 잘못된 값이 있으면 이유를 JSON 으로 돌려준다. */
	@PostMapping("/master")
	@ResponseBody
	public ResponseEntity<?> saveMaster(@RequestParam Map<String, String> form) {
		try {
			service.updateMaster(form);
		} catch (BusinessException e) {
			return ResponseEntity.ok(Map.of("errors", e.getMessages()));
		}
		return ResponseEntity.status(HttpStatus.FOUND).location(URI.create("/master")).build();
	}

	@GetMapping("/api/master")
	@ResponseBody
	public Master masterJson() {
		return service.currentMaster();
	}

	/** 화면 입력칸 구성: 공장·나라 목록과 입력칸 이름 → 값 */
	@GetMapping("/api/master/form")
	@ResponseBody
	public Map<String, Object> masterForm() {
		return Map.of(
				"form", toForm(service.currentMaster()),
				"factories", Country.factories().stream().map(MasterController::option).toList(),
				"countries", Arrays.stream(Country.values()).map(MasterController::option).toList());
	}

	private static Map<String, String> option(Country c) {
		return Map.of("name", c.name(), "label", c.getLabel());
	}

	/** 화면 입력칸 이름 → 값 */
	private static Map<String, String> toForm(Master m) {
		Map<String, String> form = new HashMap<>();
		for (Master.FactoryParam f : m.factories()) {
			form.put("maxDaily_" + f.country(), String.valueOf(f.maxDaily()));
			form.put("stockLimit_" + f.country(), String.valueOf(f.stockLimit()));
			form.put("unitCost_" + f.country(), String.valueOf(f.unitCost()));
		}
		for (Master.RouteParam r : m.routes()) {
			form.put(MasterService.routeKey(r.from(), r.to()), String.valueOf(r.days()));
		}
		form.put("shipCount", String.valueOf(m.shipCount()));
		form.put("shipDailyCost", new BigDecimal(m.shipDailyCostWon())
				.divide(BigDecimal.valueOf(MasterService.WON_PER_EOK)).stripTrailingZeros().toPlainString());
		return form;
	}
}
