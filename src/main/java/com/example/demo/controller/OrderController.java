package com.example.demo.controller;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.entity.Country;
import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatus;
import com.example.demo.service.BusinessException;
import com.example.demo.service.MasterService;
import com.example.demo.service.OrderService;
import jakarta.servlet.http.HttpSession;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class OrderController {

	public record ConfirmRequest(Map<Country, Integer> orders, String routeType, long masterVersion, String memo) {
	}

	private final OrderService service;
	private final MasterService masterService;

	public OrderController(OrderService service, MasterService masterService) {
		this.service = service;
		this.masterService = masterService;
	}

	@GetMapping("/orders")
	public String list(@RequestParam(required = false) OrderStatus status, Model model) {
		model.addAttribute("orders", service.listOrders(status));
		model.addAttribute("counts", service.countByStatus());
		model.addAttribute("status", status);
		model.addAttribute("statuses", OrderStatus.values());
		model.addAttribute("total", service.listOrders(null).size());
		return "orders";
	}

	@GetMapping("/orders/new")
	public String newOrder(Model model) {
		model.addAttribute("master", masterService.currentMaster());
		return "order-new";
	}

	@GetMapping("/orders/{id}")
	public String detail(@PathVariable Long id, Model model) {
		Order order = service.getOrder(id);
		model.addAttribute("order", order);
		model.addAttribute("history", service.history(id));
		return "order-detail";
	}

	@PostMapping("/orders/{id}/status")
	public String changeStatus(@PathVariable Long id, @RequestParam OrderStatus status, @RequestParam long version,
			HttpSession session, RedirectAttributes redirect) {
		try {
			service.changeStatus(id, status, version, (String) session.getAttribute(LoginInterceptor.SESSION_USER));
			redirect.addFlashAttribute("message", "상태를 '" + status.getLabel() + "'(으)로 바꿨습니다");
		} catch (BusinessException e) {
			redirect.addFlashAttribute("error", e.getMessage());
		}
		return "redirect:/orders/" + id;
	}

	@PostMapping("/api/orders")
	@ResponseBody
	public ResponseEntity<?> confirm(@RequestBody ConfirmRequest request, HttpSession session) {
		try {
			Order order = service.confirm(request.orders(), request.routeType(), request.masterVersion(),
					request.memo(), (String) session.getAttribute(LoginInterceptor.SESSION_USER));
			return ResponseEntity.ok(Map.of("id", order.getId()));
		} catch (BusinessException e) {
			return ApiErrors.of(e);
		}
	}
}
